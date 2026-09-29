# Ghostscript 10.08.0 WASM candidate

This is an IMG.LY build candidate under AGPL-3.0-only. It does not replace the
historical 10.03.1 runtime or authorize publishing the CE.SDK integration.

## Inputs

`build-lock.json` pins the official Ghostpdl 10.08.0 release archive and SHA-256,
its source commit, ghoulscript build-support revision and file hashes, and the
Linux ARM64 Emscripten 6.0.6 container by its platform-specific image digest.
The compiler choice is supported by newer upstream CI; it does not identify the
compiler used for the inherited 2024 npm binary. See
[the historical investigation](../../provenance/ORIGINAL-TOOLCHAIN.md).

The full official release archive includes bundled dependencies. It is downloaded
and checksum-verified before extraction. The original upstream build-support files
are retained unchanged under `upstream/`. The historical subtree and source tag
remain unchanged.

## Build and smoke test

Requirements: Python 3.12 or newer, Docker with Linux ARM64 support, and Node 22
or newer for the smoke test. The container contains the compiler and native build
tools; no host compiler or global SDK installation is used.

```sh
python3 scripts/build-wasm.py --output /absolute/new-build-directory --jobs 4
node scripts/smoke-wasm.mjs /absolute/new-build-directory/package/dist
```

The output directory must not exist. Failed builds retain their logs and inputs;
use another directory for another attempt. Docker downloads the digest-pinned
image if needed. The actual build container has network access disabled, sees
only the dedicated build directory and uses the same `/build/package` path on
each run. `SOURCE_DATE_EPOCH`, locale and timezone are fixed by the driver.

Outputs include the downloaded sources, adapted build script, source lock,
container command, `toolchain.txt`, `build.log`, matching `gs.js`/`gs.wasm`, full
AGPL text and SHA-256 hashes for all candidate distribution files. No npm package
is published. Containers and build directories are retained for inspection.

To check repeatability, run again in a second empty directory using the same
recipe and compare both `artifact-sha256.json` files. Record the result separately;
a pinned recipe alone is not proof of byte-identical output.

## Explicit adaptations

The driver applies checked replacements to the preserved upstream build script:

- Use the release archive's generated `configure` instead of `autogen.sh`.
- Disable Tesseract OCR explicitly. Ghostscript 10.08.0 requires this for a build
  with threading disabled; EPS conversion and PDF writing do not require OCR.
- Bound Make parallelism with `--jobs` instead of unbounded `-j`.
- Retain generated sources and outputs instead of the upstream destructive Git
  cleanup.
- Replace upstream npm metadata generation with a private candidate manifest for
  the actual Ghostscript version. Do not mislabel 10.08.0 as upstream 10.07.1.

Other compiler/linker flags and pre/post JavaScript come from the pinned current
upstream recipe. In particular this uses `CCLD=em++`, exception-handling helpers,
and the newer incoming module API rather than guessing that the historical
10.03.1 glue remains suitable.

The candidate's `dist/lib` contains upstream Ghostscript support files. Consumers
must explicitly decide how these are deployed and tested; copying them does not
automatically make them available in the WASM virtual filesystem.

## Browser worker smoke

The browser check optionally uses an existing Playwright installation and its
Chromium browser; the verified environment used Playwright 1.61.1. Set the path
to that installation's `index.mjs` without installing dependencies into this
source archive:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
  node scripts/smoke-browser-wasm.mjs /absolute/build-directory/package/dist
```

It starts an ephemeral loopback server and closes the server and browser on exit.

## Verified results

Two clean builds produce identical hashes for all 161 distribution files. Node
and browser-worker smoke tests pass; the existing EPS collection and PDF/X
compatibility checks also pass. See [BUILD-RESULTS.md](BUILD-RESULTS.md) for
the recorded environment, hashes, checks and limits.

## Release acceptance

The smoke test covers the real interpreter version, fractional EPS crop geometry,
CMYK values in an exported PDF, text/fonts, PDF rasterization, malformed input and
isolation between interpreter instances. It does not replace browser-worker,
full EPS visual-fixture, PDF/X, or package-install regression testing.

Before replacing the inherited runtime: validate these integration suites, preserve
and publish the exact new source archive/build materials under IMG.LY control,
verify notices and the complete AGPL source scope for the actual integration,
and record the approved binary hashes in ENGINE-840. Preserve older source
versions while their binaries are distributed. The AGPL route has been selected;
commercial licensing is outside the current work unless a customer requests it.
