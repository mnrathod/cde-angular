const B = require('./build.js');
const { p, lead, h1, h2, bullet, code, note, table, caption,
        diagramBoundary, diagramIngress, diagramIdentity,
        titleBlock, makeDoc, section, Packer, Paragraph, TextRun,
        TableOfContents, PageBreak, AlignmentType, fs,
        TEAL, RED, GRAPHITE, TEAL_BG, RED_BG } = B;

const children = [
  ...titleBlock(
    'Integration Guide',
    'For an engineer at a common data environment — Asite, Procore, Dalux, or your own — who has '
  + 'to make this viewer open your customers’ documents.',
    ['**Read section 1 before planning anything.** One of the four exchanges an integration needs '
   + 'is built. The other three are not, and this guide says so rather than describing an '
   + 'interface you would then fail to find.']),

  p('Companion document: **Technical Architecture**, for how the thing works internally.'),

  new Paragraph({ children: [new PageBreak()] }),
  h1('Contents'),
  new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-3' }),
  new Paragraph({ children: [new PageBreak()] }),

  h1('1.  What you can build against today'),
  ...diagramBoundary(),
  p('So: you can convert and render your customers’ documents through our API today, inside your '
  + 'own interface, using your own rendering. You cannot yet embed our viewer, and if you do get '
  + 'it on screen it has no way to know who your user is.'),
  p('If that is enough — and for a “preview any file format” feature it often is — section 3 is a '
  + 'complete, working integration. If you need markup round-tripping, section 6 is what you are '
  + 'waiting for.'),

  h1('2.  The shape of it'),
  p('Your CDE keeps its documents and its users. The viewer borrows a document briefly, converts '
  + 'it, and discards it.'),
  p('**We never hold your credentials** and never learn which storage platform your link points '
  + 'at. SharePoint, S3, Azure Blob and GCS all reduce to “a URL that works for fifteen minutes”, '
  + 'which is the property that makes this portable across CDEs rather than a per-vendor '
  + 'connector.'),

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
    { cells: [{ t: 'DWG', bold: true }, { t: 'Hosted only', color: RED, bold: true, fill: RED_BG },
              { t: '→ DXF, then as above', fill: RED_BG },
              { t: 'Works in our hosted service. NOT shippable on-premises — see below', fill: RED_BG }] },
    { cells: [{ t: 'DWF', bold: true }, { t: 'Not supported', color: RED, bold: true, fill: RED_BG },
              { t: '—', fill: RED_BG },
              { t: 'No route exists. Autodesk’s Design Web Format is not read by any component of the pipeline', fill: RED_BG }] },
    { cells: [{ t: 'RVT / RFA', bold: true }, { t: 'Not supported', color: RED, bold: true, fill: RED_BG },
              { t: 'Detected and refused', fill: RED_BG },
              { t: 'Recognised by OLE2 magic bytes and rejected with REVIT_BINARY. Identified only so the error is clean', fill: RED_BG }] }
  ]),
  caption('Table 2 — What the pipeline actually accepts. Four supported, one hosted-only, two not '
        + 'supported at all.'),
  note('**DWG has no clean licensing path for a distributed product.** The two converters have '
     + 'opposite problems: LibreDWG is GPL-3.0 and ships in our image (so distribution owes '
     + 'corresponding source we do not currently provide), and the ODA File Converter cannot be '
     + 'redistributed at all. In our hosted service DWG works. For an on-premises install, '
     + '**assume DWG is unavailable unless your contract says otherwise** and you have obtained '
     + 'an ODA licence yourself. Tracked as ADR 13, referred to counsel, unresolved. Do not plan a '
     + 'DWG workflow on the assumption this resolves in your favour.'),

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
      { t: 'A vendor relationship and a per-deployment fee, with the same redistribution question ADR 13 is already stuck on' }] }
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

  h1('5.  Embedding — read before you scope it'),
  p('Three constraints, all currently blocking.'),
  table([2600, 7146], [
    { header: true, cells: [{ t: 'Constraint' }, { t: 'Reality today' }] },
    { cells: [{ t: 'Framing', bold: true },
      { t: 'Content-Security-Policy: frame-ancestors \'none\'. A cross-origin iframe will not render', fill: RED_BG }] },
    { cells: [{ t: 'Cross-origin XHR', bold: true },
      { t: 'The CORS source registers no origin at all unless a deployment names one in full', fill: RED_BG }] },
    { cells: [{ t: 'Session', bold: true },
      { t: 'A bearer token from our own /api/auth/login, against our own user table. No cookie mode, no silent SSO, no token exchange', fill: RED_BG }] }
  ]),
  caption('Table 4 — Why an embedded integration cannot be scoped yet.'),
  p('The only path that works today is **serving our Angular build from your own origin, behind '
  + 'the same web tier that proxies `/api`**. Same-origin needs no CORS entry, no framing '
  + 'relaxation, and no cross-origin token handling. It is also a deployment of our application '
  + 'into your infrastructure, which is probably not what you meant by “integrate”.'),
  note('**If you only need viewing**, the honest recommendation is to skip the embed entirely: use '
     + 'section 3 to convert, and render the resulting PDF or SVG in your own interface with your '
     + 'own viewer. That avoids all three constraints and is a complete feature.'),

  h2('5.1  What the identity gap actually means'),
  p('Not “you need to configure SSO”. There is nothing to configure. A markup’s author is a '
  + 'foreign key into our user table, so **your user must exist as a row in our database before '
  + 'they can annotate anything.** Any integration today means shadow-provisioning your users into '
  + 'our system, which is a data-protection conversation before it is an engineering one.'),
  ...diagramIdentity(),
  p('The fix is an opaque issuer-and-subject reference plus a display name you supply, so you stay '
  + 'the system of record for who your people are. It is not built. If markup attribution matters '
  + 'to you, say so — it moves the priority.'),

  h1('6.  What to plan for, not against'),
  lead('When the contract lands, these are the shapes to expect. None of this is implemented; do '
     + 'not build against it yet. It is here so your architecture does not paint itself into a '
     + 'corner.'),
  bullet('**Embedding** will be an iframe with a per-tenant `frame-ancestors` allow-list, a '
       + 'published web component, or both. Keep your viewer container swappable.'),
  bullet('**Identity** will be a signed assertion you issue, exchanged for a short-lived viewer '
       + 'session. Make sure you can mint a JWT with a stable subject claim per user.'),
  bullet('**Markups** will come back either as events on a callback you host or as a document you '
       + 'pull. Have a place to put them that is not the rendered file.'),
  bullet('**Document identity** — we currently key on our own numeric id. An external identifier '
       + 'is planned; keep your own id available at the boundary.'),

  h1('7.  Obligations you inherit'),
  p('**Accessibility.** WCAG 2.2 AA is a procurement gate in the UK, EU, Australia and the US, and '
  + 'an embedded viewer becomes part of *your* conformance claim. If you embed our WebGL model '
  + 'view, you inherit the requirement for an equivalent accessible route to the same information '
  + '— we provide the hierarchy tree for exactly this reason, and it needs to remain reachable in '
  + 'your integration. Exports must be tagged and PDF/UA-conformant.'),
  p('**Trademarks.** “Works with Microsoft SharePoint” is nominative fair use. '
  + '“Microsoft-approved”, their logo, or any implication of partnership is not. The same applies '
  + 'to Amazon, Google and Autodesk. Integration documentation is where this goes wrong most '
  + 'easily, in both directions.'),
  note('**Certification claims.** Do not describe this product as SOC 2, ISO 27001 or IRAP '
     + 'certified. Those certifications are not currently held, and stating otherwise is a '
     + 'misrepresentation with regulatory consequences rather than a marketing stretch.'),

  h1('8.  Integration checklist'),
  h2('Today'),
  bullet('Can you mint a short-lived, single-object download URL from your storage?'),
  bullet('Does that URL resolve to the bytes directly, with no redirect?'),
  bullet('Do you have somewhere to hold a job id between submit and collect?'),
  bullet('Do you generate an `Idempotency-Key` per logical submission?'),
  bullet('Do you back off while polling, and honour `Retry-After` on `429`?'),
  bullet('Do you surface `detail` and `traceId` from problem documents to your support path?'),
  bullet('Have you confirmed your DWG position?'),
  h2('Before you scope an embedded integration'),
  bullet('Has the embed contract been decided? (Section 5 — currently no)'),
  bullet('Has the identity contract been decided? (Section 5.1 — currently no)'),
  bullet('Do you know which of the 17 document operations you need? (Section 6)'),
  note('If the last three are all “no”, the buildable integration is section 3 and nothing else. '
     + 'That is a real feature and it works — it is just smaller than “embed the viewer”, and '
     + 'worth scoping as what it is.')
];

const doc = makeDoc([section(children, 'Viewer product — Integration Guide   ·   page ')]);
Packer.toBuffer(doc).then(b => {
  fs.writeFileSync('Viewer-Product-Integration-Guide.docx', b);
  console.log('guide written:', b.length, 'bytes');
});
