import { Runtime } from './runtime.js';
import type { RuntimeOptions, ConversionRuntime } from './types.js';
import type { WorkerFactory } from './protocol.js';

export * from './types.js';

// Resolve the directory at runtime: Webpack treats a URL relative to
// import.meta.url as an asset import, but './' is not an asset to bundle.
const defaultAssetBaseURL = new URL('./', new URL(import.meta.url));

const createWorker: WorkerFactory = (url) => {
  // Worker entry URLs must share the document origin; module imports can use CORS.
  const bootstrapURL =
    url.origin !== location.origin && /^https?:$/.test(url.protocol)
      ? URL.createObjectURL(
          new Blob([`import ${JSON.stringify(url.href)};`], {
            type: 'text/javascript'
          })
        )
      : undefined;
  let worker: Worker;
  try {
    worker = new Worker(bootstrapURL ?? url, {
      type: 'module',
      name: 'imgly-pdf-conversion'
    });
  } catch (error) {
    if (bootstrapURL) URL.revokeObjectURL(bootstrapURL);
    throw error;
  }
  return {
    postMessage: (message) => worker.postMessage(message),
    onMessage: (callback) =>
      worker.addEventListener('message', (event) => callback(event.data)),
    onError: (callback) => {
      worker.addEventListener('error', (event) =>
        callback(
          new Error(event.message || 'Worker script could not be loaded')
        )
      );
      worker.addEventListener('messageerror', () =>
        callback(new Error('Could not decode worker response'))
      );
    },
    terminate: () => {
      worker.terminate();
      if (bootstrapURL) URL.revokeObjectURL(bootstrapURL);
    }
  };
};

export function createConversionRuntime(
  options: RuntimeOptions = {}
): ConversionRuntime {
  return new Runtime(
    createWorker,
    defaultAssetBaseURL,
    'worker.browser.js',
    options
  );
}

let defaultRuntime: Runtime | undefined;

export function getDefaultConversionRuntime(): ConversionRuntime {
  if (!defaultRuntime || defaultRuntime.disposed) {
    defaultRuntime = new Runtime(
      createWorker,
      defaultAssetBaseURL,
      'worker.browser.js',
      {}
    );
  }
  return defaultRuntime;
}
