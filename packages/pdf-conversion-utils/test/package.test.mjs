import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const packageRoot = new URL("../", import.meta.url);

test("npm and deployed runtime assets retain the full license and source notices", () => {
  const [packed] = JSON.parse(
    execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
      cwd: packageRoot,
      encoding: "utf8",
    }),
  );
  const files = new Set(packed.files.map(({ path }) => path));
  for (const notice of [
    "COPYING.AGPL-3.0",
    "LICENSE.md",
    "PROVENANCE.md",
    "THIRD_PARTY_NOTICES.md",
  ]) {
    assert.ok(files.has(notice), `npm package is missing ${notice}`);
    assert.ok(
      files.has(`dist/${notice}`),
      `runtime assets are missing ${notice}`,
    );
    assert.deepEqual(
      readFileSync(new URL(`dist/${notice}`, packageRoot)),
      readFileSync(new URL(notice, packageRoot)),
    );
  }
  const license = readFileSync(
    new URL("dist/COPYING.AGPL-3.0", packageRoot),
    "utf8",
  );
  assert.match(license, /GNU AFFERO GENERAL PUBLIC LICENSE/);
  assert.match(license, /13\. Remote Network Interaction/);
  assert.match(license, /END OF TERMS AND CONDITIONS/);
  const notice = readFileSync(new URL("dist/LICENSE.md", packageRoot), "utf8");
  assert.match(
    notice,
    /https:\/\/github\.com\/imgly\/pdf-utils\/releases\/tag\//,
  );
});

test("shipped JS/WASM pair matches the reproduced Ghostscript 10.08.0 build", () => {
  const expected = {
    "gs.js": "3d106a3ef66b257513edb691abecd7b9f390fcb80a930490eecc256f42940b1d",
    "gs.wasm":
      "4a6486d015ff2053138374500441a102fdd0739d0d1517a3621c7af429f326a0",
  };
  for (const [name, digest] of Object.entries(expected)) {
    const bytes = readFileSync(new URL(`dist/${name}`, packageRoot));
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      digest,
      name,
    );
  }
});
