import { ghostscriptVersion } from './wasm/version.js';
import { readFile } from 'node:fs/promises';
import { parentPort } from 'node:worker_threads';
import { createProcessor, type RuntimeAssets } from './processor.js';

if (!parentPort)
  throw new Error('Ghostscript worker requires a worker_threads parent port');
const port = parentPort;
const processRequest = createProcessor(async (baseURL) => {
  const [factory, bytes] = await Promise.all([
    import(new URL('gs.js', baseURL).href),
    readFile(new URL('gs.wasm', baseURL))
  ]);
  const module = await WebAssembly.compile(bytes);
  return {
    module,
    factory: factory.default,
    version: ghostscriptVersion
  } as RuntimeAssets;
});

port.on('message', (message) => {
  processRequest(message, (response, transfers = []) =>
    port.postMessage(response, transfers)
  );
});
