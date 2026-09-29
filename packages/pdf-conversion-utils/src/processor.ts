import {
  ConversionError,
  type ConversionResult,
  type RuntimeInfo
} from './types.js';
import type { WorkerRequest, WorkerResponse } from './protocol.js';

interface GhostscriptModule {
  callMain(args: string[]): number;
  FS: {
    mkdir(path: string): void;
    writeFile(path: string, data: Uint8Array | string): void;
    readFile(path: string): Uint8Array;
    stat(path: string): { size: number };
  };
}

export interface RuntimeAssets {
  module: WebAssembly.Module;
  version: string;
  factory(options: {
    instantiateWasm(
      imports: WebAssembly.Imports,
      receive: (instance: WebAssembly.Instance) => void
    ): WebAssembly.Exports;
    print(message: string): void;
    printErr(message: string): void;
  }): Promise<GhostscriptModule>;
}

const MAX_DIAGNOSTIC_BYTES = 64 * 1024;

function restoreRuntimeGlobals(previous: PropertyDescriptorMap): void {
  // The bundled Emscripten factory installs diagnostic getters that retain its
  // instance. It runs alone in this serial worker; own only its new getters and
  // the two legacy aliases it overwrites, leaving other globals untouched.
  for (const [name, descriptor] of Object.entries(
    Object.getOwnPropertyDescriptors(globalThis)
  )) {
    if (!descriptor.configurable || !descriptor.get) {
      continue;
    }
    if (Object.hasOwn(previous, name)) {
      if (
        (name === 'buffer' || name === 'asm') &&
        descriptor.get !== previous[name].get
      ) {
        Object.defineProperty(globalThis, name, previous[name]);
      }
    } else if (!descriptor.enumerable && !descriptor.set) {
      Reflect.deleteProperty(globalThis, name);
    }
  }
}

export function createProcessor(
  loadAssets: (baseURL: URL) => Promise<RuntimeAssets>
) {
  let assets: Promise<RuntimeAssets> | undefined;

  async function execute(
    request: WorkerRequest
  ): Promise<RuntimeInfo | ConversionResult> {
    assets ??= loadAssets(new URL(request.assetBaseURL)).catch((error) => {
      assets = undefined;
      throw new ConversionError(
        `Could not load Ghostscript: ${String(error)}`,
        'LOAD_FAILED'
      );
    });
    const loaded = await assets;
    if (!request.job) return { version: loaded.version };

    const diagnostics: string[] = [];
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let diagnosticBytes = 0;
    const capture = (message: string) => {
      const remaining = MAX_DIAGNOSTIC_BYTES - diagnosticBytes;
      if (remaining <= 0) return;
      const text = String(message);
      if (text.length === 0) return;
      const bytes = new Uint8Array(Math.min(remaining, text.length * 3));
      const { written, read } = encoder.encodeInto(text, bytes);
      diagnostics.push(decoder.decode(bytes.subarray(0, written)));
      diagnosticBytes += read < text.length ? remaining : written;
    };

    const previousGlobals = Object.getOwnPropertyDescriptors(globalThis);
    let module: GhostscriptModule | undefined;
    try {
      module = await loaded.factory({
        instantiateWasm(imports, receive) {
          const instance = new WebAssembly.Instance(loaded.module, imports);
          receive(instance);
          return instance.exports;
        },
        print: capture,
        printErr: capture
      });
      module.FS.mkdir('/work');
      for (const [name, data] of Object.entries(request.job.files)) {
        module.FS.writeFile(`/work/${name}`, data);
      }
      // The generated callMain mutates argv, so never give it the request's array.
      const exitCode = module.callMain([...request.job.args]);
      if (exitCode !== 0) {
        throw new ConversionError(
          `Ghostscript conversion failed with exit code ${exitCode}`,
          'CONVERSION_FAILED',
          diagnostics,
          exitCode
        );
      }

      let outputBytes = 0;
      for (const name of request.job.outputFiles) {
        const size = module.FS.stat(`/work/${name}`).size;
        if (size === 0) {
          throw new ConversionError(
            `Ghostscript produced an empty output: ${name}`,
            'CONVERSION_FAILED',
            diagnostics
          );
        }
        outputBytes += size;
        if (outputBytes > request.maxOutputBytes) {
          throw new ConversionError(
            `Conversion output exceeds ${request.maxOutputBytes} bytes`,
            'OUTPUT_LIMIT',
            diagnostics
          );
        }
      }
      const files = Object.fromEntries(
        request.job.outputFiles.map((name) => [
          name,
          module!.FS.readFile(`/work/${name}`)
        ])
      );
      return { files, version: loaded.version, diagnostics };
    } catch (error) {
      if (error instanceof ConversionError) throw error;
      throw new ConversionError(
        `Ghostscript conversion failed: ${String(error)}`,
        'CONVERSION_FAILED',
        diagnostics
      );
    } finally {
      // Release the entire instance, including files outside /work created by PostScript.
      restoreRuntimeGlobals(previousGlobals);
      module = undefined;
    }
  }

  // A caller can post messages while initialization awaits; keep the worker serial too.
  let queue = Promise.resolve();
  return (
    request: WorkerRequest,
    send: (response: WorkerResponse, transfers?: ArrayBuffer[]) => void
  ) => {
    queue = queue.then(async () => {
      try {
        const result = await execute(request);
        const transfers =
          'files' in result
            ? Object.values(result.files).map(
                (data) => data.buffer as ArrayBuffer
              )
            : [];
        send({ id: request.id, result }, transfers);
      } catch (error) {
        const failure =
          error instanceof ConversionError
            ? error
            : new ConversionError(String(error), 'WORKER_FAILED');
        send({
          id: request.id,
          error: {
            message: failure.message,
            code: failure.code,
            diagnostics: failure.diagnostics,
            exitCode: failure.exitCode
          }
        });
      }
    });
  };
}
