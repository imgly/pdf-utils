import { Worker } from 'node:worker_threads';
import { Runtime } from './runtime.js';
import type { RuntimeOptions, ConversionRuntime } from './types.js';
import type { WorkerFactory } from './protocol.js';

export * from './types.js';

const createWorker: WorkerFactory = (url) => {
  // --input-type rejects file entries. An inline module preserves inherited VM
  // options, including flags Node accepts only through default inheritance.
  const workerURL = process.execArgv.some(
    (argument) =>
      argument === '--input-type' || argument.startsWith('--input-type=')
  )
    ? new URL(
        `data:text/javascript,${encodeURIComponent(
          `import ${JSON.stringify(url.href)};`
        )}`
      )
    : url;
  const worker = new Worker(workerURL, { name: 'imgly-pdf-conversion' });
  let terminating = false;
  return {
    postMessage: (message) => worker.postMessage(message),
    onMessage: (callback) => {
      worker.on('message', callback);
    },
    onError: (callback) => {
      worker.on('error', callback);
      worker.on('messageerror', callback);
      worker.on('exit', (code) => {
        if (!terminating)
          callback(
            new Error(`Conversion worker exited unexpectedly (${code})`)
          );
      });
    },
    terminate: () => {
      terminating = true;
      void worker.terminate();
    },
    ref: () => worker.ref(),
    unref: () => worker.unref()
  };
};

export function createConversionRuntime(
  options: RuntimeOptions = {}
): ConversionRuntime {
  return new Runtime(
    createWorker,
    new URL('./', import.meta.url),
    'worker.node.js',
    options
  );
}

let defaultRuntime: Runtime | undefined;

export function getDefaultConversionRuntime(): ConversionRuntime {
  if (!defaultRuntime || defaultRuntime.disposed) {
    defaultRuntime = new Runtime(
      createWorker,
      new URL('./', import.meta.url),
      'worker.node.js',
      {}
    );
  }
  return defaultRuntime;
}
