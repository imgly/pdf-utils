# Source provenance

## Pinned inputs

`provenance/sources.json` records full Git commits, the Ghostpdl tree hash and
hashes for every imported ghoulscript package file. The original Git submodule
entry is replaced by actual source files, without changing Ghostpdl's tree.

- Upstream: `https://github.com/privy-open-source/ghoulscript`
- Extracted snapshot: `159bb2c5efb76bd33c77c98a79460a668d890f87`
- npm release commit: `c00b95de4b6f6f10d5676ff2408f6f7dbd9815a6`
- Ghostpdl: `https://github.com/ArtifexSoftware/ghostpdl`
- Ghostpdl commit: `7145885041bb52cc23964f0aa2aec1b1c82b5908`
- Ghostpdl tree: `a3a83b2fbafddad0d1e2853eb6aa7bf218b5ae2a`

The npm registry records `c00b95d` as `gitHead` for
`@privyid/ghostscript@0.1.0-alpha.1`. The later `159bb2c` snapshot is not the npm
release commit. Within `packages/ghostscript`, only README and package metadata
change between these revisions. Both pin the same Ghostpdl commit and have the
same `build.sh` blob and `build/` tree. The earlier README and package.json are
retained in `provenance/npm-release/` so the earlier package file set can be
reconstructed with the original build script and the other unchanged files.

The preserved upstream root package.json, yarn.lock, .yarnrc.yml and .nvmrc are in
`provenance/ghoulscript-root/`. They document the original monorepo environment;
they are not the install configuration for this extracted repository. The original
post-build script expects root-level `node_modules/@types/emscripten/index.d.ts`.
The new private root package installs that exact declaration package without
installing the unrelated high-level ghoulscript wrapper.

## Local adaptation

The executable `packages/ghostscript/build.sh` differs from its retained original
`provenance/build.sh.upstream` only in its final cleanup block. The original runs
`git clean -xdf` and `git checkout .` from the Ghostpdl submodule. Those commands
are removed because this repository embeds Ghostpdl as a subtree. Compiler,
linker and post-processing commands are unchanged. No WASM rebuild was performed.

## Binary origin

The historical binary distribution is
[`@privyid/ghostscript@0.1.0-alpha.1`](https://www.npmjs.com/package/@privyid/ghostscript/v/0.1.0-alpha.1).
Its public npm tarball has SHA-1
`ef3acecff13ace460a84b0eba60348ed605fa061`.
This repository archives sources; it does not redistribute that npm tarball.

The exact original Emscripten/LLVM version and complete original build environment
have not been established. The WASM has no custom sections identifying producers.
Source correspondence is supported by upstream's recorded revisions, but a
reproduced binary is not inferred from those revisions. Before a new binary
release, pin the toolchain and build environment, record commands and output
hashes, and validate the rebuilt artifact.
