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
    ['**Read section 1 before planning anything.** All four exchanges an integration needs are now '
   + 'built, and you can run a working host application from our repository today. **One response '
   + 'header on the viewer deployment still refuses the frame**, so the embed does not yet work '
   + 'against a stock install. This guide says which parts you can build on now and which you '
   + 'cannot, rather than describing an interface you would then fail to find.']),

  p('Companion document: **Technical Architecture**, for how the thing works internally.'),

  new Paragraph({ children: [new PageBreak()] }),
  h1('Contents'),
  new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-3' }),
  new Paragraph({ children: [new PageBreak()] }),

  h1('1.  What you can build against today'),
  ...diagramBoundary(),
  p('Two things are true at once, and conflating them will cost you a sprint.'),
  p('**The protocol is real.** `cde.viewer.v1` is implemented on both sides, and our repository '
  + 'ships a host application — plain HTML and JavaScript, no framework, no build step — that '
  + 'frames the viewer, drives the handshake, stores markup, and refuses an operation. You can '
  + 'clone it, run it, and read it as the thing you are about to write. Section 5 tells you how.'),
  p('**The deployment is not.** A stock viewer deployment sends '
  + '`Content-Security-Policy: frame-ancestors \'none\'` on every route, so the browser refuses '
  + 'the frame before your first message is sent. Until that becomes a per-tenant allow-list on '
  + 'the embed route, the embed works against a development deployment and not against an '
  + 'installed one. Ask before you schedule anything around it.'),
  p('**The conversion API has no such caveat.** Section 3 is a complete, working integration you '
  + 'can ship against today, inside your own interface, with your own rendering — and for a '
  + '“preview any file format” feature that is often the whole requirement.'),

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

  h1('5.  Embedding — built, and what your deployment still needs'),
  lead('An iframe and a versioned postMessage protocol. The viewer authenticates nobody and '
     + 'authorises nothing: you mint a short-lived URL for the document, tell it a name to '
     + 'display, and receive what the user did — every operation that changes anything comes back '
     + 'to you to authorise server-side.'),
  p('Recorded as ADR 14 (`cde-platform`, `docs/adr/0014-viewer-embed-and-identity-contracts.md`), '
  + 'with the message-level detail in `docs/viewer-embed-protocol.md`. Both sides are now '
  + 'implemented, and the protocol document is the normative one — where it and this guide '
  + 'disagree, it wins.'),

  h2('5.1  Run the demo host first'),
  p('`demo/` in the frontend repository is a host application that frames the viewer. It is not '
  + 'the viewer, and that is the point: **it is the side you are about to write**, in plain HTML, '
  + 'CSS and JavaScript with no framework, no build step and no dependencies, because your stack '
  + 'is your business.'),
  code([
    'npm start                # the viewer, on :4200',
    'node demo/server.mjs     # the host,   on :4401',
    '',
    '# then open http://localhost:4401',
    '# viewer somewhere else?',
    'VIEWER_ORIGIN=https://viewer.example node demo/server.mjs'
  ]),
  p('Two ports deliberately: a different port is a different origin, so the demo exercises the '
  + 'real cross-origin path — origin checks on every message, CORS on the document fetch, '
  + '`frame-ancestors` on the viewer. A demo served from one origin would pass with every one of '
  + 'those broken.'),
  p('It ships three generated sample documents and a message log down the side, so the handshake '
  + 'is visible as it happens. Worth trying in this order: open the drawing and watch '
  + '`viewer.ready` → `host.init` → `viewer.loaded`; draw on it and see the markup appear in the '
  + 'host’s store; reload the page and reopen the document, and watch the markup come back — the '
  + 'viewer forgot, the host remembered; change the display name and draw again, and see the new '
  + 'name stamped on a markup the viewer never put a name on. Then tick `document:sign` and use '
  + 'Sign: the control renders and the operation is **refused**, and both of those are correct.'),

  h2('5.2  The one thing your viewer deployment must change'),
  note('**A stock deployment sends `Content-Security-Policy: frame-ancestors \'none\'` on every '
     + 'route, plus `X-Frame-Options: SAMEORIGIN`.** Your iframe will be refused by the browser '
     + 'before any of this protocol runs, and the failure looks like a blank frame rather than an '
     + 'error. This is known, it is the single blocker between the protocol and a working '
     + 'integration, and it is not something you can configure from your side.'),
  p('What it has to become: `frame-ancestors` stays `\'none\'` on every route **except** the embed '
  + 'route, where it names your origins, from tenant configuration, and is never a wildcard. '
  + 'Note that this header is the **authorisation** decision about who may frame the viewer. The '
  + '`parentOrigin` you configure in the handshake is only addressing — it says where the viewer '
  + 'should post, not who is permitted to frame it. A deployment that relaxed only the second '
  + 'would be framable by anyone who sent the right message.'),
  p('Ask your viewer deployment contact two questions before you scope the work: whether the '
  + 'embed route’s `frame-ancestors` allow-list exists yet, and which of your origins are on it.'),

  h2('5.3  The minimum integration'),
  p('Four steps, and none of them involve a token.'),
  bullet('**Frame the embed route** and listen for messages, checking `event.origin` against the '
       + 'viewer origin on every single one — not once at setup.'),
  bullet('**Wait for `viewer.ready`**, then post `host.init` with the document (a short-lived URL, '
       + 'its media type, a display name, and your own `externalId`) and, if the user may do more '
       + 'than read, an identity block.'),
  bullet('**Store what comes back.** `viewer.markupCreated`, `…Updated` and `…Deleted` carry the '
       + 'markup; `shapeData` is an opaque string you store and hand back, never parse. Stamp the '
       + 'author yourself from the session you already hold.'),
  bullet('**Answer `viewer.operationRequest`** with `host.operationResult` — `applied`, `refused` '
       + 'or `failed`. One message pair covers all seventeen document operations; they are not '
       + 'seventeen message types.'),
  note('**Send no credential in any message, in either direction.** The document URL is a bearer '
     + 'credential with a short life and is the only thing resembling one that crosses the '
     + 'boundary; it is never stored, logged, or echoed back to you. Never post to `\'*\'`.'),
  p('One subtlety worth internalising early: **a `refused` must be possible even for an operation '
  + 'whose capability you granted in `host.init`.** Capabilities decide which controls render; '
  + 'authorisation happens when the operation is requested. If the two ever disagree — the user’s '
  + 'permission changed thirty seconds ago — the `refused` is correct and the rendered button was '
  + 'merely stale.'),
  p('Three operations never become viewer-side, whatever else changes: `document.sign`, '
  + '`version.create` and `version.restore`. A signature over a copy you have since replaced is '
  + 'worse than no signature, and the viewer cannot know whether its copy is still current.'),
  p('One constraint from the previous edition of this guide is unchanged and still catches people: '
  + '**the CORS source registers no origin at all unless the deployment names one in full.** For a '
  + 'PDF, the browser fetches your URL directly, so your storage must allow the viewer’s origin to '
  + 'read it.'),

  h2('5.4  Identity: there is nothing to configure'),
  p('Not “you need to set up SSO”. The embed path has no identity system to configure at all. Our '
  + 'own `/api/annotations` still keys a markup’s author to a row in our user table — integrating '
  + 'through *that* API would mean shadow-provisioning your users into our database, a '
  + 'data-protection conversation before it is an engineering one. The embed never reaches it.'),
  ...diagramIdentity(),
  p('**Three untrusted fields, and that is the whole of it.** You send a display name, an opaque '
  + 'subject id, and a list of capabilities. All three are used for presentation and for deciding '
  + 'which controls render; none is trusted for authorisation, because the browser is not a place '
  + 'authorisation happens. The author is stamped by whoever persists the markup — you. Nothing '
  + 'about your users reaches our database.'),
  note('You do **not** need to mint a JWT, and you do not need an identity provider we can talk '
     + 'to. If an earlier version of this guide told you to prepare a signed assertion with a '
     + 'stable subject claim, disregard it — that was written while the question was open, and '
     + 'the answer went the other way. **Sending no identity at all is a supported read-only '
     + 'deployment**, not a degraded one.'),
  p('One consequence to plan around: **live collaboration is not available in an embed.** Cursors '
  + 'and presence ride a socket authenticated by a viewer session, and an embedded viewer has no '
  + 'session by design. That is the acknowledged cost of “the viewer authenticates nobody”, and it '
  + 'is unsolved rather than decided against.'),

  h1('6.  What is settled, and what is still open'),
  lead('Everything in the first list is decided and implemented — design against it. Everything in '
     + 'the second is a real gap we would rather you heard from us than discovered.'),
  h2('Settled'),
  bullet('**Embedding is an iframe** with a per-tenant `frame-ancestors` allow-list. Not a web '
       + 'component: the viewer renders untrusted documents, and sharing your origin would mean a '
       + 'document that escapes the PDF renderer runs with your session on your domain.'),
  bullet('**Identity is three untrusted fields** — a display name, an opaque subject id, and '
       + 'capability flags that decide which controls render and nothing else. No signed '
       + 'assertion, no viewer session, no JWT.'),
  bullet('**Markup comes back as events**, with the geometry as an opaque string you store and '
       + 'hand back. There is no author field — you stamp that.'),
  bullet('**Document identity is yours.** Pass an `externalId` in the handshake and it comes back '
       + 'on every event, so you never hold a map between your id and ours.'),
  bullet('**One message pair covers all seventeen document operations**, and three of them — sign, '
       + 'create version, restore version — will never move to the viewer.'),
  bullet('**The protocol version is in every message, and `viewer.ready` tells you which versions '
       + 'the deployment speaks.** Read it and pick; do not assume. Within v1 we may add message '
       + 'types, optional fields, commands and operations — you ignore what you do not recognise, '
       + 'which is why the rule is *validate*, not *reject on unknown field*. Removing anything '
       + 'needs v2, announced with at least six months’ notice and both versions running over the '
       + 'overlap.'),
  h2('Still open'),
  bullet('**`frame-ancestors` on the embed route** — section 5.2. The blocker.'),
  bullet('**Non-PDF formats in an embedded frame** — section 4. Wiring, not design.'),
  bullet('**Collaboration in an embed** — section 5.4. Genuinely unsolved.'),
  bullet('**Accessibility evidence.** See section 7 before you rely on ours.'),
  p('Full message shapes: `docs/viewer-embed-protocol.md`. Where this guide and that document '
  + 'disagree, that document is the normative one.'),

  h1('7.  Obligations you inherit'),
  p('**Accessibility.** WCAG 2.2 AA is a procurement gate in the UK, EU, Australia and the US, and '
  + 'an embedded viewer becomes part of *your* conformance claim. If you embed our WebGL model '
  + 'view, you inherit the requirement for an equivalent accessible route to the same information '
  + '— we provide the hierarchy tree for exactly this reason, and it needs to remain reachable in '
  + 'your integration. Exports must be tagged and PDF/UA-conformant.'),
  note('**Do not inherit a conformance claim from us, because we are not making one yet.** An '
     + 'accessibility statement, a VPAT 2.5 INT conformance report and a screen-reader matrix all '
     + 'exist in our repository, and all three record the same thing: no criterion has been '
     + 'evaluated by test. Real work has been done — keyboard-reachable controls, a visible focus '
     + 'indicator throughout, `prefers-reduced-motion` honoured, an authentication flow that meets '
     + 'SC 3.3.8 by construction — but none of it has been through an audit, and an untested claim '
     + 'is worth nothing in a procurement. If your bid depends on ours, ask for the current state '
     + 'in writing rather than citing this guide.'),
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
  bullet('Have you run the demo host and watched a handshake? (`demo/README.md`)'),
  bullet('Have you read the embed protocol? (`docs/viewer-embed-protocol.md`)'),
  bullet('**Have you confirmed the embed route’s `frame-ancestors` allow-list exists on the '
       + 'deployment you will integrate with, and that your origins are on it?**'),
  bullet('Can you mint a short-lived URL for a document, and serve a page that frames us?'),
  bullet('Does your storage allow the viewer’s origin to read that URL from the browser?'),
  bullet('Do you check `event.origin` on every message, not once at setup?'),
  bullet('Do you have somewhere to store markup that is not the rendered file, and do you stamp '
       + 'the author from your own session rather than from the message?'),
  bullet('Do you know which of the 17 document operations you need to implement as callbacks, and '
       + 'can you return `refused` as readily as `applied`?'),
  bullet('Is your embedded use case PDF-first, or do you need the conversion path wired in?'),
  note('**The integration you can ship against a stock deployment today is still section 3.** The '
     + 'embed is built and demonstrable, and it needs one header changed on the viewer side before '
     + 'it runs anywhere but a development install. Scope it as something to plan with us rather '
     + 'than something to build against unilaterally — and if all you need is viewing, converting '
     + 'through section 3 and rendering the result yourself remains a complete feature with none '
     + 'of these caveats.')
];

const doc = makeDoc([section(children, 'Viewer product — Integration Guide   ·   page ')]);
Packer.toBuffer(doc).then(b => {
  fs.writeFileSync('Viewer-Product-Integration-Guide.docx', b);
  console.log('guide written:', b.length, 'bytes');
});
