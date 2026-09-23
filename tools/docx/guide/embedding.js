/**
 * Chapter 5: embedding the viewer, and what a deployment has to configure
 * before a frame will load at all.
 */
const B = require('../build.js');
const { p, lead, h1, h2, bullet, code, note, table, caption,
        diagramBoundary, diagramIngress, diagramIdentity,
        titleBlock, makeDoc, section, Packer, Paragraph, TextRun,
        TableOfContents, PageBreak, AlignmentType, fs,
        TEAL, RED, GRAPHITE, TEAL_BG, RED_BG } = B;

module.exports = [
  h1('5.  Embedding — built, and what your deployment must configure'),
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
  note('**A deployment that has not been told about you refuses your iframe, and the failure '
     + 'looks like a blank frame rather than an error.** `frame-ancestors` is `\'none\'` until '
     + 'your origins are named, deliberately: opening the embed is a configuration act and never '
     + 'a default. This is not something you can set from your side.'),
  p('The setting is `cde.web.embed-parent-origins` — a list of exact origins, `\'none\'` when '
  + 'empty, and validated at startup. Wildcards, the `null` origin, CSP keywords and anything '
  + 'carrying a path are all refused by name, because **a `frame-ancestors` source a browser '
  + 'cannot parse is not a closed door**: the browser drops what it cannot read and applies the '
  + 'rest, so a typo widens the policy rather than breaking visibly. Give your deployment contact '
  + 'the exact origins you will frame from, including scheme and any non-default port.'),
  p('This header is the **authorisation** decision about who may frame the viewer. The '
  + '`parentOrigin` you configure in the handshake is only addressing — it says where the viewer '
  + 'should post, not who is permitted to frame it. A deployment that relaxed only the second '
  + 'would be framable by anyone who sent the right message.'),
  note('**Ask your deployment contact which component serves `/embed`.** The setting governs '
     + 'what the *backend* answers. A stock install now serves the embed document from the '
     + 'backend image itself, so one component emits the document and the header together and '
     + 'there is nothing else to configure. But a deployment that puts the Angular build behind '
     + 'its own web tier has that tier serving the document, and **it needs the same '
     + '`frame-ancestors` value** — the backend’s copy governs only what the backend answers. '
     + 'Two questions, not one: which of your origins are on the allow-list, and what serves the '
     + 'document.'),

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
  bullet('**Listen to as much of the rest as you need, and none of it if you do not.** Section 5.4 '
       + 'lists the lifecycle events. Every one is optional.'),
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

  h2('5.4  Events you can hook, and what each is honestly for'),
  p('Fourteen message types run viewer → host. Four exist purely so you can **record** what a '
  + 'reader did without polling us or inferring it from markup traffic — and the inference is '
  + 'wrong in ways that are not obvious, which is why they exist.'),
  table([2500, 2600, 4646], [
    { header: true, cells: [{ t: 'You want to know' }, { t: 'Listen to' }, { t: 'What to watch out for' }] },
    { cells: [{ t: 'A document was opened' }, { t: 'viewer.opened' },
      { t: 'Fires before the viewer knows whether it can render the file, and before any fetch. Exactly one of viewer.loaded or viewer.error follows it' }] },
    { cells: [{ t: 'It rendered' }, { t: 'viewer.loaded' },
      { t: 'Carries pageCount, mediaType and what rendered it' }] },
    { cells: [{ t: 'Your stored markup arrived' }, { t: 'viewer.markupLoaded' },
      { t: 'Check `rejected`. Non-zero means your store holds markup the viewer cannot draw — a data problem on your side that was previously silent', fill: TEAL_BG }] },
    { cells: [{ t: 'The user drew, changed or removed something' },
      { t: 'viewer.markupCreated / …Updated / …Deleted' },
      { t: 'No author field. You stamp it from the session you already hold (5.5)' }] },
    { cells: [{ t: 'The user selected a markup' }, { t: 'viewer.selectionChanged' },
      { t: 'markupId, or null when nothing is selected' }] },
    { cells: [{ t: 'Which pages were actually read' }, { t: 'viewer.pageRendered' },
      { t: 'Once per page per document. Zooming repaints a page and does NOT re-announce it, which is what makes a "pages read" count mean anything', fill: TEAL_BG }] },
    { cells: [{ t: 'Where the user is now' }, { t: 'viewer.viewChanged' },
      { t: 'Throttled to 4/s. Use this to follow a reader live; use pageRendered to record what was seen' }] },
    { cells: [{ t: 'A document stopped being shown' }, { t: 'viewer.unloaded' },
      { t: 'Carries the id of the document that CLOSED, not the one arriving. Not guaranteed on teardown — see below', fill: RED_BG }] }
  ]),
  caption('Table 4 — The events worth hooking, and the trap in each.'),
  note('**Do not treat `viewer.unloaded` as a guarantee.** If your page removes the iframe, '
     + 'navigates away, or the tab closes, nothing can post from a frame that no longer exists. '
     + 'Use it to close a record you are already keeping, never as the only place you write one — '
     + 'the same caveat that applies to `beforeunload` in your own page, for the same reason.'),
  p('Two more sharp edges worth knowing before you build against these. A document the viewer '
  + '**rejects outright** — a descriptor missing `mediaType`, say — produces `viewer.error` with '
  + 'no `viewer.opened` before it, because there was no document to open. And a `host.loadMarkup` '
  + 'whose `markup` is not an array is **ignored silently and acknowledges nothing**: if you get '
  + 'no `viewer.markupLoaded`, check you sent an array.'),
  p('All four were added after the protocol shipped, which is the compatibility promise working as '
  + 'intended — new message types are additive within v1, so an integration written before them '
  + 'keeps running and simply never registers a handler. Full payloads: §6.3 of '
  + '`docs/viewer-embed-protocol.md`.'),

  h2('5.5  Identity: there is nothing to configure'),
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
];
