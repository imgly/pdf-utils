# Runtime license

Copyright (c) 2026 IMG.LY.

The IMG.LY-authored runtime wrapper in this package is licensed under the GNU Affero General Public License, version 3 only (AGPL-3.0-only). You may use, modify and redistribute it under that license. The full terms are included in [COPYING.AGPL-3.0](COPYING.AGPL-3.0).

The runtime controller, adapters, workers, processor, protocol, types, build support and tests are offered under these terms as of 2026-09-29. This grant does not license separately copyrighted CE.SDK, editor, EPS importer or print-plugin code.

This program is provided without warranty, to the extent permitted by law. Third-party copyright notices and license terms remain applicable as stated below.

---

## Third-Party Components

### Ghostscript WASM (AGPL-3.0-only)

This package includes **Ghostscript 10.08.0**, built by IMG.LY with Emscripten **6.0.6**. The JavaScript loader and WASM are an unchanged pair from the verified build.

- **Matching IMG.LY build sources:** [complete source bundle](https://github.com/imgly/pdf-utils/releases/tag/source-gs-10.08.0-imgly-1), including the exact Ghostpdl release archive, bundled dependency notices, pinned ghoulscript build support and IMG.LY build scripts.
- **Ghostscript source:** [ArtifexSoftware/ghostpdl `05631c2cba4e578fdd6bd25cae6f0939436de848`](https://github.com/ArtifexSoftware/ghostpdl/tree/05631c2cba4e578fdd6bd25cae6f0939436de848), release 10.08.0. The official release archive SHA-256 is `605821a16ddbc159d8f6ccd961e0b96e6fee5af28048ea3b3ceaa1927237bdd6`.
- **WASM build support:** [privy-open-source/ghoulscript `75545f5e10fd9391ed6798c97bafb19400aecc26`](https://github.com/privy-open-source/ghoulscript/tree/75545f5e10fd9391ed6798c97bafb19400aecc26/packages/ghostscript). The preserved inputs and explicit adaptations are recorded in the source bundle.
- **License text:** [COPYING.AGPL-3.0](COPYING.AGPL-3.0), included in the npm package and deployed runtime assets. Bundled dependency and resource notices are included in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and the complete Ghostscript source archive; the AGPL text does not relicense those components.

IMG.LY selected the AGPL distribution route. The source and build evidence are described in [PROVENANCE.md](PROVENANCE.md). The matching wrapper source, including its build files and tests, is published at [runtime-wrapper-0.1.0-source](https://github.com/imgly/pdf-utils/tree/runtime-wrapper-0.1.0-source/packages/pdf-conversion-utils).

The previous 10.03.1 artifacts originated from `@privyid/ghostscript@0.1.0-alpha.1`; their [historical source archive](https://github.com/imgly/pdf-utils/releases/tag/source-gs-10.03.1-privy-0.1.0-alpha.1) remains available for that version. It is not the source archive for this 10.08.0 build.
