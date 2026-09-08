# Word build for the viewer product documents

Regenerates `docs/Viewer-Product-Technical-Architecture.docx` and
`docs/Viewer-Product-Integration-Guide.docx`.

```bash
cd tools/docx
npm init -y && npm install docx     # see "The dependency" below
node arch.js && node guide.js
mv *.docx ../../docs/
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

This does mean the repository names a dependency that no lockfile pins, which
§0.3 would normally have something to say about. The position taken is that a
documentation build tool run by hand is not a supply-chain surface in the way an
application dependency is. If that judgement is wrong, the fix is a lockfile in
this directory rather than an entry in the app's manifest.

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

**LibreOffice cannot render anything in the dev container.** `soffice` fails
with "source file could not be loaded" on a plain `.txt`, so the usual
convert-to-PDF-and-look verification is unavailable there. What can still be
checked: the skill's XSD validator
(`scripts/office/validate.py`, needs `defusedxml` and `lxml`), the archive
parts, and the text extraction above. **Layout has not been visually verified**
— if a column is cramped or a code block wraps badly, that is why.
