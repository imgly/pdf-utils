import { ghostscriptVersion } from './wasm/version.js';
import { createProcessor, type RuntimeAssets } from './processor.js';
import type { WorkerRequest, WorkerResponse } from './protocol.js';

const processRequest = createProcessor(async (baseURL) => {
  const moduleURL = new URL('gs.js', baseURL).href;
  const [factory, module] = await Promise.all([
    import(/* webpackIgnore: true */ moduleURL),
    (async () => {
      const response = await fetch(new URL('gs.wasm', baseURL));
      if (!response.ok)
        throw new Error(`WASM download failed: HTTP ${response.status}`);
      return WebAssembly.compileStreaming(response.clone()).catch(() =>
        response.arrayBuffer().then((bytes) => WebAssembly.compile(bytes))
      );
    })()
  ]);
  return {
    module,
    factory: factory.default,
    version: ghostscriptVersion
  } as RuntimeAssets;
});

const scope = self as unknown as {
  onmessage: (event: MessageEvent<WorkerRequest>) => void;
  postMessage(message: WorkerResponse, transfers: ArrayBuffer[]): void;
};
scope.onmessage = (event) => {
  processRequest(event.data, (message, transfers = []) =>
    scope.postMessage(message, transfers)
  );
};
