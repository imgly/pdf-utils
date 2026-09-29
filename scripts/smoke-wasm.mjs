#!/usr/bin/env node
// Smoke coverage only: this does not replace EPS visual or print/PDF-X regressions.
// Usage: node scripts/smoke-wasm.mjs /path/to/dist [expected-version]
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const directory = process.argv[2];
if (!directory) {
  console.error(
    "Usage: node scripts/smoke-wasm.mjs /path/to/dist [expected-version]",
  );
  process.exit(2);
}
const expectedVersion = process.argv[3] ?? "10.08.0";
const factory = (await import(pathToFileURL(resolve(directory, "gs.js")).href))
  .default;
assert.equal(
  typeof factory,
  "function",
  "gs.js must export the Emscripten factory",
);
const compiled = await WebAssembly.compile(
  await readFile(resolve(directory, "gs.wasm")),
);

// Match the runtime contract: compiled bytes may be shared, document state may not.
async function execute(args, files = {}, outputs = []) {
  const messages = [];
  const previousGlobals = Object.getOwnPropertyDescriptors(globalThis);
  const previousExitCode = process.exitCode;
  try {
    const module = await factory({
      instantiateWasm(imports, receive) {
        const instance = new WebAssembly.Instance(compiled, imports);
        receive(instance);
        return instance.exports;
      },
      print: (message) => messages.push(String(message)),
      printErr: (message) => messages.push(String(message)),
    });
    module.FS.mkdir("/work");
    assert.throws(() => module.FS.readFile("/work/previous-job-marker"));
    for (const [name, contents] of Object.entries(files)) {
      module.FS.writeFile(`/work/${name}`, contents);
    }
    let code;
    try {
      code = module.callMain([...args]);
    } catch (error) {
      if (error?.name !== "ExitStatus" || !Number.isInteger(error.status))
        throw error;
      code = error.status;
    }
    const result = { code, messages: messages.join("\n"), files: {} };
    if (code === 0) {
      for (const name of outputs) {
        result.files[name] = new Uint8Array(
          module.FS.readFile(`/work/${name}`),
        );
        assert.ok(
          result.files[name].byteLength > 0,
          `${name} must not be empty`,
        );
      }
    }
    return result;
  } finally {
    // Older factories install configurable diagnostic getters retaining their heap.
    for (const [name, descriptor] of Object.entries(
      Object.getOwnPropertyDescriptors(globalThis),
    )) {
      if (!descriptor.configurable || !descriptor.get) continue;
      if (Object.hasOwn(previousGlobals, name)) {
        if (
          (name === "buffer" || name === "asm") &&
          descriptor.get !== previousGlobals[name].get
        ) {
          Object.defineProperty(globalThis, name, previousGlobals[name]);
        }
      } else if (!descriptor.enumerable && !descriptor.set) {
        Reflect.deleteProperty(globalThis, name);
      }
    }
    process.exitCode = previousExitCode;
  }
}

function successful(result) {
  assert.equal(result.code, 0, result.messages);
  return result;
}

const eps = `%!PS-Adobe-3.0 EPSF-3.0
%%BoundingBox: -11 7 191 109
%%HiResBoundingBox: -10.25 7.5 190.5 108.75
%%Pages: 1
%%EndComments
userdict /SmokePrivate known { /SmokeStateLeaked load } if
0.1 0.2 0.3 0.4 setcmykcolor
-10.25 7.5 200.75 101.25 rectfill
0 0 0 1 setcmykcolor
/Helvetica findfont 16 scalefont setfont
5 50 moveto (EPS smoke Helvetica 123) show
/SmokePrivate 42 def
showpage
%%EOF
`;
const pdfArguments = [
  "-q",
  "-dSAFER",
  "-dBATCH",
  "-dNOPAUSE",
  "-dEPSCrop",
  "-sDEVICE=pdfwrite",
  "-dCompatibilityLevel=1.4",
  "-sColorConversionStrategy=LeaveColorUnchanged",
  "-dCompressPages=false",
  "-dCompressFonts=false",
  "-sOutputFile=/work/output.pdf",
  "/work/input.eps",
];
let pdf;

await test("the real WASM reports the expected Ghostscript version", async () => {
  const result = successful(await execute(["--version"]));
  assert.equal(result.messages.trim(), expectedVersion);
});

await test("EPS conversion preserves fractional geometry, CMYK and text", async () => {
  const result = successful(
    await execute(
      pdfArguments,
      {
        "input.eps": eps,
        "previous-job-marker": "must remain private to this instance",
      },
      ["output.pdf"],
    ),
  );
  pdf = result.files["output.pdf"];
  const source = Buffer.from(pdf).toString("latin1");
  assert.match(source, /^%PDF-/);
  const boxes = [
    ...source.matchAll(
      /\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/g,
    ),
  ];
  assert.equal(boxes.length, 1, "expected one page MediaBox");
  const [x0, y0, x1, y1] = boxes[0].slice(1).map(Number);
  assert.ok(Math.abs(x1 - x0 - 200.75) < 0.01, `unexpected width: ${x1 - x0}`);
  assert.ok(Math.abs(y1 - y0 - 101.25) < 0.01, `unexpected height: ${y1 - y0}`);
  const colors = [
    ...source.matchAll(/([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+k\b/g),
  ];
  assert.ok(
    colors.some((color) =>
      color
        .slice(1)
        .every(
          (value, index) =>
            Math.abs(Number(value) - [0.1, 0.2, 0.3, 0.4][index]) < 0.001,
        ),
    ),
    "PDF must retain the four original CMYK channels",
  );
  assert.match(
    source,
    /\/BaseFont\s*\/[^\s/<>\[\]()]*(?:Helvetica|NimbusSans)/,
  );

  const text = successful(
    await execute(
      [
        "-q",
        "-dSAFER",
        "-dBATCH",
        "-dNOPAUSE",
        "-sDEVICE=txtwrite",
        "-sOutputFile=/work/output.txt",
        "/work/input.pdf",
      ],
      { "input.pdf": pdf },
      ["output.txt"],
    ),
  );
  assert.match(
    Buffer.from(text.files["output.txt"]).toString("utf8"),
    /EPS smoke Helvetica 123/,
  );
});

await test("the exported PDF can be rasterized at its expected 72 dpi size", async () => {
  assert.ok(pdf, "the EPS conversion must have succeeded");
  const result = successful(
    await execute(
      [
        "-q",
        "-dSAFER",
        "-dBATCH",
        "-dNOPAUSE",
        "-sDEVICE=png16m",
        "-r72",
        "-sOutputFile=/work/output.png",
        "/work/input.pdf",
      ],
      { "input.pdf": pdf },
      ["output.png"],
    ),
  );
  const png = Buffer.from(result.files["output.png"]);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.toString("ascii", 12, 16), "IHDR");
  assert.equal(png.readUInt32BE(16), 201);
  assert.equal(png.readUInt32BE(20), 101);
});

await test("invalid PostScript fails with a useful interpreter diagnostic", async () => {
  const result = await execute(pdfArguments, {
    "input.eps": "%!PS\nThisOperatorMustNotExistForSmokeTest\n",
  });
  assert.notEqual(result.code, 0, "malformed input must not succeed");
  assert.match(result.messages, /undefined/);
  assert.match(result.messages, /ThisOperatorMustNotExistForSmokeTest/);
});

await test("a subsequent document succeeds with isolated interpreter and filesystem state", async () => {
  const result = successful(
    await execute(pdfArguments, { "input.eps": eps }, ["output.pdf"]),
  );
  assert.match(
    Buffer.from(result.files["output.pdf"]).toString("latin1"),
    /^%PDF-/,
  );
  assert.doesNotMatch(result.messages, /SmokeStateLeaked/);
});
