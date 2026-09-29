# @imgly/pdf-conversion-utils

Ghostscript execution for EPS import in browsers and Node.js, without a CE.SDK dependency. Its wrapper source is published under AGPL-3.0-only. This archive remains `private: true` to prevent accidental npm publication.

```ts
import {
  createConversionRuntime,
  ConversionError,
} from "@imgly/pdf-conversion-utils";

const runtime = createConversionRuntime();

// Optional: start when the user selects an EPS file, alongside reading that file.
await runtime.preload();

const result = await runtime.run(
  {
    files: { "input.eps": epsBytes },
    args: [
      "-dSAFER",
      "-dBATCH",
      "-dNOPAUSE",
      "-dEPSCrop",
      "-sDEVICE=pdfwrite",
      "-sOutputFile=/work/output.pdf",
      "/work/input.eps",
    ],
    outputFiles: ["output.pdf"],
  },
  {
    signal: abortController.signal,
    timeoutMs: 30_000,
    maxOutputBytes: 100 * 1024 * 1024,
  },
);

const pdfBytes = result.files["output.pdf"];
runtime.dispose();
```

Creating or importing the runtime starts no worker and downloads no assets. The first `preload()` or `run()` starts a worker, loads `gs.js`, and compiles `gs.wasm`. Subsequent operations reuse those compiled assets. Each conversion gets a fresh Emscripten instance and filesystem, including after a failed conversion. Jobs run serially per runtime. Inputs are copied when queued; caller buffers remain attached. Requested outputs must exist, be nonempty, and fit within the combined output limit before their bytes are copied out.

Reuse one explicitly owned runtime across EPS imports by passing it through the importer's `runtime` option. Convenience callers can use `getDefaultConversionRuntime()`. Disposing a shared runtime affects every caller using it, so its owner should dispose it only after all consumers are finished. Disposed instances reject further operations; the default accessor creates a replacement when needed. The existing print-ready PDF plugin retains its own Ghostscript implementation; migrating that plugin is a separate follow-up.

`preload()` compiles assets but does not allocate a conversion instance. It is optional: `run()` initializes automatically. Start it on file selection by default. An application with a known EPS workflow may warm it after the editor becomes usable. Unconditional editor-start preload downloads roughly 20.3 MB of uncompressed WASM even when conversion is never used.

## Browser assets

Direct ESM consumers can serve `dist/browser.js` with `worker.browser.js`, `gs.js`, and `gs.wasm` alongside it. For Vite/Webpack applications, copy the three runtime assets and the four license/source documents listed below to a public directory and pass that location explicitly:

```ts
const runtime = createConversionRuntime({
  assetBaseURL: new URL("pdf-conversion/", document.baseURI),
});
```

The `./assets/*` export locates build assets; for example, build tooling can resolve `@imgly/pdf-conversion-utils/assets/gs.wasm`. `workerURL` can override the worker entry location independently. The worker is a standalone module; it dynamically imports `gs.js` from `assetBaseURL`. Keep JS and WASM from the same package build together. Browser servers should return JavaScript and `application/wasm` MIME types and permit the configured worker/script/fetch origins through their CSP and CORS rules. The tests cover same-origin deployment with `script-src 'self' 'wasm-unsafe-eval'`, `worker-src 'self'`, and `connect-src 'self'`; no `unsafe-eval` or blob worker is needed.

For a cross-origin worker URL, the runtime creates a small blob module that imports the hosted worker. This preserves direct CDN imports; CSP must allow `blob:` and the CDN origin in `worker-src`, the CDN origin in `script-src` and `connect-src`, and `'wasm-unsafe-eval'` in `script-src`. To avoid blob workers under a stricter CSP, host `worker.browser.js` on the application origin and pass its URL through `workerURL`, while retaining the CDN `assetBaseURL` for Ghostscript assets. Blob bootstrap URLs are revoked when the worker is terminated.

Keep this package external when bundling higher-level importer/exporter packages so their runtime dependency is shared. A single npm dependency alone does not deduplicate separately embedded copies.

## Node.js

Node 22 or later is supported through ESM and CommonJS entries. Conversions run in `worker_threads`, preserving the application's event loop. Defaults locate the worker and WASM in the installed package. A Node `assetBaseURL` must be a local file URL. Idle workers are unreferenced so they do not keep a CLI process alive; `dispose()` explicitly releases the worker.

## Failures and limits

`ConversionError` provides `code`, bounded `diagnostics`, and an `exitCode` for Ghostscript exit failures. stdout/stderr are captured rather than written to the application's console, up to 64 KiB per conversion. Abort and timeout errors can have empty diagnostics because the executing worker is terminated before it returns a result.

Timeouts start when an operation reaches the front of the queue and include initialization. An aborted queued operation is removed without interrupting another job. Aborting or timing out active work terminates that worker; the next operation creates a new one. A load failure also discards the worker, allowing retries after failed module imports. `dispose()` rejects active and queued operations.

The default timeout is 30 seconds and the combined output limit is 100 MiB. These limits are configurable. The output limit is checked after Ghostscript execution and is not a bound on peak WASM memory. Conversion arguments are a trusted application API; format-specific packages should validate file input and supply their own argument policy.

## Development

Use Node 22 or newer and npm 10.9.8. The committed lockfile pins the standalone build and test dependencies. No CE.SDK checkout is required.

```sh
cd packages/pdf-conversion-utils
npm ci --ignore-scripts
# Rebuild Ghostscript with the source bundle linked in PROVENANCE.md first.
# Import its generated outputs; the helper verifies both pinned checksums.
npm run assets:prepare -- /absolute/build/package/dist
npm run build
npm run typecheck
npm test
# Use an installed Chrome; otherwise install Playwright Chromium first.
PLAYWRIGHT_CHANNEL=chrome npm run test:browser
```

Generated `gs.js`, `gs.wasm`, `dist/` and installed dependencies are not committed in this wrapper source archive. [ghostscript-artifacts.json](ghostscript-artifacts.json) pins the expected generated pair. The Node suite exercises the actual WASM; browser tests verify lazy requests, cached assets, CSP, retry, cancellation and event-loop responsiveness.

## Third-party component

Ghostscript uses the AGPL distribution route. The package includes the full text in `COPYING.AGPL-3.0`; keep that file, `LICENSE.md`, `PROVENANCE.md` and `THIRD_PARTY_NOTICES.md` beside the worker and JS/WASM files when deploying the contents of `dist/`. The notices link to the matching IMG.LY source archive. The matching wrapper source is available at [runtime-wrapper-0.1.0-source](https://github.com/imgly/pdf-utils/tree/runtime-wrapper-0.1.0-source/packages/pdf-conversion-utils).

This package uses the verified IMG.LY Ghostscript 10.08.0 build with Emscripten 6.0.6. [LICENSE.md](LICENSE.md) identifies its origin and [PROVENANCE.md](PROVENANCE.md) records the reproducible build and [matching source archive](https://github.com/imgly/pdf-utils/releases/tag/source-gs-10.08.0-imgly-1).

SHA-256 of the verified runtime artifacts:

- `gs.js`: `3d106a3ef66b257513edb691abecd7b9f390fcb80a930490eecc256f42940b1d`
- `gs.wasm`: `4a6486d015ff2053138374500441a102fdd0739d0d1517a3621c7af429f326a0`
