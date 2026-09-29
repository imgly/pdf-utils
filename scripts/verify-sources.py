#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Verify the historical source snapshot and optionally a complete Git archive."""

import argparse
import hashlib
import json
import subprocess
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def git(*args):
    return subprocess.check_output(["git", "-C", str(ROOT), *args]).strip()


def require(condition, message):
    if not condition:
        raise SystemExit(message)


def verify_sources():
    sources = json.loads((ROOT / "provenance/sources.json").read_text())
    ghostpdl = sources["ghostpdl"]
    require(
        git("rev-parse", f"HEAD:{ghostpdl['prefix']}").decode() == ghostpdl["tree"],
        "Ghostpdl's committed tree differs from the pinned upstream tree.",
    )
    require(
        not git("status", "--porcelain", "--untracked-files=all", "--", ghostpdl["prefix"]),
        "Ghostpdl has local changes; verify a clean source checkout.",
    )
    for entry in sources["ghoulscript"]["files"]:
        path = ROOT / entry["path"]
        if entry["path"] == "packages/ghostscript/build.sh":
            original = (ROOT / "provenance/build.sh.upstream").read_bytes()
            expected = original.replace(
                b'# Cleanup\ncd "$ROOT/ghostpdl"\ngit clean -xdf\ngit checkout .',
                b'# IMG.LY: Ghostpdl is a subtree, not a separate Git checkout. Leave build\n'
                b'# outputs in place; the original submodule cleanup is unsafe in this layout.',
            )
            require(path.read_bytes() == expected, "Unexpected build-script adaptation.")
            data = original
        else:
            data = path.read_bytes()
        require(hashlib.sha256(data).hexdigest() == entry["sha256"], f"Changed source: {path}")
    entries = git("ls-tree", "-r", "HEAD").splitlines()
    require(not any(line.startswith(b"160000 ") for line in entries), "Unresolved gitlink found.")
    require(not (ROOT / ".gitmodules").exists(), "Unexpected submodule configuration.")
    require(
        (ROOT / "LICENSE").read_bytes() == (ROOT / "packages/ghostscript/LICENSE").read_bytes(),
        "Root license differs from the upstream package license.",
    )
    print(f"Verified {len(entries)} tracked files, pinned Ghostpdl tree, build adaptation and no gitlinks.")


def verify_archive(path):
    expected = {}
    for entry in git("ls-tree", "-rz", "HEAD").split(b"\0"):
        if entry:
            meta, name = entry.split(b"\t", 1)
            mode, kind, blob = meta.decode().split()
            require(kind == "blob", "Archive source contains a non-file entry.")
            expected["pdf-utils/" + name.decode()] = (mode, blob)
    seen = set()
    with tarfile.open(path, "r:gz") as archive:
        for member in archive:
            if member.isdir():
                continue
            require(member.name in expected and member.name not in seen, f"Unexpected archive entry: {member.name}")
            mode, blob = expected[member.name]
            if mode == "120000":
                require(member.issym(), f"Expected symlink: {member.name}")
                data = member.linkname.encode()
            else:
                require(member.isfile(), f"Expected regular file: {member.name}")
                require(bool(member.mode & 0o111) == (mode == "100755"), f"Changed executable mode: {member.name}")
                data = archive.extractfile(member).read()
            digest = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
            require(digest == blob, f"Changed archive contents: {member.name}")
            seen.add(member.name)
    require(seen == set(expected), f"Archive is missing {len(set(expected) - seen)} files.")
    print(f"Verified all {len(seen)} archive files and symlinks against HEAD.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path)
    args = parser.parse_args()
    verify_sources()
    if args.archive:
        verify_archive(args.archive)
