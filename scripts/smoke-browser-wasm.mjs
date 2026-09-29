#!/usr/bin/env node
// Optional browser smoke test. Requires Playwright with Chromium installed.
// Usage: node scripts/smoke-browser-wasm.mjs /path/to/dist [expected-version]
// PLAYWRIGHT_MODULE may point to an existing Playwright index.mjs installation.
// Only an ephemeral loopback server is started; no assets are uploaded.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const directory = process.argv[2];
if (!directory) {
  console.error(
    "Usage: node scripts/smoke-browser-wasm.mjs /path/to/dist [expected-version]",
  );
  process.exit(2);
}
const expectedVersion = process.argv[3] ?? "10.08.0";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href
    : "playwright"
);
const worker = `
import factory from '/gs.js';
try {
  const compiled = await WebAssembly.compileStreaming(fetch('/gs.wasm'));
  const diagnostics = [];
  async function fresh() {
    return factory({
      instantiateWasm(imports, receive) {
        const instance = new WebAssembly.Instance(compiled, imports);
        receive(instance);
        return instance.exports;
      },
      print: (text) => diagnostics.push(String(text)),
      printErr: (text) => diagnostics.push(String(text))
    });
  }
  const versionModule = await fresh();
  if (versionModule.callMain(['--version']) !== 0) throw new Error('Version failed');
  const version = diagnostics.join('\\n').trim();
  diagnostics.length = 0;
  const module = await fresh();
  module.FS.mkdir('/work');
  module.FS.writeFile('/work/input.eps', '%!PS-Adobe-3.0 EPSF-3.0\\n%%BoundingBox: -11 7 191 109\\n%%HiResBoundingBox: -10.25 7.5 190.5 108.75\\n%%EndComments\\n0.1 0.2 0.3 0.4 setcmykcolor\\n-10.25 7.5 200.75 101.25 rectfill\\n0 0 0 1 setcmykcolor\\n/Helvetica findfont 16 scalefont setfont\\n5 50 moveto (Browser worker EPS smoke) show\\nshowpage\\n%%EOF\\n');
  const code = module.callMain([
    '-q', '-dSAFER', '-dBATCH', '-dNOPAUSE', '-dEPSCrop',
    '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.4',
    '-sColorConversionStrategy=LeaveColorUnchanged',
    '-dCompressPages=false', '-dCompressFonts=false',
    '-sOutputFile=/work/output.pdf', '/work/input.eps'
  ]);
  if (code !== 0) throw new Error('Conversion failed: ' + diagnostics.join('\\n'));
  const bytes = new Uint8Array(module.FS.readFile('/work/output.pdf'));
  postMessage({ kind: 'pdf', version, buffer: bytes.buffer }, [bytes.buffer]);
  postMessage({ kind: 'transfer', detached: bytes.buffer.byteLength === 0 });
} catch (error) {
  postMessage({ kind: 'error', message: String(error.stack || error) });
}
`;
const assets = new Map([
  [
    "/",
    [
      "text/html",
      Buffer.from("<!doctype html><title>Ghostscript worker smoke</title>"),
    ],
  ],
  ["/worker.mjs", ["text/javascript", Buffer.from(worker)]],
  ["/gs.js", ["text/javascript", await readFile(resolve(directory, "gs.js"))]],
  [
    "/gs.wasm",
    ["application/wasm", await readFile(resolve(directory, "gs.wasm"))],
  ],
]);
const server = createServer((request, response) => {
  const asset = assets.get(request.url);
  if (!asset) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    "Content-Type": asset[0],
    "Cache-Control": "no-store",
  });
  response.end(asset[1]);
});
let browser;
try {
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const result = await page.evaluate(
    () =>
      new Promise((resolveResult, reject) => {
        const worker = new Worker("/worker.mjs", { type: "module" });
        const timeout = setTimeout(() => {
          worker.terminate();
          reject(new Error("Worker smoke timed out after 60s"));
        }, 60_000);
        let pdf;
        function fail(error) {
          clearTimeout(timeout);
          worker.terminate();
          reject(error);
        }
        worker.onerror = (event) => fail(new Error(event.message));
        worker.onmessage = ({ data }) => {
          if (data.kind === "error") return fail(new Error(data.message));
          if (data.kind === "pdf") {
            pdf = {
              version: data.version,
              byteLength: data.buffer.byteLength,
              receivedArrayBuffer: data.buffer instanceof ArrayBuffer,
              text: new TextDecoder("latin1").decode(data.buffer),
            };
          } else if (data.kind === "transfer") {
            clearTimeout(timeout);
            worker.terminate();
            resolveResult({ ...pdf, detached: data.detached });
          }
        };
      }),
  );
  assert.equal(result.version, expectedVersion);
  assert.equal(result.receivedArrayBuffer, true);
  assert.equal(
    result.detached,
    true,
    "worker output buffer must be transferred, not cloned",
  );
  assert.ok(result.byteLength > 1000);
  assert.match(result.text, /^%PDF-/);
  assert.match(result.text, /\/MediaBox\s*\[0\s+0\s+200\.75\s+101\.25\s*\]/);
  const colors = [
    ...result.text.matchAll(
      /([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+k\b/g,
    ),
  ];
  assert.ok(
    colors.some((color) =>
      color
        .slice(1)
        .every(
          (value, index) =>
            Math.abs(Number(value) - [0.1, 0.2, 0.3, 0.4][index]) < 0.001,
        ),
    ),
    "original CMYK channels must survive browser-worker conversion",
  );
  assert.match(result.text, /Browser worker EPS smoke/);
  console.log(
    JSON.stringify(
      {
        browser: browser.version(),
        ghostscript: result.version,
        pdfBytes: result.byteLength,
        pagePoints: [200.75, 101.25],
        preservedCMYK: true,
        preservedText: true,
        transferredBuffer: result.detached,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  if (server.listening)
    await new Promise((resolveClose) => server.close(resolveClose));
}
