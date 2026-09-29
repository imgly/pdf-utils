# Build verification — 2026-09-29

## Result

Two clean builds of the pinned Ghostscript 10.08.0 recipe completed successfully.
All **161 candidate distribution files** have identical SHA-256 values across the
builds, including the full JS/WASM pair and Ghostscript support files. The adapted
build scripts and captured toolchain inventories also match. This verifies
repeatability for the recorded Linux ARM64 container and recipe, not across every
host architecture or toolchain.

| Artifact  |      Bytes | SHA-256                                                            |
| --------- | ---------: | ------------------------------------------------------------------ |
| `gs.js`   |     98,805 | `3d106a3ef66b257513edb691abecd7b9f390fcb80a930490eecc256f42940b1d` |
| `gs.wasm` | 20,334,850 | `4a6486d015ff2053138374500441a102fdd0739d0d1517a3621c7af429f326a0` |

See `artifact-sha256.json` for all output hashes and `toolchain.txt` for the exact
compiler versions and container package inventory. Emscripten is 6.0.6, with LLVM
commit `ff6d537b14d737719d6377789784d04ff9565f65`; the build container is pinned by
digest in `build-lock.json`. Node inside the build container is 24.19.0. The source
archive checksum is verified before extraction and the compilation runs with
container networking disabled.

The first exploratory configuration failed because Ghostscript 10.08.0 requires
`--without-tesseract` when threading is disabled. Both successful clean builds
include this explicit adaptation. The recipe preserves upstream exception-helper
flags; Emscripten reports their deprecation, but compilation and runtime tests
pass. No compiler or generated binary edits were used after the build.

## Runtime smoke checks

The five dependency-free Node smoke tests pass with Node 22.22.3:

- Interpreter reports Ghostscript 10.08.0.
- EPS to PDF preserves a 200.75 by 101.25 point crop with a negative source origin,
  original CMYK channel values and standard-font text.
- PDF text extraction and rendering succeed; a 72 dpi raster is 201 by 101 pixels.
- Invalid PostScript fails with an interpreter diagnostic.
- Later conversions succeed with independent interpreter and virtual filesystem
  state while sharing compiled WASM bytes.

The real Chromium 149.0.7827.55 module-worker smoke test also passes. It loads the
candidate JS/WASM over a local HTTP server, converts the EPS, checks PDF geometry,
CMYK and text, and transfers the resulting ArrayBuffer to the caller. The worker
confirms that transferring detaches its output buffer. The test used Playwright
1.61.1; no external conversion service or existing development server was used.

## Existing EPS collection comparison

Compared the candidate with the inherited 10.03.1 WASM using the same existing
importer preprocessing and conversion arguments. All 47 importer-accepted EPS
fixtures converted successfully with both versions. Page counts and boxes,
extracted text, CMYK drawing operators and previews rendered by the same Poppler
version (maximum dimension 1024 pixels) matched for all 47. The previews were
pixel-identical. This compares converted PDFs, not the CE.SDK editor rendering.

One additional fixture was rejected by existing importer validation before either
WASM version ran because it lacks the required EPSF header. A separate raw-input
check converted it successfully with both versions and matching page dimensions;
it is not a new candidate-runtime regression. Customer input files and per-file
output artifacts remain private and are not included in this public repository.

## Print compatibility smoke

The existing print plugin's actual `convertToPDFX` API was exercised with an
injected runtime backed by each WASM version. PDF/X-3 and PDF/X-4 conversions passed
for both 10.03.1 and 10.08.0. Checks verified the exact embedded FOGRA39 ICC bytes,
OutputIntent and standard metadata, embedded fonts, fractional page dimensions,
text read-back and 72 dpi raster dimensions. This is a compatibility smoke test,
not independent PDF/X preflight certification.

## Scope

This is a new, repeatable build, not byte-for-byte reconstruction of the inherited
10.03.1 npm artifact. The original compiler version remains unknown as recorded
in `provenance/ORIGINAL-TOOLCHAIN.md`.

No CE.SDK runtime binary has been replaced or published. A production integration
must additionally pass its package/deployment, full EPS visual and print/PDF-X
checks and complete AGPL source/notice packaging for the concrete integration.
The historical source tag remains unchanged. A release of this new binary must
preserve the matching 10.08.0 source archive under IMG.LY control as well.
