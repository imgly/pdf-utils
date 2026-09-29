# Build the standalone runtime

Use Node.js 22 or newer and npm 10.9.8. The committed package-lock.json pins this
wrapper's build and test dependencies. The source does not require CE.SDK or the
private UBQ workspace.

First build the matching Ghostscript candidate using the repository-root
instructions in builds/ghostscript-10.08.0/README.md. Then run from this directory:

```sh
npm ci
npm run assets:prepare -- /absolute/ghostscript-build/package/dist
npm run build
npm test
npm run test:browser
```

The asset preparation command checks both complete files against
`ghostscript-artifacts.json` before copying them into the ignored `src/wasm/`
directory. The generated JS/WASM pair is not committed here. The runtime version
sidecar is part of the source; it supplies the build version because the current
Emscripten module no longer exports the old package's named version export.

Browser tests require a Playwright browser installation. Set
`PLAYWRIGHT_CHANNEL=chrome` to use installed Chrome. `npm test` covers actual
Ghostscript conversion, worker lifetime, package notices and TypeScript ESM/CJS
consumers. `npm run typecheck` additionally checks all runtime source types.

`build.mjs` compiles this runtime only; it never downloads or rebuilds Ghostscript.
The standalone package omits the private workspace's optional Nx project.json;
runtime TypeScript, declarations, worker behavior and actual conversion tests
are otherwise shared with the UBQ package. Sources and license notices must
accompany every corresponding distributed runtime version.
