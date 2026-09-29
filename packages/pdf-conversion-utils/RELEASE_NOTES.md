# Release notes draft

## 0.1.0 — unreleased

Run EPS conversion on demand in a reusable Ghostscript worker in browsers and Node.js 22 or later.

- `createConversionRuntime()` supports explicit preload, queued jobs, cancellation, conversion timeouts, output limits, and disposal.
- Browser conversion runs in a Web Worker; Node conversion runs in a worker thread. Failed or cancelled work permits a subsequent conversion.
- Conditional browser, Node ESM, and Node CommonJS entries resolve matching runtime assets. Browser consumers must deploy the worker, `gs.js`, and `gs.wasm` together and configure the documented CSP/CORS requirements.
- Browser entry points support Webpack 5 without treating the runtime asset directory as a bundled file.
- Timeouts above the host timer maximum are rejected instead of overflowing into an immediate timeout.

The runtime uses the reproducible IMG.LY Ghostscript 10.08.0 build with a pinned Emscripten 6.0.6 toolchain. Full AGPL text and matching source notices accompany the runtime assets. The wrapper source is published under AGPL-3.0-only. The package remains private to keep npm publication a separate release step. Publish the approved runtime before the dependent EPS importer, and follow the [provenance and release sequence](PROVENANCE.md). The existing print-ready PDF plugin is unchanged; its migration is a separate follow-up.
