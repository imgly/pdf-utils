#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Build the pinned Ghostscript candidate in an isolated, digest-pinned container."""
import argparse
import hashlib
import json
import shutil
import subprocess
import tarfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RECIPE = ROOT / 'builds/ghostscript-10.08.0'


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True, help='New directory; never overwrite an existing build')
    parser.add_argument('--jobs', type=int, default=4)
    parser.add_argument('--source-archive', type=Path, help='Use an existing checksum-verified Ghostpdl archive instead of downloading')
    args = parser.parse_args()
    if args.jobs < 1:
        parser.error('--jobs must be positive')
    lock = json.loads((RECIPE / 'build-lock.json').read_text())
    for item in lock['upstreamFiles']:
        if sha256(RECIPE / item['path']) != item['sha256']:
            raise SystemExit('Changed upstream build input: ' + item['path'])
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    source = output / 'ghostpdl-10.08.0.tar.gz'
    if args.source_archive:
        if sha256(args.source_archive) != lock['sourceSHA256']:
            raise SystemExit('Local source archive checksum mismatch')
        shutil.copyfile(args.source_archive, source)
    else:
        print('Downloading pinned source archive...', flush=True)
        urllib.request.urlretrieve(lock['sourceURL'], source)
    if sha256(source) != lock['sourceSHA256']:
        raise SystemExit('Source archive checksum mismatch')
    package = output / 'package'
    package.mkdir()
    with tarfile.open(source) as archive:
        # Python's data filter rejects absolute paths, escaping links and special files.
        archive.extractall(package, filter='data')
    (package / 'ghostpdl-10.08.0').rename(package / 'ghostpdl')
    shutil.copytree(RECIPE / 'upstream/build', package / 'build')
    shutil.copy2(RECIPE / 'upstream/package.json', package / 'package.json')
    script = (RECIPE / 'upstream/build.sh').read_text()
    changes = {
        'emconfigure ./autogen.sh': 'emconfigure ./configure',
        '  --disable-threading': '  --disable-threading --without-tesseract',
        '  -j install': f'  -j{args.jobs} install',
        'node "$ROOT/build/post-build.js"': '# Metadata and notices are emitted by the IMG.LY build driver.',
        '# Cleanup\ncd "$ROOT/ghostpdl"\ngit clean -xdf\ngit checkout .': '# Retain build outputs and logs for verification.'
    }
    for before, after in changes.items():
        if script.count(before) != 1:
            raise SystemExit('Unexpected upstream build script: ' + before)
        script = script.replace(before, after)
    (package / 'build.sh').write_text(script)
    command = ['docker', 'run', '--platform', lock['platform'], '--network', 'none',
               '--mount', f'type=bind,src={output},dst=/build', '--workdir', '/build/package',
               '--env', 'SOURCE_DATE_EPOCH=1788825600', '--env', 'TZ=UTC', '--env', 'LC_ALL=C',
               lock['containerImage'], 'bash', '-lc',
               '(emcc --version; /emsdk/upstream/bin/clang --version; node --version; gcc --version; make --version; dpkg-query -W) > /build/toolchain.txt; bash build.sh']
    (output / 'build-command.json').write_text(json.dumps(command, indent=2) + '\n')
    (output / 'build-lock.json').write_text(json.dumps(lock, indent=2) + '\n')
    print('Building with pinned Emscripten container; log: ' + str(output / 'build.log'), flush=True)
    with (output / 'build.log').open('w') as log:
        result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT)
    if result.returncode:
        raise SystemExit(f'Build failed ({result.returncode}); inspect {output / "build.log"}')
    dist = package / 'dist'
    for name in ('gs.js', 'gs.wasm'):
        if not (dist / name).is_file():
            raise SystemExit('Build did not produce ' + name)
    shutil.copy2(ROOT / 'LICENSE', dist / 'LICENSE')
    # This manifest describes the candidate; never reuse upstream's older version metadata.
    (dist / 'package.json').write_text(json.dumps({'name': '@imgly/pdf-utils-wasm-candidate', 'private': True,
        'type': 'module', 'license': 'AGPL-3.0-only', 'ghostscriptVersion': lock['ghostscriptVersion']}, indent=2) + '\n')
    outputs = {str(p.relative_to(dist)): sha256(p) for p in sorted(dist.rglob('*')) if p.is_file()}
    (output / 'artifact-sha256.json').write_text(json.dumps(outputs, indent=2) + '\n')
    print('Built candidate: ' + str(dist), flush=True)
    print(json.dumps({name: outputs[name] for name in ('gs.js', 'gs.wasm')}, indent=2))


if __name__ == '__main__':
    main()
