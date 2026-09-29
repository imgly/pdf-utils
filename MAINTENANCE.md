# Maintaining the source archive

## Update the two upstream inputs separately

This is an extracted source repository, not an unchanged fork of the ghoulscript
monorepo. Do not merge the whole ghoulscript repository into this layout: its
Ghostpdl gitlink would conflict with our actual source directory.

1. Select and review a ghoulscript revision and inspect its Ghostpdl gitlink.
2. Import changes to its Ghostscript package and required root build support.
   Preserve original files in provenance when applying local adaptations. Keep
   compiler/linker changes separate from the cleanup adaptation.
3. Update Ghostpdl with `git subtree` using the **reviewed full commit**, not a
   moving default branch. From the repository root:

   ```sh
   git subtree pull --prefix=packages/ghostscript/ghostpdl \
     https://github.com/ArtifexSoftware/ghostpdl.git <reviewed-full-commit> --squash
   ```

4. Update `provenance/sources.json` and verify the imported tree against upstream.
   Preserve license and dependency notices. Check whether new gitlinks or build
   dependencies require inclusion. Do not update hashes merely to silence a
   failed source verification.
5. For binary releases, pin the Emscripten/LLVM versions and build environment,
   record artifact hashes, run conversion tests and review distribution terms.
   Source import alone is not binary release approval.
6. Create a new immutable source tag and keep previously distributed source
   versions available. Never move an existing source tag to an updated tree.

## Produce a complete source archive

After committing and verifying the selected source revision:

```sh
python3 scripts/verify-sources.py
python3 scripts/source-archive.py ../pdf-utils-source.tar.gz
python3 scripts/verify-sources.py --archive ../pdf-utils-source.tar.gz
```

The archive verification compares every archived file and symlink with the Git
tree, including Ghostpdl. Attach the verified archive and its SHA-256 to the
matching source release. This archive needs neither Git submodules nor access
to an external upstream checkout.

The archive script reads Git blobs directly and refuses to overwrite an existing
file. Plain `git archive` applies the upstream `.gitattributes` rules and converts
line endings in some `.inf` files. The attached archive preserves exact Git blob
contents; GitHub's automatic source archives may apply those line-ending rules.

Git may warn about attribute macros in Ghostpdl's nested `.gitattributes` file.
Those upstream definitions are retained for source identity; Git only accepts
macro definitions at the top level. These warnings do not indicate missing
files and must not be confused with source verification failures.
