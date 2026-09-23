/**
 * Chapters 3 and 4: getting a document out of the host's storage and into
 * the viewer, and which formats survive the trip.
 */
const B = require('../build.js');
const { p, lead, h1, h2, bullet, code, note, table, caption,
        diagramBoundary, diagramIngress, diagramIdentity,
        titleBlock, makeDoc, section, Packer, Paragraph, TextRun,
        TableOfContents, PageBreak, AlignmentType, fs,
        TEAL, RED, GRAPHITE, TEAL_BG, RED_BG } = B;

module.exports = [
  h1('3.  Converting a document from your storage'),
  ...diagramIngress(),

  h2('3.1  Mint the link'),
  p('Generate a short-lived, single-object download URL with your own credentials — a Microsoft '
  + 'Graph download URL, an S3 presigned GET, an Azure blob SAS, a GCS signed URL. Keep the expiry '
  + 'tight; we fetch once, immediately.'),
  p('Do **not** send us a permanent URL, a URL that needs a credential we would have to store, or '
  + 'a path on your internal network — section 3.5 explains what happens.'),

  h2('3.2  Submit'),
  code([
    'curl -X POST https://viewer.example.com/api/conversions \\',
    '  -H "Authorization: Bearer $TOKEN" \\',
    '  -H "Content-Type: application/json" \\',
    '  -H "Idempotency-Key: 8f14e45f-ceea-467a-9f3a-1d2c9b7e4a51" \\',
    '  -d \'{',
    '        "sourceUrl": "https://files.example.test/drawings/site-plan.dwg?token=synthetic",',
    '        "targetFormat": "PDF"',
    '      }\'',
    '',
    '202 Accepted',
    '{ "jobId": "3f2a71c4-9b0e-4a2d-8c11-5e7d9a1b3f40", "status": "PENDING",',
    '  "sourceHost": "files.example.test", "targetFormat": "PDF" }'
  ]),
  p('Both fields are required. `targetFormat` accepts `PDF` and nothing else today — it is in the '
  + 'contract so that adding a second output is additive rather than breaking. The `jobId` is a '
  + 'UUID; use it verbatim on every other endpoint.'),
  p('Requires the `document:convert` permission. Returns in under a second — the work has not '
  + 'happened yet, and that is the design: an endpoint either answers in under a second or hands '
  + 'back a job id in under a second.'),
  note('**Always send `Idempotency-Key`.** A timed-out retry then returns the same job rather than '
     + 'converting the same file twice, and conversion is the expensive operation in this system.'),
  p('**Note what is not echoed back: the URL.** Only its host is kept on the job record. The link '
  + 'is a bearer credential, so it is never written to the database, a log, or a message — which '
  + 'also means you cannot read it back to find out what you sent.'),

  h2('3.3  Poll'),
  code([
    'curl https://viewer.example.com/api/conversions/3f2a71c4-9b0e-4a2d-8c11-5e7d9a1b3f40 \\',
    '  -H "Authorization: Bearer $TOKEN"',
    '',
    '200 OK',
    '{ "jobId": "3f2a71c4-9b0e-4a2d-8c11-5e7d9a1b3f40", "status": "SUCCEEDED",',
    '  "sourceHost": "files.example.test", "sourceFileName": "site-plan.dwg",',
    '  "targetFormat": "PDF", "resultSizeBytes": 486213, "failureReason": null }'
  ]),
  p('`PENDING` while queued, `RUNNING` while working, then one of `SUCCEEDED`, `FAILED` or '
  + '`CANCELLED`. **Those three are terminal and never change again**, so stop polling when you '
  + 'see one. On `FAILED`, read `failureReason`.'),
  p('There is no progress percentage and no sub-stage — the job reports the state it is in, not '
  + 'how far through it is. Back off as you poll; a large IFC will not finish in the first second, '
  + 'and hammering the endpoint only costs you rate limit.'),

  h2('3.4  Collect'),
  code([
    'curl https://viewer.example.com/api/conversions/3f2a71c4-9b0e-4a2d-8c11-5e7d9a1b3f40/content \\',
    '  -H "Authorization: Bearer $TOKEN" -o converted.pdf'
  ]),
  p('Streamed, with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`. '
  + 'Cancel an in-flight job with `DELETE /api/conversions/{jobId}`.'),

  h2('3.5  What we refuse, and why'),
  p('Your URL is dereferenced by our server, which makes it an SSRF vector. Every submission goes '
  + 'through a destination policy that:'),
  bullet('**resolves the hostname and validates the resolved address**, not the string — a name '
       + 'that resolves to `169.254.169.254` is refused however it is spelled;'),
  bullet('refuses loopback, link-local, RFC 1918 (`10/8`, `172.16/12`, `192.168/16`), `::1`, and '
       + '`.internal` names;'),
  bullet('**does not follow redirects at all.** Not “follows a capped number and re-validates” — '
       + 'none. Your link must resolve to the bytes directly;'),
  bullet('requires `https` unless the deployment has explicitly opted out;'),
  bullet('enforces the deployment’s list of permitted storage hosts, where one is configured;'),
  bullet('bounds the fetch: size enforced **during** the stream, plus connect and read timeouts.'),
  note('**The redirect rule is the one most likely to break you.** Plenty of storage 302s to a '
     + 'CDN. Test the exact URL you intend to send, not a URL that eventually reaches the bytes. '
     + 'And ask which hosts are allow-listed on the deployment before you integrate.'),
  p('After the fetch: content type is decided by **magic bytes**, never by your `Content-Type` '
  + 'header or the file extension; the file lands in a quarantine prefix; ClamAV scans it; only '
  + 'then does it convert. An infected file is deleted and the event audited.'),

  h2('3.6  Errors'),
  p('RFC 9457 problem documents throughout, with a `traceId` you can quote.'),
  code([
    '{ "type": "/problems/fetch-not-permitted",',
    '  "title": "Fetch not permitted",',
    '  "status": 422,',
    '  "detail": "The source URL resolves to a private address (10.0.4.19).",',
    '  "traceId": "4f8a1c2e9b7d6a5f3e2d1c0b9a8f7e6d" }'
  ]),
  table([2800, 1200, 5746], [
    { header: true, cells: [{ t: 'Endpoint' }, { t: 'Status', align: AlignmentType.CENTER }, { t: 'Means' }] },
    { cells: [{ t: 'POST /api/conversions' }, { t: '202', align: AlignmentType.CENTER, color: TEAL, bold: true },
      { t: 'Accepted. The Location header names the job to poll — use it rather than assembling the URL yourself' }] },
    { cells: [{ t: '' }, { t: '422', align: AlignmentType.CENTER, color: RED, bold: true },
      { t: 'The link may not be fetched: wrong scheme, an unlisted host, or a refused destination. This is the SSRF refusal — it is a 422, not a 403', fill: RED_BG }] },
    { cells: [{ t: '' }, { t: '429', align: AlignmentType.CENTER, color: RED, bold: true },
      { t: 'The conversion queue is full, not a per-caller rate limit. Retry after the interval in Retry-After' }] },
    { cells: [{ t: 'GET /api/conversions/{jobId}' }, { t: '404', align: AlignmentType.CENTER, color: RED, bold: true },
      { t: 'No such job is visible to you. Note the wording: another tenant’s job is invisible, not forbidden' }] },
    { cells: [{ t: 'DELETE /api/conversions/{jobId}' }, { t: '404', align: AlignmentType.CENTER, color: RED, bold: true },
      { t: 'As above' }] },
    { cells: [{ t: 'GET /{jobId}/content' }, { t: '409', align: AlignmentType.CENTER, color: RED, bold: true },
      { t: 'The job has not succeeded, so there is nothing to download yet. Poll to a terminal state first' }] }
  ]),
  caption('Table 1 — Status codes you will actually meet.'),
  p('Read `detail` and show it. It is written to be shown. Quote `traceId` to support — it is the '
  + 'only thing that ties your failure to our logs.'),

  h1('4.  Formats'),
  table([1500, 1700, 2900, 3646], [
    { header: true, cells: [{ t: 'Input' }, { t: 'Status' }, { t: 'Route' }, { t: 'Notes' }] },
    { cells: [{ t: 'PDF' }, { t: 'Supported', color: TEAL, bold: true },
              { t: 'Passed through; pdfjs-dist' },
              { t: 'OCR available for scanned pages, adds an invisible text layer' }] },
    { cells: [{ t: 'DXF' }, { t: 'Supported', color: TEAL, bold: true },
              { t: 'ezdxf → SVG or PDF' }, { t: 'Text is real and searchable in both' }] },
    { cells: [{ t: 'Office' }, { t: 'Supported', color: TEAL, bold: true },
              { t: 'LibreOffice → PDF' }, { t: 'docx, xlsx, pptx' }] },
    { cells: [{ t: 'IFC' }, { t: 'Supported', color: TEAL, bold: true },
              { t: 'Geometry + hierarchy tree' },
              { t: 'Tree is the primary interface, not a fallback' }] },
    { cells: [{ t: 'DWG', bold: true }, { t: 'Needs ODA', color: RED, bold: true, fill: RED_BG },
              { t: 'ODA → DXF, then as above', fill: RED_BG },
              { t: 'The image ships no DWG reader. The operator supplies an ODA File Converter — see below', fill: RED_BG }] },
    { cells: [{ t: 'DWF', bold: true }, { t: 'Not supported', color: RED, bold: true, fill: RED_BG },
              { t: '—', fill: RED_BG },
              { t: 'No route exists. Autodesk’s Design Web Format is not read by any component of the pipeline', fill: RED_BG }] },
    { cells: [{ t: 'RVT / RFA', bold: true }, { t: 'Not supported', color: RED, bold: true, fill: RED_BG },
              { t: 'Detected and refused', fill: RED_BG },
              { t: 'Recognised by OLE2 magic bytes and rejected with REVIT_BINARY. Identified only so the error is clean', fill: RED_BG }] }
  ]),
  caption('Table 2 — What the pipeline actually accepts. Four supported outright, one conditional, '
        + 'two not supported at all.'),
  note('**DWG now requires an ODA File Converter that the operator supplies.** This changed, and '
     + 'in your favour if you were reading the previous edition. That edition said DWG worked in '
     + 'our hosted service and was unshippable on-premises, because the image bundled LibreDWG '
     + '(GPL-3.0) and distributing it owed recipients corresponding source we did not provide. '
     + '**LibreDWG has been removed.** Nothing encumbered is distributed, and the same rule now '
     + 'applies everywhere: mount an ODA installation, point `ODA_PATH` at it, and DWG works — '
     + 'hosted or on-premises, no distinction. Without one, the deployment has no DWG reader at '
     + 'all. ODA is licensed by you or your operator directly from the Open Design Alliance; check '
     + '`odaRunnable` rather than `odaInstalled` in the status response, because a mount missing '
     + 'its libraries or its execute bit reports as present and is useless.'),
  note('**Only PDF opens inside an embedded frame today.** Everything in this table is supported '
     + 'through the conversion API in section 3. The embed reaches the browser-rendered path only, '
     + 'so an embedded viewer asked for a `.docx` or an `.ifc` returns a 415 naming the format and '
     + 'saying the conversion service is what is missing. If your embedded use case is not '
     + 'PDF-first, raise it — the work is wiring, not design.'),

  h2('4.1  Why RVT and DWF are absent, and what it would take'),
  p('These two are named separately because they are the ones most often assumed, and because the '
  + 'reason they are missing is not “nobody got to it yet”.'),
  p('**RVT (and RFA) is a proprietary Autodesk binary with no open reader.** The pipeline detects '
  + 'it by OLE2 magic bytes and refuses it deliberately, so you get a clean `REVIT_BINARY` error '
  + 'rather than a corrupt render. Every route to supporting it is commercial.'),
  table([3400, 6346], [
    { header: true, cells: [{ t: 'Route' }, { t: 'What it costs' }] },
    { cells: [{ t: 'Autodesk Platform Services (formerly Forge)' },
      { t: 'A cloud API. It SENDS THE MODEL TO AUTODESK, which collides directly with the data-residency and sovereignty position — for a Defence or IRAP-scoped tenant it is not merely a cost question, it is prohibited', fill: RED_BG }] },
    { cells: [{ t: 'Revit itself, plus an export plugin' },
      { t: 'Windows hosts, a licence per seat, and a rendering farm that is not the product’s architecture' }] },
    { cells: [{ t: 'A commercial SDK (ODA BimRv or equivalent)' },
      { t: 'A vendor relationship and a per-deployment fee. ADR 13 settled the same question for DWG by making ODA operator-supplied rather than bundled, so the shape of the answer is known — it is a commercial conversation, not an open one' }] }
  ]),
  caption('Table 3 — The three routes to RVT, and why none is free.'),
  note('The sovereignty collision is the important one. **The cheapest route is the one we can '
     + 'least use**, because the tenants most likely to hold Revit models are also the ones whose '
     + 'data must not leave the jurisdiction.'),
  p('**DWF is unimplemented rather than refused.** It is a ZIP container holding W2D and W3D '
  + 'streams, and reading it is ordinary engineering rather than a licence problem — but no '
  + 'component of the pipeline knows the format today, so a DWF submission will fail as an '
  + 'unrecognised type. If DWF matters to you, say so: it is schedulable work in a way RVT is not.'),
  p('**If you need either, raise it as a commercial requirement, not a bug.** The answer involves '
  + 'a vendor contract and, for RVT, a residency decision that engineering cannot take alone.'),
];
