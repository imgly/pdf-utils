import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  createConversionRuntime,
  ConversionError,
  getDefaultConversionRuntime
} from '@imgly/pdf-conversion-utils';

function eps(
  width = 20,
  height = 30,
  content = '0 0 moveto 10 10 lineto stroke showpage'
) {
  return `%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 ${width} ${height}\n${content}\n%%EOF\n`;
}

function job(input = eps(), extras = {}) {
  return {
    files: { 'input.eps': input, ...extras },
    args: [
      '-dSAFER',
      '-dBATCH',
      '-dNOPAUSE',
      '-dEPSCrop',
      '-sDEVICE=pdfwrite',
      '-sOutputFile=/work/output.pdf',
      '/work/input.eps'
    ],
    outputFiles: ['output.pdf']
  };
}

function pdf(result) {
  const data = result.files['output.pdf'];
  assert.ok(data instanceof Uint8Array);
  const text = new TextDecoder('latin1').decode(data);
  assert.ok(text.startsWith('%PDF-'));
  return text;
}

test('completed processor jobs release their Ghostscript instances', () => {
  execFileSync(
    process.execPath,
    [
      '--expose-gc',
      fileURLToPath(new URL('./processor-lifetime.mjs', import.meta.url))
    ],
    { encoding: 'utf8', timeout: 10_000 }
  );
});

test('Node stdin/eval module modes can start a conversion worker', () => {
  const script = `
    import { createConversionRuntime } from '@imgly/pdf-conversion-utils';
    const runtime = createConversionRuntime();
    try {
      const result = await runtime.run(${JSON.stringify(job())});
      console.log(new TextDecoder().decode(result.files['output.pdf'].slice(0, 5)));
    } finally {
      runtime.dispose();
    }
  `;
  for (const flags of [
    ['--input-type=module'],
    ['--input-type', 'module', '--stack-trace-limit=10']
  ]) {
    const output = execFileSync(
      process.execPath,
      [...flags, '--eval', script],
      {
        cwd: new URL('../', import.meta.url),
        encoding: 'utf8',
        timeout: 10_000
      }
    );
    assert.equal(output.trim(), '%PDF-');
  }
});

test('package initialization is lazy, even when assets are unavailable', () => {
  const runtime = createConversionRuntime({
    assetBaseURL: new URL('./missing/', import.meta.url)
  });
  runtime.dispose();
});

test('real Ghostscript preload and concurrent jobs preserve independent dimensions', async (t) => {
  const runtime = createConversionRuntime();
  t.after(() => runtime.dispose());
  const info = await runtime.preload();
  assert.equal(info.version, '10.08.0');
  const [first, second] = await Promise.all([
    runtime.run(job(eps(21, 22, 'revision = showpage'))),
    runtime.run(job(eps(31, 32)))
  ]);
  assert.ok(first.diagnostics.includes('10080'));
  assert.match(pdf(first), /\/MediaBox\s*\[\s*0\s+0\s+21\s+22\s*\]/);
  assert.match(pdf(second), /\/MediaBox\s*\[\s*0\s+0\s+31\s+32\s*\]/);
});

test('nonzero exit fails even when Ghostscript writes a PDF, and next job succeeds', async (t) => {
  const runtime = createConversionRuntime();
  t.after(() => runtime.dispose());
  await assert.rejects(
    runtime.run(job(eps(20, 30, 'bogusoperator'))),
    (error) => {
      assert.ok(error instanceof ConversionError);
      assert.equal(error.code, 'CONVERSION_FAILED');
      assert.equal(error.exitCode, 1);
      assert.match(error.diagnostics.join('\n'), /undefined.*bogusoperator/);
      return true;
    }
  );
  pdf(await runtime.run(job()));
});

test('job filesystem does not retain a previous input', async (t) => {
  const runtime = createConversionRuntime();
  t.after(() => runtime.dispose());
  await runtime.run(job(eps(), { sentinel: 'secret from first job' }));
  const next = job(eps(20, 30, '(/work/sentinel) (r) file closefile showpage'));
  next.args[0] = '-dNOSAFER';
  await assert.rejects(runtime.run(next), (error) => {
    assert.equal(error.code, 'CONVERSION_FAILED');
    assert.match(error.diagnostics.join('\n'), /undefinedfilename/);
    return true;
  });
});

test('inputs are snapshotted at enqueue and caller buffers stay attached', async (t) => {
  const runtime = createConversionRuntime();
  t.after(() => runtime.dispose());
  const input = new TextEncoder().encode(eps(25, 35));
  const pending = runtime.run(job(input));
  input.fill(0);
  assert.ok(input.byteLength > 0);
  assert.match(pdf(await pending), /\/MediaBox\s*\[\s*0\s+0\s+25\s+35\s*\]/);
});

test('combined output limit rejects before returning bytes and permits retry', async (t) => {
  const runtime = createConversionRuntime();
  t.after(() => runtime.dispose());
  await assert.rejects(runtime.run(job(), { maxOutputBytes: 1 }), {
    code: 'OUTPUT_LIMIT'
  });
  pdf(await runtime.run(job()));
});

test('diagnostics are bounded for noisy PostScript', async (t) => {
  const runtime = createConversionRuntime();
  t.after(() => runtime.dispose());
  const result = await runtime.run(
    job(
      eps(
        20,
        30,
        '10000 { (abcdefghijklmnopqrstuvwxyz0123456789) = } repeat showpage'
      )
    )
  );
  const bytes = result.diagnostics.reduce(
    (total, message) => total + new TextEncoder().encode(message).byteLength,
    0
  );
  assert.ok(bytes > 0 && bytes <= 64 * 1024);
});

test('diagnostic clipping respects UTF-8 boundaries and omits empty lines', async (t) => {
  const runtime = createConversionRuntime();
  t.after(() => runtime.dispose());
  const result = await runtime.run(
    job(eps(20, 30, '10000 { () = (äΩ🙂) = } repeat showpage'))
  );
  const bytes = result.diagnostics.reduce(
    (total, message) => total + new TextEncoder().encode(message).byteLength,
    0
  );
  assert.ok(bytes <= 64 * 1024);
  assert.ok(result.diagnostics.every((message) => message.length > 0));
});

test('timeout interrupts a running PostScript loop and permits a new worker', async (t) => {
  const runtime = createConversionRuntime();
  t.after(() => runtime.dispose());
  await runtime.preload();
  await assert.rejects(
    runtime.run(job(eps(20, 30, '{} loop')), { timeoutMs: 100 }),
    { code: 'TIMEOUT' }
  );
  pdf(await runtime.run(job()));
});

test('aborting queued work does not cancel the active conversion', async (t) => {
  const runtime = createConversionRuntime();
  t.after(() => runtime.dispose());
  const active = runtime.run(job());
  const abort = new AbortController();
  const queued = runtime.run(job(), { signal: abort.signal });
  abort.abort();
  await assert.rejects(queued, { code: 'ABORTED' });
  pdf(await active);
});

test('aborting running work terminates the worker and pending work can continue', async (t) => {
  const runtime = createConversionRuntime();
  t.after(() => runtime.dispose());
  await runtime.preload();
  const abort = new AbortController();
  const running = runtime.run(job(eps(20, 30, '{} loop')), {
    signal: abort.signal
  });
  const next = runtime.run(job());
  setTimeout(() => abort.abort(), 100);
  await assert.rejects(running, { code: 'ABORTED' });
  pdf(await next);
});

test('dispose rejects active and queued work; default runtime can be recreated', async () => {
  const runtime = createConversionRuntime();
  const active = runtime.preload();
  const queued = runtime.run(job());
  runtime.dispose();
  await assert.rejects(active, { code: 'DISPOSED' });
  await assert.rejects(queued, { code: 'DISPOSED' });
  await assert.rejects(runtime.preload(), { code: 'DISPOSED' });
  const previous = getDefaultConversionRuntime();
  previous.dispose();
  const replacement = getDefaultConversionRuntime();
  assert.notEqual(previous, replacement);
  replacement.dispose();
});

test('invalid paths and run limits reject without initializing Ghostscript', async (t) => {
  const runtime = createConversionRuntime({
    assetBaseURL: new URL('./missing/', import.meta.url)
  });
  t.after(() => runtime.dispose());
  await assert.rejects(
    runtime.run({ ...job(), files: { '../input.eps': eps() } }),
    { code: 'INVALID_INPUT' }
  );
  await assert.rejects(runtime.run(job(), { maxOutputBytes: 0 }), {
    code: 'INVALID_INPUT'
  });
  await assert.rejects(runtime.run(job(), { timeoutMs: -1 }), {
    code: 'INVALID_INPUT'
  });
});

test('timeouts beyond the platform timer range reject instead of firing immediately', async (t) => {
  const runtime = createConversionRuntime({
    assetBaseURL: new URL('./missing/', import.meta.url)
  });
  t.after(() => runtime.dispose());
  await assert.rejects(runtime.preload({ timeoutMs: 2 ** 31 }), {
    code: 'INVALID_INPUT'
  });
  assert.throws(() => createConversionRuntime({ timeoutMs: 2 ** 31 }), {
    code: 'INVALID_INPUT'
  });
  const maximum = createConversionRuntime({ timeoutMs: 2 ** 31 - 1 });
  maximum.dispose();
});

test('CommonJS entry locates the ESM worker and real WASM assets', async (t) => {
  const require = createRequire(import.meta.url);
  const {
    createConversionRuntime: createRuntime
  } = require('@imgly/pdf-conversion-utils');
  const runtime = createRuntime();
  t.after(() => runtime.dispose());
  pdf(await runtime.run(job()));
});
