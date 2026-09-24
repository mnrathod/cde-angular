# Word build for the viewer product documents

Regenerates `docs/Viewer-Product-Technical-Architecture.docx` and
`docs/Viewer-Product-Integration-Guide.docx`.

```bash
cd tools/docx
npm init -y && npm install docx            # see "The dependency" below
node arch.js && node guide.js

# PDF/UA export — the same standard §1A.4 imposes on the product's own exports
OPTS='pdf:writer_pdf_Export:{"UseTaggedPDF":{"type":"boolean","value":"true"},"PDFUACompliance":{"type":"boolean","value":"true"}}'
soffice --headless --convert-to "$OPTS" --outdir . *.docx

mv *.docx *.pdf ../../docs/
```

Verify the export is actually tagged rather than assuming the flags took:

```bash
pdfinfo ../../docs/Viewer-Product-Integration-Guide.pdf | grep -E 'Tagged|Pages'
# Tagged: yes
```

## Why this exists

The `.docx` files are committed, which is a deliberate exception to the usual
rule against binaries in a repository: they are handed to customers and to
procurement, and a reviewer asking "what did we send Asite" should be able to
open the exact file rather than reconstruct it.

The cost of that exception is drift. A committed binary has no diff, so nobody
notices when it stops matching its source. **This generator is the mitigation.**
The markdown beside it in `docs/` remains the source of truth; if you change
`viewer-architecture.md` or `viewer-integration-guide.md`, rerun this and commit
the result in the same change, exactly as §3.5 requires of the OpenAPI spec and
for the same reason.

## The dependency

`docx` (npm, MIT) is **deliberately not in the application's `package.json`.**
It builds documents; it has no business in the Angular dependency graph, where
it would be audited, scanned and shipped as though the product used it. Install
it here, locally, when you need to rebuild.

`package.json` and `package-lock.json` here are **committed**, so the version
and the whole resolved tree are pinned. They were both ignored until
2026-09-24, on the reasoning that a documentation build tool run by hand is
not a supply-chain surface the way an application dependency is. That
reasoning does not hold: being run by hand changes who types the command, not
what gets installed, and these documents go to customers. A compromised or
re-licensed release would have been picked up silently on the next rebuild
with nothing to compare against (§9.1, §17.2).

The installed tree stays out of the repository. `npm ci` in this directory
reproduces it.

The tree is 22 packages, all permissive: MIT and ISC throughout, except
`jszip` (`MIT OR GPL-3.0-or-later` — we take the MIT grant), `pako`
(`MIT AND Zlib`, both permissive) and `sax` (`BlueOak-1.0.0`, per
docs/licences.md §3.6). Nothing on §2.1's forbidden list. These are not
redistributed — the documents are output, not a derivative of the
generator's dependencies — so no attribution obligation attaches to them.

## Structure

| File | What it holds |
|---|---|
| `build.js` | Shared helpers — palette, inline `**bold**` / `` `code` `` parser, tables, callouts, and the three diagram builders |
| `arch.js` | Content of the technical architecture document |
| `guide.js` | Content of the integration guide |

### Diagrams are Word tables, not images

All three figures — the integration boundary, the conversion ingress, and the
identity coupling — are built as shaded, bordered tables rather than embedded
pictures.

That started as a constraint (no SVG rasteriser available) and stayed as a
preference: a table is editable by the reader, reflows, prints without
resolution loss, and carries no binary payload of its own. If you replace them
with images later, the figures are the only part that needs changing — the
callers just spread the returned array.

### Two things that will bite

**The inline parser recurses into bold.** A code span nested inside a bold span
(`**\`viewer-core\` is the product.**`) has to be split twice or the backticks
render literally. That was a real defect caught by extracting the visible text
and grepping it, not by reading the code — worth repeating after any change to
`runs()`:

```bash
python3 - <<'PY'
import zipfile, re
d = zipfile.ZipFile('Viewer-Product-Technical-Architecture.docx').read('word/document.xml').decode()
text = ''.join(re.findall(r'<w:t[^>]*>([^<]*)</w:t>', d))
print({b: text.count(b) for b in ('**', '`', '\\n')})   # all should be 0
PY
```

**Bold in a table cell must be set on the run, not around it.** `cell()` passes
`bold` down into `runs()`. An earlier version rewrapped the returned runs —
`new TextRun({ ...run, bold: true })` — which spreads a *class instance* and so
yields its internals rather than `{text, font, size}`. Every bold cell rendered
**completely empty**: all six table headers, and the one cell in Figure 1 that
says the ingress is BUILT. The XML checks above did not catch it, because the
runs existed and were well-formed; they simply had no text. Only a rendered
page showed it.

That is the argument for the render step below being mandatory rather than
nice-to-have.

## Rendering, and the trap in this container

`soffice` ships here with **only `libreoffice-core` and `libreoffice-common`** —
no application modules. With no `writer.xcd` there is no Writer, so LibreOffice
cannot load a `.docx`, and cannot load a plain `.txt` either. The symptom is a
flat `Error: source file could not be loaded` for every input, which reads like
a corrupt file and is actually a missing package:

```bash
apt-get install -y libreoffice-writer poppler-utils
```

The converter service's own Dockerfile installs what it needs; this is a gap in
the development container only. Worth knowing because the error blames your
document.

With that installed, look at the output rather than trusting it:

```bash
pdftoppm -jpeg -r 80 ../../docs/Viewer-Product-Technical-Architecture.pdf page
# then open page-1.jpg … page-9.jpg
```
