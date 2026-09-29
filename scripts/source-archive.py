#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
"""Archive HEAD's exact Git blobs, without attribute-based line ending changes."""

import argparse
import gzip
import io
import subprocess
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def git(*args):
    return subprocess.check_output(["git", "-C", str(ROOT), *args])


def create_archive(output):
    timestamp = int(git("show", "-s", "--format=%ct", "HEAD"))
    entries = git("ls-tree", "-rz", "HEAD").split(b"\0")
    with output.open("xb") as raw, gzip.GzipFile(
        filename="", mode="wb", fileobj=raw, mtime=timestamp
    ) as compressed, tarfile.open(fileobj=compressed, mode="w|") as archive:
        with subprocess.Popen(
            ["git", "-C", str(ROOT), "cat-file", "--batch"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
        ) as objects:
            for entry in entries:
                if not entry:
                    continue
                meta, name = entry.split(b"\t", 1)
                mode, kind, blob = meta.split()
                if kind != b"blob":
                    raise RuntimeError("Source tree contains a non-file entry.")
                objects.stdin.write(blob + b"\n")
                objects.stdin.flush()
                object_id, object_kind, size = objects.stdout.readline().split()
                if object_id != blob or object_kind != b"blob":
                    raise RuntimeError("Unexpected Git object response.")
                data = objects.stdout.read(int(size))
                if len(data) != int(size) or objects.stdout.read(1) != b"\n":
                    raise RuntimeError("Incomplete Git object response.")
                member = tarfile.TarInfo("pdf-utils/" + name.decode())
                member.mtime = timestamp
                if mode == b"120000":
                    member.type = tarfile.SYMTYPE
                    member.linkname = data.decode()
                    member.mode = 0o777
                    archive.addfile(member)
                else:
                    member.mode = 0o755 if mode == b"100755" else 0o644
                    member.size = len(data)
                    archive.addfile(member, io.BytesIO(data))
            objects.stdin.close()
            if objects.wait() != 0:
                raise RuntimeError("git cat-file failed.")
    print(f"Created exact source archive: {output}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="New archive path; must not exist")
    args = parser.parse_args()
    create_archive(args.output)
