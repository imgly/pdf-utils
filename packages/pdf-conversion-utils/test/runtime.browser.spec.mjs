import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

let server;
let cdnServer;
let cdnURL;
let baseURL;
let failWasm = false;
const requests = [];

test.beforeAll(async () => {
  const root = new URL('../', import.meta.url);
  const serve = async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    requests.push(path);
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader(
      'Content-Security-Policy',
      path === '/cdn'
        ? `default-src 'self'; script-src 'self' 'wasm-unsafe-eval' ${cdnURL}; worker-src 'self' blob: ${cdnURL}; connect-src 'self' ${cdnURL}`
        : "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'"
    );
    if (path.endsWith('/gs.wasm') && failWasm) {
      response.writeHead(503).end('Temporary failure');
      return;
    }
    if (path === '/' || path === '/cdn') {
      response.setHeader('Content-Type', 'text/html');
      response.end(
        '<!doctype html><script type="module" src="/test/browser-harness.js"></script>'
      );
      return;
    }
    if (
      !path.startsWith('/dist/') &&
      !path.startsWith('/test/browser-harness.js')
    ) {
      response.writeHead(404).end();
      return;
    }
    try {
      const file = new URL(`.${path}`, root);
      if (!fileURLToPath(file).startsWith(fileURLToPath(root)))
        throw new Error('Outside test root');
      response.setHeader(
        'Content-Type',
        path.endsWith('.wasm') ? 'application/wasm' : 'text/javascript'
      );
      response.end(await readFile(file));
    } catch {
      response.writeHead(404).end();
    }
  };
  cdnServer = createServer(serve);
  await new Promise((resolve) => cdnServer.listen(0, '127.0.0.1', resolve));
  cdnURL = `http://127.0.0.1:${cdnServer.address().port}`;
  server = createServer(serve);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseURL = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  server.closeAllConnections();
  cdnServer.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => cdnServer.close(resolve));
});

test.beforeEach(async ({ page }) => {
  requests.length = 0;
  failWasm = false;
  await page.goto(baseURL);
  await page.waitForFunction(() => !!window.runtime);
});

test('loads lazily, caches compiled assets and converts under strict CSP', async ({
  page
}) => {
  expect(requests.some((path) => /worker|gs\./.test(path))).toBe(false);
  const results = await page.evaluate(async () => {
    const [info] = await Promise.all([
      window.runtime.preload(),
      window.runtime.preload()
    ]);
    const first = await window.runtime.run(window.makeJob());
    const second = await window.runtime.run(window.makeJob());
    window.runtime.dispose();
    return {
      version: info.version,
      first: new TextDecoder().decode(first.files['output.pdf'].slice(0, 5)),
      second: new TextDecoder().decode(second.files['output.pdf'].slice(0, 5))
    };
  });
  expect(results).toEqual({
    version: '10.08.0',
    first: '%PDF-',
    second: '%PDF-'
  });
  expect(requests.filter((path) => path.endsWith('/gs.wasm'))).toHaveLength(1);
  expect(requests.filter((path) => path.endsWith('/gs.js'))).toHaveLength(1);
});

test('a failed download is retried in the same runtime', async ({ page }) => {
  failWasm = true;
  const failure = await page.evaluate(() =>
    window.runtime.preload().catch((error) => error.code)
  );
  expect(failure).toBe('LOAD_FAILED');
  failWasm = false;
  const info = await page.evaluate(() => window.runtime.preload());
  expect(info.version).toBe('10.08.0');
  await page.evaluate(() => window.runtime.dispose());
});

test('a module imported from a different CDN origin can start its worker', async ({
  page
}) => {
  await page.goto(`${baseURL}/cdn`);
  await page.waitForFunction(() => !!window.makeJob);
  const result = await page.evaluate(async (url) => {
    const { createConversionRuntime } = await import(`${url}/dist/browser.js`);
    const runtime = createConversionRuntime();
    const output = await runtime.run(window.makeJob());
    runtime.dispose();
    return new TextDecoder().decode(output.files['output.pdf'].slice(0, 5));
  }, cdnURL);
  expect(result).toBe('%PDF-');
});

test('PostScript execution leaves the UI responsive and can be cancelled', async ({
  page
}) => {
  const result = await page.evaluate(async () => {
    await window.runtime.preload();
    const abort = new AbortController();
    let ticks = 0;
    const interval = setInterval(() => {
      ticks++;
    }, 10);
    setTimeout(() => abort.abort(), 150);
    const error = await window.runtime
      .run(window.makeJob('{} loop'), { signal: abort.signal })
      .catch((failure) => failure.code);
    clearInterval(interval);
    const recovered = await window.runtime.run(window.makeJob());
    window.runtime.dispose();
    return { error, ticks, bytes: recovered.files['output.pdf'].length };
  });
  expect(result.error).toBe('ABORTED');
  expect(result.ticks).toBeGreaterThan(3);
  expect(result.bytes).toBeGreaterThan(100);
});
