#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Create and verify a self-contained source bundle for the pinned WASM build."""
import argparse
import gzip
import hashlib
import io
import json
import subprocess
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RECIPE = 'builds/ghostscript-10.08.0'
PREFIX = 'pdf-utils-source/'
SOURCE = 'sources/ghostpdl-10.08.0.tar.gz'
MANIFEST = 'SOURCE-MANIFEST.json'
SCRIPTS = ('build-wasm.py', 'build-source-archive.py', 'smoke-wasm.mjs', 'smoke-browser-wasm.mjs')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def git(*args):
    return subprocess.check_output(['git', '-C', str(ROOT), *args])


def read_inputs(working_tree):
    revision = git('rev-parse', 'HEAD').decode().strip()
    paths = [p for p in git('ls-tree', '-rz', '--name-only', revision, RECIPE).decode().split('\0') if p]
    paths += ['LICENSE', 'provenance/ORIGINAL-TOOLCHAIN.md'] + ['scripts/' + name for name in SCRIPTS]
    files = {p: (ROOT / p).read_bytes() if working_tree else git('show', f'{revision}:{p}') for p in paths}
    return revision, files


def verify(path):
    with tarfile.open(path) as archive:
        members = archive.getmembers()
        names = [m.name for m in members]
        if len(names) != len(set(names)) or any(not m.isfile() for m in members):
            raise ValueError('Source bundle must contain unique regular files only')
        manifest = json.load(archive.extractfile(PREFIX + MANIFEST))
        expected = {PREFIX + p for p in manifest['files']} | {PREFIX + MANIFEST}
        if set(names) != expected:
            raise ValueError('Source bundle file set does not match its manifest')
        for name, checksum in manifest['files'].items():
            if digest(archive.extractfile(PREFIX + name).read()) != checksum:
                raise ValueError('Source bundle checksum mismatch: ' + name)
        lock = json.load(archive.extractfile(PREFIX + RECIPE + '/build-lock.json'))
        if manifest['files'][SOURCE] != lock['sourceSHA256']:
            raise ValueError('Bundled Ghostpdl release does not match the source lock')
        for item in lock['upstreamFiles']:
            if manifest['files'][RECIPE + '/' + item['path']] != item['sha256']:
                raise ValueError('Bundled build support does not match the source lock')
        with tarfile.open(fileobj=archive.extractfile(PREFIX + SOURCE)) as upstream:
            entries = upstream.getmembers()
            source_files = sum(m.isfile() for m in entries)
            source_links = sum(m.issym() or m.islnk() for m in entries)
    print(json.dumps({'archiveSHA256': digest(path.read_bytes()), 'bundleFiles': len(names),
                      'ghostpdlFiles': source_files, 'ghostpdlLinks': source_links,
                      'sourceRevision': manifest['sourceRevision']}, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-archive', type=Path, help='Exact official Ghostpdl release archive')
    parser.add_argument('--output', type=Path, help='New source bundle; never overwrite')
    parser.add_argument('--verify', type=Path, help='Verify an existing bundle without creating one')
    parser.add_argument('--working-tree', action='store_true', help='Preview only: include uncommitted recipe changes')
    args = parser.parse_args()
    if args.verify:
        verify(args.verify)
        return
    if not args.source_archive or not args.output:
        parser.error('--source-archive and --output are required when creating a bundle')
    revision, files = read_inputs(args.working_tree)
    lock = json.loads(files[RECIPE + '/build-lock.json'])
    source = args.source_archive.read_bytes()
    if digest(source) != lock['sourceSHA256']:
        raise SystemExit('Official Ghostpdl source archive checksum mismatch')
    files[SOURCE] = source
    files['README.md'] = b'''# IMG.LY Ghostscript 10.08.0 complete build sources

This bundle contains the exact official Ghostpdl source release, including its
bundled dependencies and component notices, plus IMG.LY's pinned build recipe,
upstream ghoulscript build support, full AGPL text and recorded verification.
It includes no WASM binary, CE.SDK integration or customer data.

Ghostscript is developed by Artifex Software and contributors. The build support
originates from Privy / privy-open-source/ghoulscript. Its exact revision and file
hashes are recorded in builds/ghostscript-10.08.0/build-lock.json. IMG.LY-authored
scripts are AGPL-3.0-only; upstream component notices and exceptions remain in
the unmodified sources/ghostpdl-10.08.0.tar.gz. The root LICENSE does not replace
those notices or relicense every bundled dependency.

Rebuild from these sources (Python 3.12+, Docker with Linux ARM64 support):

    python3 scripts/build-wasm.py --output /absolute/new-build-directory \\
      --source-archive sources/ghostpdl-10.08.0.tar.gz --jobs 4

No upstream source download is needed. For a fully offline build, preload the
container image pinned in builds/ghostscript-10.08.0/build-lock.json. The build
container itself runs with network access disabled. See the recipe README and
BUILD-RESULTS.md for adaptations, smoke tests, results and release limitations.

Verify the complete bundle before extraction:

    python3 scripts/build-source-archive.py --verify /path/to/this-bundle.tar.gz

SOURCE-MANIFEST.json records every included file hash and the build-recipe
revision. Preview bundles have sourceRevision=null and must not be published.
'''
    manifest = {'formatVersion': 1, 'sourceRevision': None if args.working_tree else revision,
                'files': {p: digest(data) for p, data in sorted(files.items())}}
    files[MANIFEST] = (json.dumps(manifest, indent=2) + '\n').encode()
    with args.output.open('xb') as raw, gzip.GzipFile(filename='', mode='wb', fileobj=raw, mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode='w|') as archive:
            for path, data in sorted(files.items()):
                info = tarfile.TarInfo(PREFIX + path)
                info.mode = 0o644
                info.size = len(data)
                archive.addfile(info, io.BytesIO(data))
    verify(args.output)


if __name__ == '__main__':
    main()
