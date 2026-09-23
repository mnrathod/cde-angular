/**
 * Title block, contents, and what a host can build against today.
 *
 * <p>One file per group of chapters, because this was a single 504-line
 * array — past the §3.3 limit. `guide.js` concatenates them, so the order of
 * the document lives in one place and a chapter can be edited on its own.
 */
const B = require('../build.js');
const { p, lead, h1, h2, bullet, code, note, table, caption,
        diagramBoundary, diagramIngress, diagramIdentity,
        titleBlock, makeDoc, section, Packer, Paragraph, TextRun,
        TableOfContents, PageBreak, AlignmentType, fs,
        TEAL, RED, GRAPHITE, TEAL_BG, RED_BG } = B;

module.exports = [
  ...titleBlock(
    'Integration Guide',
    'For an engineer at a common data environment — Asite, Procore, Dalux, or your own — who has '
  + 'to make this viewer open your customers’ documents.',
    ['**Read section 1 before planning anything.** All four exchanges an integration needs are '
   + 'built, you can run a working host application from our repository today, and a stock '
   + 'install now serves the embed document and carries the `frame-ancestors` allow-list to put '
   + 'your origins on. **What has not been exercised end to end is a real document opening '
   + 'inside a real host frame**, so treat section 4 as the contract and your first integration '
   + 'as the thing that proves it. This guide says which parts you can build on now and which '
   + 'are newer than anyone’s production traffic.',
     '**Since the last issue**, nothing in the protocol has changed — section 5 is the same '
   + 'contract. What changed is what you inherit when you embed it: section 7 now states our '
   + 'accessibility and localisation position in enough detail to answer a procurement '
   + 'questionnaire without overstating it, including the one functional accessibility gap that '
   + 'is still open.']),

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
  p('**The deployment now exists, and is new.** The image serves the viewer’s pages itself when '
  + '`cde.web.app.path` points at a staged build, so one container answers both `/embed` and the '
  + 'API, and emits the `Content-Security-Policy` that governs the document it just served. '
  + '`cde.web.embed-parent-origins` names the origins permitted to frame that route and is '
  + 'closed until someone sets it — so ask your deployment contact to add your origin before '
  + 'you test, because until they do the frame comes up blank with an error only your browser '
  + 'console will show you.'),
  p('**What that deployment has been through.** The demo host in our repository has been run '
  + 'against it end to end: the document opens, pages render, markup is drawn and stored by the '
  + 'host, the host page is reloaded and the markup comes back and is painted, and the host '
  + 'drives page and zoom. That run found six defects, all fixed, none of which any unit test in '
  + 'this repository had caught. What it has *not* been through is a real CDE, a real document '
  + 'store and real users — so treat section 4 as the contract and budget a spike for your first '
  + 'integration.'),
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
];
