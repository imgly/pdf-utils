# Runtime source and Ghostscript artifact provenance

The IMG.LY runtime wrapper is published under AGPL-3.0-only as of 2026-09-29. Its source, build files and tests are available at [runtime-wrapper-0.1.0-source](https://github.com/imgly/pdf-utils/tree/runtime-wrapper-0.1.0-source/packages/pdf-conversion-utils). This source publication does not publish an npm release; `private: true` prevents accidental npm publication from this archive.

This source publication contains the conversion runtime wrapper. CE.SDK engine, editor, EPS importer and print-plugin code are not included.

## Current artifacts — Ghostscript 10.08.0

The source `gs.js` and `gs.wasm` are the byte-identical outputs of the IMG.LY build described in [imgly/pdf-utils#1](https://github.com/imgly/pdf-utils/pull/1). They replace the inherited 10.03.1 binary in this shared runtime. Two independent clean builds matched across all 161 candidate distribution files. A further build from the extracted published source bundle, using its local source archive, matched the same 161 files.

| Artifact  |      Bytes | SHA-256                                                            |
| --------- | ---------: | ------------------------------------------------------------------ |
| `gs.js`   |     98,805 | `3d106a3ef66b257513edb691abecd7b9f390fcb80a930490eecc256f42940b1d` |
| `gs.wasm` | 20,334,850 | `4a6486d015ff2053138374500441a102fdd0739d0d1517a3621c7af429f326a0` |

The new generated loader has no version export. Both workers obtain their public preload version from the wrapper's pinned version module; tests check the real interpreter version and artifact hashes. The generated loader is not edited to add metadata.

## Preserved build sources

The [IMG.LY source-only release](https://github.com/imgly/pdf-utils/releases/tag/source-gs-10.08.0-imgly-1) provides the complete 10.08.0 build-source bundle from commit `6b4e86e3d84e3c09a1e5c69bd791ffae5e2f1dca`. Its SHA-256 is `f09686b5e0764cb82b78ca422c6114d4cb1ab1c3aabfa005441ae4cb8108f1f3`. The bundle includes the exact official Ghostpdl release tarball with all bundled dependency notices, preserved upstream build-support files, the adapted build driver, full AGPL text, compiler inventory and verification results. It contains no customer files or CE.SDK code.

- Ghostpdl source revision: `05631c2cba4e578fdd6bd25cae6f0939436de848` (10.08.0).
- Official source archive SHA-256: `605821a16ddbc159d8f6ccd961e0b96e6fee5af28048ea3b3ceaa1927237bdd6`.
- Ghoulscript build-support revision: `75545f5e10fd9391ed6798c97bafb19400aecc26`.
- Emscripten: `6.0.6`; LLVM revision: `ff6d537b14d737719d6377789784d04ff9565f65`.
- Linux ARM64 build image: `emscripten/emsdk@sha256:1107465ce37d6d95942e53774ef2d272bea3880bb07d37fe63213469ef2d05dc`.

The build uses the release's generated configure script, explicitly disables OCR for the single-threaded WASM target, bounds Make parallelism, retains build outputs instead of performing upstream Git cleanup, and records the actual version in private build metadata. Other compiler/linker options and pre/post JavaScript come from the pinned upstream support. The bundle can rebuild using its local source tarball without contacting the upstream source server; the pinned compiler image must already be present for a fully offline build.

Ghostscript's standard resources, fonts and default ICC profiles are compiled into its ROM filesystem. The runtime deploys the verified JS/WASM pair; additional `dist/lib` command-line utility files from the upstream installation are not loaded by this runtime.

## Verification

The new build passes real-WASM Node and Chromium module-worker checks for fractional EPS bounds, CMYK, text/font read-back, PDF rasterization, malformed input, isolated instances and transferable output. All 47 importer-accepted EPS fixtures match the inherited binary in page geometry, extracted text, CMYK operators and previews rendered with the same Poppler version. This is a direct converted-PDF comparison, not a complete editor-rendering comparison.

The actual print plugin's PDF/X-3 and PDF/X-4 conversion smoke passes with both runtimes, including exact FOGRA39 profile bytes, OutputIntent, metadata, embedded fonts, geometry and output read-back. This is not independent PDF/X certification.

## Distribution and notices

Ghostscript and the IMG.LY runtime wrapper are distributed under AGPL-3.0-only. Component-specific notices and license terms are preserved.

The build copies `COPYING.AGPL-3.0`, `LICENSE.md`, `PROVENANCE.md` and `THIRD_PARTY_NOTICES.md` alongside the workers and JS/WASM. Keep all four documents and their versioned source links with deployed assets. The wrapper source tag and Ghostscript source release together provide the matching source materials for this runtime version.

## Package build and release sequence

See [README.md](README.md#development) for the standalone build. First reproduce Ghostscript using the source bundle, then import the verified generated pair with `npm run assets:prepare -- /absolute/build/package/dist`. The helper checks both artifact hashes before writing either file. `npm run build` compiles the TypeScript controller and worker adapters, emits Node ESM/CommonJS and browser declarations, and copies the verified pair plus notices into `dist/`. It does not compile Ghostscript itself. Each worker caches compiled WASM and creates a fresh interpreter instance per conversion.

For an npm release, choose the runtime version and consumer dependency ranges, inspect the packed entries and notices, and test fresh installed Node and hosted browser consumers. Publish the runtime before packages that depend on its new version. Keep the controller, workers, binaries and notices from one build together. Source publication is separate from npm publication and does not release the CE.SDK integrations.

## Historical 10.03.1 provenance

The former `gs.js` and `gs.wasm` matched `@privyid/ghostscript@0.1.0-alpha.1` byte-for-byte. That package's npm commit is `c00b95de4b6f6f10d5676ff2408f6f7dbd9815a6`; the later archived ghoulscript package is `159bb2c5efb76bd33c77c98a79460a668d890f87`, with Ghostpdl `7145885041bb52cc23964f0aa2aec1b1c82b5908`. The [historical source release](https://github.com/imgly/pdf-utils/releases/tag/source-gs-10.03.1-privy-0.1.0-alpha.1) remains available.

The old binary's original compiler remains unknown. The current 10.08.0 build establishes a documented replacement; it does not claim to reconstruct the 2024 binary. Keep previous matching source versions available while their binaries are distributed.
