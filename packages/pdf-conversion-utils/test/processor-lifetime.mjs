import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import factory from '../src/wasm/gs.js';

// Load the actual processor without adding a public package entry just for testing.
const bundled = await build({
  entryPoints: [fileURLToPath(new URL('../src/processor.ts', import.meta.url))],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm'
});
const { createProcessor } = await import(
  `data:text/javascript;base64,${Buffer.from(
    bundled.outputFiles[0].text
  ).toString('base64')}`
);
const wasm = await WebAssembly.compile(
  await readFile(new URL('../src/wasm/gs.wasm', import.meta.url))
);

// The generated factory overwrites these aliases, even when already present.
Object.defineProperty(globalThis, 'buffer', {
  value: 'existing buffer',
  writable: true,
  configurable: true,
  enumerable: true
});
Object.defineProperty(globalThis, 'asm', {
  get: () => 'existing asm',
  set: () => {},
  configurable: true
});
const originalGlobals = Object.getOwnPropertyDescriptors(globalThis);
const instances = [];
let assetLoads = 0;
let rejectFactory = false;
const processor = createProcessor(async () => {
  assetLoads++;
  return {
    module: wasm,
    version: '10.03.1',
    async factory(options) {
      const instance = await factory(options);
      instances.push(new WeakRef(instance));
      if (rejectFactory) {
        throw new Error('Initialization failed');
      }
      return instance;
    }
  };
});
let nextId = 0;
function request(job, maxOutputBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    processor(
      { id: ++nextId, assetBaseURL: 'file:///unused/', job, maxOutputBytes },
      (response) =>
        'error' in response ? reject(response.error) : resolve(response.result)
    );
  });
}
function job(content = '0 0 moveto 10 10 lineto stroke showpage') {
  return {
    files: {
      'input.eps': `%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 20 30\n${content}\n`
    },
    args: [
      '-dSAFER',
      '-dBATCH',
      '-dNOPAUSE',
      '-dEPSCrop',
      '-sDEVICE=pdfwrite',
      '-sOutputFile=/work/output.pdf',
      '/work/input.eps'
    ],
    outputFiles: ['output.pdf']
  };
}
function assertGlobalsRestored() {
  for (const name of ['buffer', 'asm']) {
    assert.deepEqual(
      Object.getOwnPropertyDescriptor(globalThis, name),
      originalGlobals[name],
      `Restore the preexisting ${name} descriptor`
    );
  }
  const current = Object.getOwnPropertyDescriptors(globalThis);
  assert.deepEqual(
    Object.keys(current),
    Object.keys(originalGlobals),
    'Remove the globals added by the factory'
  );
  for (const name of Object.keys(originalGlobals)) {
    assert.deepEqual(
      current[name],
      originalGlobals[name],
      `Preserve the unrelated ${name} descriptor`
    );
  }
}

await request();
assert.equal(instances.length, 0, 'Preload must not allocate an instance');
const result = await request(job());
assert.equal(
  new TextDecoder().decode(result.files['output.pdf'].subarray(0, 5)),
  '%PDF-'
);
assertGlobalsRestored();
await assert.rejects(request(job('bogusoperator')), {
  code: 'CONVERSION_FAILED'
});
assertGlobalsRestored();
await assert.rejects(request(job(), 1), { code: 'OUTPUT_LIMIT' });
assertGlobalsRestored();
rejectFactory = true;
await assert.rejects(request(job()), { code: 'CONVERSION_FAILED' });
assertGlobalsRestored();
assert.equal(assetLoads, 1, 'Jobs must reuse compiled runtime assets');

// GC runs in its own process and across task turns, outside WeakRef keep-alive jobs.
for (let i = 0; i < 10; i++) {
  await new Promise((resolve) => setImmediate(resolve));
  globalThis.gc();
}
assert.deepEqual(
  instances.map((reference) => reference.deref() !== undefined),
  [false, false, false, false],
  'Finished jobs must release their WASM instances and filesystems'
);
