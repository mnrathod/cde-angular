/**
 * Chapters 5 to 8: rendering pipelines, server-side conversion, document
 * ingress, and where state lives.
 */
const B = require('../build.js');
const { p, lead, h1, h2, h3, bullet, code, note, table, caption,
        diagramBoundary, diagramIngress, diagramIdentity,
        titleBlock, makeDoc, section, Packer, Paragraph, TextRun,
        TableOfContents, PageBreak, HeadingLevel, AlignmentType, fs,
        TEAL, RED, GRAPHITE, HEAD_BG, TEAL_BG, RED_BG } = B;

module.exports = [
  h1('5.  Three rendering pipelines'),
  p('**PDF** is rendered in the browser by `pdfjs-dist` 6. Text layer extracted for search and '
  + 'redaction; markup drawn as SVG in a layer above the canvas so it scales with zoom without '
  + 're-rasterising.'),
  p('**DXF/DWG** cannot be rendered by the browser at all. The converter turns a DXF into SVG '
  + 'server-side; DWG is converted to DXF first. The result is an SVG the browser renders '
  + 'directly, with an invisible text layer over it for search — the same trick the PDF viewer '
  + 'uses, for the same reason.'),
  p('**IFC** is rendered with `three` 0.185 as WebGL geometry, with `ifc-tree` carrying the model '
  + 'hierarchy alongside it. **The tree is the primary interface and the canvas is the visual '
  + 'layer over it**, not the other way round — a WebGL canvas cannot be made WCAG-conformant on '
  + 'its own, and §1A.4 requires an equivalent accessible route to the same information. Building '
  + 'the tree first is what makes that true rather than aspirational.'),

  h2('5.1  The same drawing, rendered twice, on purpose'),
  p('A DXF is converted twice, by two different paths, and the reason is not obvious enough to '
  + 'leave undocumented.'),
  p('**For the viewer**, geometry is drawn as SVG paths and the text is emitted as `<text>` with '
  + '`fill="none"` — invisible, positioned, selectable. The browser draws the glyphs from the '
  + 'geometry; the invisible layer exists only so search and selection have something to hit.'),
  p('**For PDF export**, that trick is inverted. LibreOffice discards SVG text it cannot see, so '
  + 'an invisible layer would produce a PDF with no extractable text at all. The print render '
  + 'therefore draws **no** glyph geometry (`TextPolicy.IGNORE`) and emits **visible** `<text>`, '
  + 'which LibreOffice turns into real, searchable PDF text.'),
  note('**The consequence that bites: calibration must measure what was actually drawn.** The '
     + 'viewer render includes glyph paths, so it measures the whole layout; the print render '
     + 'draws no text, so it measures geometry only. Using the wrong set silently shifts every '
     + 'label on the sheet.'),
  p('A related trap, recorded because it cost a day: rendering white-on-white passes every test '
  + 'that checks the PDF exists, has pages, and contains text. Only rasterising the output and '
  + 'measuring ink coverage catches it, and that check now lives in the converter’s test suite.'),

  h1('6.  Why conversion is server-side and stays there'),
  p('Office documents go through LibreOffice, DWG through the ODA File Converter, OCR '
  + 'through Tesseract, DXF through `ezdxf`. None of these run in a browser, and all of them are '
  + 'heavy native parsers on untrusted input — §5.13.10 requires them in a sandboxed, '
  + 'resource-limited, network-isolated worker with a timeout, out of process.'),
  p('This is the constraint that rules out the otherwise-attractive design where the browser '
  + 'fetches straight from the customer’s storage and we never see the file: **that architecture '
  + 'cannot render a .docx at all.**'),

  h2('6.1  DWG — resolved by removing the encumbered binary'),
  p('**Changed since the last issue.** Two tools can turn binary DWG into DXF, and they had '
  + 'opposite licence problems.'),
  table([2400, 3673, 3673], [
    { header: true, cells: [{ t: '' }, { t: 'LibreDWG dwg2dxf' }, { t: 'ODA File Converter' }] },
    { cells: [{ t: 'Licence', bold: true }, { t: 'GPL-3.0' }, { t: 'Proprietary' }] },
    { cells: [{ t: 'In the image', bold: true },
      { t: 'No longer — removed', color: TEAL, bold: true },
      { t: 'No — the operator supplies it' }] },
    { cells: [{ t: 'The problem it had', bold: true },
      { t: 'We shipped it and owed every recipient corresponding source we did not provide, so any distribution of the image was a breach', fill: RED_BG },
      { t: 'We cannot ship it, so a customer install has no DWG unless they obtain one themselves', fill: RED_BG }] }
  ]),
  caption('Table 4 — Two converters, opposite licence problems — and how the first one was ended.'),
  p('**ADR 13 was resolved on 2026-09-08 by deleting the problem rather than answering it.** '
  + 'LibreDWG is gone from the converter image, so nothing encumbered is distributed and the '
  + 'licence finding closes by deletion. The image now contains **no DWG reader at all**; DWG '
  + 'requires an operator-supplied ODA File Converter, mounted into the container and pointed at '
  + 'by `ODA_PATH`.'),
  p('That is a smaller product and a defensible one. It also costs nothing in fidelity — ODA is '
  + 'the reference implementation, and the pipeline was designed around it before LibreDWG was '
  + 'added as a fallback. Every other format is unaffected: DXF renders through `ezdxf` with no '
  + 'external tool, and Office, PDF and IFC never touched LibreDWG. The counsel questions become '
  + 'live again only if bundled DWG is ever wanted.'),
  p('A supplied ODA is fully supported: discovered from a directory or a binary, launched inside a '
  + 'virtual framebuffer (it is a Qt application and opens a display even converting from the '
  + 'command line), probed once at startup, and reported as `odaRunnable` distinctly from '
  + '`odaInstalled` — a mount missing its libraries or its execute bit is present and useless.'),
  note('`libredwgInstalled` remains in the status response, always `false`, marked deprecated with '
     + 'a sunset of 2027-04-01. §3.4 forbids removing a field inside an API version without at '
     + 'least six months’ notice, and a client branching on it reads the truth — the tool is not '
     + 'installed.'),

  h1('7.  Document ingress'),
  p('The server-side half of exchange 3, and the one an integrator can use without embedding '
  + 'anything. The host mints a short-lived URL with its own credentials and posts it; the viewer '
  + 'fetches once, converts, and discards.'),
  ...diagramIngress(),
  p('A refused destination is a **422**, and a job belonging to another tenant is a **404** rather '
  + 'than a 403 — invisible, not forbidden. Every operation requires `document:convert`.'),
  p('**The viewer never holds a customer credential** and never learns which storage platform the '
  + 'URL points at — SharePoint, S3, Azure Blob and GCS all reduce to the same code path. That '
  + 'property is what makes “integrates with any CDE” a design rather than a slogan.'),
  p('**The source URL is never stored.** It is a bearer credential with a short life; persisting '
  + 'it would turn the job table into a credential store. Only its host is kept on the job record.'),
  p('The address is checked twice, deliberately: cheaply on submission so an obviously wrong value '
  + 'fails fast with a clear message, and again against the resolved address at fetch time, which '
  + 'is the check that actually decides. No pattern can validate what a name will resolve to.'),

  h2('7.1  The gap under this, narrowed but not closed'),
  p('The two halves now meet for one format. The embed opens a PDF by fetching the host’s URL '
  + 'directly from the browser — no server of ours is involved, which is the best possible answer '
  + 'for the one format that needs no conversion.'),
  note('**For every other format the halves still do not meet.** `/api/conversions` works and the '
     + 'embed does not call it, so an embedded viewer asked for a `.docx` or an `.ifc` returns a '
     + '415 `conversion-required` rather than converting it. The application’s own front end '
     + 'likewise still reads `/api/viewer/{id}` and `/api/documents/*`, which assume the platform '
     + 'owns the document. Wiring the embed to the conversion service is the single change that '
     + 'turns “PDF only” into the format list in section 6.'),

  h1('8.  State'),
  p('Angular signals throughout, with `ViewerStateService` as the single store. No NgRx, no '
  + 'observable soup: the viewer’s state is small, synchronous and local — zoom, page, tool, '
  + 'selection — and a store framework would add indirection without adding capability.'),
  p('Server-side operations that rewrite the document (redaction, OCR, flatten, form fill, page '
  + 'rearrange) commit a **new version** and bump a reload token. Panels watch the token rather '
  + 'than each other, which is what lets those operations compose: each starts from the previous '
  + 'one’s output rather than from the untouched original.'),
];
