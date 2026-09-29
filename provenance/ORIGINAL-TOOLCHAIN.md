# Historical Ghostscript WASM toolchain investigation

Investigated on 2026-09-29. This document distinguishes evidence for the inherited
npm binary from the toolchain selected for a new IMG.LY build.

## Result

The original Emscripten, LLVM and Binaryen versions used to produce
`@privyid/ghostscript@0.1.0-alpha.1` remain **unknown**. The public records inspected
do not establish those versions. In particular, `@types/emscripten` is a TypeScript
typings package; its version is not evidence of the compiler version.

Emscripten **6.0.6** is a separately selected candidate for an IMG.LY build. It is
supported by later upstream CI evidence. It is **not** a reconstruction or
identification of the toolchain used for the inherited 2024 binary.

## Historical evidence

- The npm package identifies ghoulscript commit
  [`c00b95de4b6f6f10d5676ff2408f6f7dbd9815a6`](https://github.com/privy-open-source/ghoulscript/commit/c00b95de4b6f6f10d5676ff2408f6f7dbd9815a6),
  dated 2024-07-09. Its
  [package build script](https://github.com/privy-open-source/ghoulscript/blob/c00b95de4b6f6f10d5676ff2408f6f7dbd9815a6/packages/ghostscript/build.sh)
  invokes `emconfigure` and `emmake` without pinning the compiler. Its
  [README](https://github.com/privy-open-source/ghoulscript/blob/c00b95de4b6f6f10d5676ff2408f6f7dbd9815a6/packages/ghostscript/README.md)
  instructs contributors to install Emscripten, without naming a version.
- That commit contains no GitHub Actions workflow, Dockerfile or Emscripten SDK
  version pin. The GitHub Actions API returned no runs for that commit or the
  preserved source snapshot
  [`159bb2c5efb76bd33c77c98a79460a668d890f87`](https://github.com/privy-open-source/ghoulscript/commit/159bb2c5efb76bd33c77c98a79460a668d890f87)
  at the time of inspection. Missing retained runs do not prove that no build
  occurred elsewhere.
- The first public CI configuration was added on 2024-07-19 in
  [`93aaf1a72c713e2b4d5ceb337fdbe32239c3d0d0`](https://github.com/privy-open-source/ghoulscript/blob/93aaf1a72c713e2b4d5ceb337fdbe32239c3d0d0/.github/workflows/ci.yml)
  with Emscripten `1.38.40`. Later that morning,
  [`b35a4a738b63a15a3fbd230facf7b25c31676958`](https://github.com/privy-open-source/ghoulscript/commit/b35a4a738b63a15a3fbd230facf7b25c31676958)
  changed the pin to `3.1.63`. Both configurations postdate the npm source commit;
  neither identifies the compiler that produced the inherited binary.
- The public GitHub Releases API returned no releases. The inspected public issue
  history supplied no substantiated original compiler version. These are limits
  of the available evidence, not proof that the original build is irreproducible.

The historical source archive and recorded JS/WASM checksums remain useful
independently of this unresolved compiler provenance. Establishing the original
version would require additional contemporary build logs, environment records or
maintainer evidence. No maintainer was contacted during this investigation.

## Evidence for the new compiler candidate

At the inspected ghoulscript main commit
[`75545f5e10fd9391ed6798c97bafb19400aecc26`](https://github.com/privy-open-source/ghoulscript/commit/75545f5e10fd9391ed6798c97bafb19400aecc26),
both the [CI workflow](https://github.com/privy-open-source/ghoulscript/blob/75545f5e10fd9391ed6798c97bafb19400aecc26/.github/workflows/ci.yml)
and the [Pages workflow](https://github.com/privy-open-source/ghoulscript/blob/75545f5e10fd9391ed6798c97bafb19400aecc26/.github/workflows/pages.yml)
pin Emscripten `6.0.6`. That upstream package targets Ghostscript `10.07.1`, with
Ghostpdl gitlink `9a39d68ca934f8e9343f46a2803e765122a3b4a9`.

The [successful CI run of 2026-08-19](https://github.com/privy-open-source/ghoulscript/actions/runs/32245433433),
for commit `f39c6fc8830bf49ee2185a1fb1c42c76489ee220`, reports successful steps
`Use EMSDK 6.0.6`, `Build Package` and `Run Test`. This establishes a later upstream
working combination. It does not validate every downstream use case or a newer
Ghostscript release.

IMG.LY separately selected the **official Ghostscript 10.08.0 source tarball** as
the new runtime candidate. This is distinct from the inspected ghoulscript
10.07.1 baseline. Building and validating 10.08.0 with the pinned compiler is new
engineering work; the upstream 10.07.1 CI result must not be reported as a
successful IMG.LY 10.08.0 build or as reproduction of the inherited 10.03.1 binary.

## Build integration observations

The later upstream
[build script](https://github.com/privy-open-source/ghoulscript/blob/75545f5e10fd9391ed6798c97bafb19400aecc26/packages/ghostscript/build.sh)
adds `CCLD=em++`, exports `getExceptionMessage`, enables
`EXPORT_EXCEPTION_HANDLING_HELPERS`, removes `noFSInit` from
`INCOMING_MODULE_JS_API`, and copies Ghostscript support files into `dist/lib`.
These differences need explicit treatment in a new recipe and runtime tests.

The inspected [Dockerfile](https://github.com/privy-open-source/ghoulscript/blob/75545f5e10fd9391ed6798c97bafb19400aecc26/Dockerfile)
sets `EMSDK_TAG=6.0.6`, but its comments still mention `3.1.63`. It also checks for
`ghostpdl/` without copying that directory into the build stage. It is not a
verified, directly reusable reproduction recipe.
