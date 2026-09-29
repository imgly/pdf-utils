import {
  ConversionError,
  type ConversionJob,
  type ConversionResult,
  type ConversionRuntime,
  type OperationOptions,
  type RunOptions,
  type RuntimeInfo,
  type RuntimeOptions
} from './types.js';
import type {
  WorkerAdapter,
  WorkerFactory,
  WorkerResponse
} from './protocol.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 2 ** 31 - 1;
const DEFAULT_OUTPUT_BYTES = 100 * 1024 * 1024;

interface Operation {
  id: number;
  job?: ConversionJob;
  options: RunOptions;
  resolve(value: RuntimeInfo | ConversionResult): void;
  reject(error: ConversionError): void;
  removeAbortListener(): void;
  timer?: ReturnType<typeof setTimeout>;
}

function positiveNumber(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ConversionError(
      `${name} must be a positive safe integer`,
      'INVALID_INPUT'
    );
  }
}

function validTimeout(value: number): void {
  positiveNumber(value, 'timeoutMs');
  if (value > MAX_TIMEOUT_MS) {
    throw new ConversionError(
      `timeoutMs must not exceed ${MAX_TIMEOUT_MS}`,
      'INVALID_INPUT'
    );
  }
}

function validBasename(name: string): boolean {
  return (
    /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name) && name !== '.' && name !== '..'
  );
}

export class Runtime implements ConversionRuntime {
  private readonly assetBaseURL: URL;
  private readonly workerURL: URL;
  private readonly timeoutMs: number;
  private worker?: WorkerAdapter;
  private active?: Operation;
  private queue: Operation[] = [];
  private nextId = 0;
  disposed = false;

  constructor(
    private readonly createWorker: WorkerFactory,
    defaultAssetBaseURL: URL,
    workerFilename: string,
    options: RuntimeOptions
  ) {
    this.assetBaseURL = new URL(
      options.assetBaseURL ?? defaultAssetBaseURL,
      defaultAssetBaseURL
    );
    if (!this.assetBaseURL.pathname.endsWith('/'))
      this.assetBaseURL.pathname += '/';
    this.workerURL = new URL(
      options.workerURL ?? workerFilename,
      this.assetBaseURL
    );
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    validTimeout(this.timeoutMs);
  }

  preload(options: OperationOptions = {}): Promise<RuntimeInfo> {
    return this.enqueue(undefined, options);
  }

  async run(
    job: ConversionJob,
    options: RunOptions = {}
  ): Promise<ConversionResult> {
    if (
      !job ||
      !job.files ||
      !Array.isArray(job.args) ||
      !job.args.every(
        (arg) => typeof arg === 'string' && !arg.includes('\0')
      ) ||
      !Array.isArray(job.outputFiles) ||
      job.outputFiles.length === 0 ||
      !job.outputFiles.every(validBasename) ||
      new Set(job.outputFiles).size !== job.outputFiles.length ||
      !Object.entries(job.files).every(
        ([name, data]) =>
          validBasename(name) &&
          (typeof data === 'string' || data instanceof Uint8Array)
      ) ||
      job.outputFiles.some((name) => Object.hasOwn(job.files, name))
    ) {
      throw new ConversionError(
        'Invalid conversion job: use distinct input/output basenames under /work/',
        'INVALID_INPUT'
      );
    }
    // Copy at enqueue time so later caller mutations cannot change a queued document.
    const files = Object.fromEntries(
      Object.entries(job.files).map(([name, data]) => [
        name,
        typeof data === 'string' ? data : new Uint8Array(data)
      ])
    );
    return this.enqueue(
      { files, args: [...job.args], outputFiles: [...job.outputFiles] },
      options
    ) as Promise<ConversionResult>;
  }

  private enqueue(
    job: ConversionJob | undefined,
    options: RunOptions
  ): Promise<RuntimeInfo | ConversionResult> {
    return new Promise((resolve, reject) => {
      if (this.disposed) {
        reject(
          new ConversionError(
            'Conversion runtime has been disposed',
            'DISPOSED'
          )
        );
        return;
      }
      if (options.signal?.aborted) {
        reject(new ConversionError('Conversion was aborted', 'ABORTED'));
        return;
      }
      validTimeout(options.timeoutMs ?? this.timeoutMs);
      positiveNumber(
        options.maxOutputBytes ?? DEFAULT_OUTPUT_BYTES,
        'maxOutputBytes'
      );
      const operation: Operation = {
        id: ++this.nextId,
        job,
        options: { ...options },
        resolve,
        reject,
        removeAbortListener: () =>
          options.signal?.removeEventListener('abort', abort)
      };
      const abort = () => {
        if (this.active === operation) {
          this.failActive(
            new ConversionError('Conversion was aborted', 'ABORTED'),
            true
          );
        } else {
          this.queue = this.queue.filter((item) => item !== operation);
          operation.removeAbortListener();
          operation.reject(
            new ConversionError('Conversion was aborted', 'ABORTED')
          );
        }
      };
      options.signal?.addEventListener('abort', abort, { once: true });
      this.queue.push(operation);
      this.pump();
    });
  }

  private pump(): void {
    if (this.active || this.disposed) return;
    const operation = this.queue.shift();
    if (!operation) {
      this.worker?.unref?.();
      return;
    }
    this.active = operation;
    const timeoutMs = operation.options.timeoutMs ?? this.timeoutMs;
    operation.timer = setTimeout(() => {
      this.failActive(
        new ConversionError(
          `Conversion timed out after ${timeoutMs}ms`,
          'TIMEOUT'
        ),
        true
      );
    }, timeoutMs);
    try {
      if (!this.worker) {
        const worker = this.createWorker(this.workerURL);
        this.worker = worker;
        worker.onMessage((message) => {
          if (this.worker === worker) this.receive(message);
        });
        worker.onError((error) => {
          if (this.worker === worker) {
            this.failActive(
              new ConversionError(
                `Conversion worker failed: ${error.message}`,
                'WORKER_FAILED'
              ),
              true
            );
          }
        });
      }
      this.worker.ref?.();
      this.worker.postMessage({
        id: operation.id,
        assetBaseURL: this.assetBaseURL.href,
        job: operation.job,
        maxOutputBytes: operation.options.maxOutputBytes ?? DEFAULT_OUTPUT_BYTES
      });
    } catch (error) {
      this.failActive(
        new ConversionError(
          `Could not start conversion worker: ${String(error)}`,
          'WORKER_FAILED'
        ),
        true
      );
    }
  }

  private receive(message: WorkerResponse): void {
    if (!this.active || message.id !== this.active.id) return;
    if ('error' in message) {
      const { message: detail, code, diagnostics, exitCode } = message.error;
      this.failActive(
        new ConversionError(detail, code, diagnostics, exitCode),
        code === 'LOAD_FAILED' || code === 'WORKER_FAILED'
      );
      return;
    }
    const operation = this.finishActive();
    operation?.resolve(message.result);
    this.pump();
  }

  private finishActive(): Operation | undefined {
    const operation = this.active;
    this.active = undefined;
    if (operation) {
      clearTimeout(operation.timer);
      operation.removeAbortListener();
    }
    return operation;
  }

  private failActive(error: ConversionError, terminate: boolean): void {
    if (terminate) this.stopWorker();
    this.finishActive()?.reject(error);
    this.pump();
  }

  private stopWorker(): void {
    const worker = this.worker;
    this.worker = undefined;
    worker?.terminate();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopWorker();
    const error = new ConversionError(
      'Conversion runtime has been disposed',
      'DISPOSED'
    );
    this.finishActive()?.reject(error);
    for (const operation of this.queue) {
      operation.removeAbortListener();
      operation.reject(error);
    }
    this.queue = [];
  }
}
