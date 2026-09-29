import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = new URL("../", import.meta.url);
const sourceDirectory = process.argv[2];
if (!sourceDirectory || process.argv.length !== 3) {
  throw new Error(
    "Usage: npm run assets:prepare -- /absolute/build/package/dist",
  );
}
const manifest = JSON.parse(
  await readFile(new URL("ghostscript-artifacts.json", root), "utf8"),
);
// Verify both inputs before writing either generated artifact.
const artifacts = await Promise.all(
  ["gs.js", "gs.wasm"].map(async (name) => {
    const bytes = await readFile(resolve(sourceDirectory, name));
    const expected = manifest.files[name];
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (bytes.length !== expected.bytes || hash !== expected.sha256) {
      throw new Error(
        `${name} does not match the pinned Ghostscript ${manifest.version} build`,
      );
    }
    return { name, bytes };
  }),
);
await mkdir(new URL("src/wasm/", root), { recursive: true });
for (const { name, bytes } of artifacts) {
  await writeFile(new URL(`src/wasm/${name}`, root), bytes);
}
console.log(`Prepared verified Ghostscript ${manifest.version} JS/WASM assets`);
