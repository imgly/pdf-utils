# IMG.LY PDF utilities — source archive

This repository preserves the Ghostscript source and WASM build inputs associated
with `@privyid/ghostscript@0.1.0-alpha.1` (Ghostscript 10.03.1). It contains actual
source files, not submodule links. A normal clone or source archive includes
Ghostpdl and its bundled dependencies.

**This is a historical source snapshot, not a new runtime release.** The original
Emscripten/LLVM versions and a reproduced WASM build remain unverified. The snapshot
does not establish suitability of this old Ghostscript version for production use.
No IMG.LY proprietary runtime or editor source is included.

## Contents

| Path                             | Contents                                                                                      |
| -------------------------------- | --------------------------------------------------------------------------------------------- |
| `packages/ghostscript/`          | Extracted ghoulscript WASM package, build support, tests and notices                          |
| `packages/ghostscript/ghostpdl/` | Complete Ghostpdl source, imported with `git subtree --squash`                                |
| `provenance/`                    | Source revisions, original build script, npm release metadata and upstream root build support |
| `scripts/verify-sources.py`      | Checks the pinned source trees and optional source archive                                    |
| `scripts/source-archive.py`      | Creates an archive of the exact Git blob contents                                             |

The initial snapshot is ghoulscript
[`159bb2c`](https://github.com/privy-open-source/ghoulscript/tree/159bb2c5efb76bd33c77c98a79460a668d890f87)
with Ghostpdl
[`7145885`](https://github.com/ArtifexSoftware/ghostpdl/tree/7145885041bb52cc23964f0aa2aec1b1c82b5908).
The npm package's actual release commit is
[`c00b95d`](https://github.com/privy-open-source/ghoulscript/tree/c00b95de4b6f6f10d5676ff2408f6f7dbd9815a6).
See [PROVENANCE.md](PROVENANCE.md) for the distinction and local adaptation.

## Get and verify the sources

```sh
git clone https://github.com/imgly/pdf-utils.git
cd pdf-utils
python3 scripts/verify-sources.py
```

For the historical snapshot, check out tag `source-gs-10.03.1-privy-0.1.0-alpha.1`.
Keep versioned source links pinned to a tag or full commit, rather than `main`.
Use the source archive attached to that release for exact Git blob contents;
GitHub's automatic archives may normalize line endings according to upstream attributes.

## Build status

The original build needs Emscripten (`emconfigure`, `emmake`, `emcc`), a native C
compiler (`gcc`), Make, Autoconf/Automake and Node.js. Upstream records Node 20 and
Yarn 4.2.2, but **does not pin the Emscripten compiler version**.

The following entry point is provided for build reproduction work, not as a
verified recipe for producing the published binary:

```sh
# Installs only the pinned TypeScript declarations at the repository root.
npm ci --ignore-scripts
# Activate the Emscripten SDK being evaluated before running this command.
npm run build:wasm
```

Run in a disposable checkout. The build generates files in the Ghostpdl tree,
`packages/ghostscript/out/` and `packages/ghostscript/dist/`. Our build script
retains those files instead of running the upstream Git cleanup. Do not run
`provenance/build.sh.upstream`; it is retained as evidence only.

`@types/emscripten@1.39.13` supplies TypeScript declarations, **not** the compiler.
The preserved package still carries its upstream name and version as provenance;
do not publish it as an IMG.LY package. No binary is built or published by this
repository's initial import.

## Maintained build candidate

A separate [Ghostscript 10.08.0 build recipe](builds/ghostscript-10.08.0/README.md)
pins Emscripten 6.0.6 and all source inputs for a new candidate. It leaves the
historical source snapshot unchanged. Build results and remaining integration
checks are tracked with that recipe. The selected licensing route is AGPL;
the scope and packaging of the actual CE.SDK integration still require review.

## Updates and licensing

See [MAINTENANCE.md](MAINTENANCE.md) for separate upstream update steps and source
archive verification. Read [NOTICE.md](NOTICE.md), the full [AGPL-3.0 text](LICENSE)
and Ghostpdl's retained component license notices. This repository does not resolve
licensing of a separate application or runtime that uses these sources.
