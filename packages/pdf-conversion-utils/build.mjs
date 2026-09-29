import { build } from "esbuild";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

await mkdir("dist", { recursive: true });
for (const platform of ["browser", "node"]) {
  await build({
    entryPoints: [`src/${platform}.ts`, `src/worker.${platform}.ts`],
    outdir: "dist",
    platform,
    format: "esm",
    bundle: true,
    target: "es2022",
    sourcemap: true,
  });
}
await build({
  entryPoints: ["src/node.ts"],
  outfile: "dist/node.cjs",
  platform: "node",
  format: "cjs",
  bundle: true,
  target: "node22",
  sourcemap: true,
  define: { "import.meta.url": "__moduleURL" },
  banner: {
    js: 'const __moduleURL = require("node:url").pathToFileURL(__filename).href;',
  },
});
execFileSync(
  process.execPath,
  [
    fileURLToPath(import.meta.resolve("typescript/bin/tsc")),
    "--noEmit",
    "false",
    "--declaration",
    "--emitDeclarationOnly",
    "--outDir",
    "dist",
  ],
  { stdio: "inherit" },
);
await writeFile(
  "dist/node.d.cts",
  (await readFile("dist/node.d.ts", "utf8")).replaceAll(
    "./types.js",
    "./types.cjs",
  ),
);
await copyFile("dist/types.d.ts", "dist/types.d.cts");
for (const asset of ["gs.js", "gs.wasm"]) {
  await copyFile(`src/wasm/${asset}`, `dist/${asset}`);
}
for (const notice of [
  "COPYING.AGPL-3.0",
  "LICENSE.md",
  "PROVENANCE.md",
  "THIRD_PARTY_NOTICES.md",
]) {
  await copyFile(notice, `dist/${notice}`);
}
