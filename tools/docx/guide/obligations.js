/**
 * Chapters 6 onward: what is settled and what is still open, the obligations
 * a host inherits by shipping this, and the checklist.
 */
const B = require('../build.js');
const { p, lead, h1, h2, bullet, code, note, table, caption,
        diagramBoundary, diagramIngress, diagramIdentity,
        titleBlock, makeDoc, section, Packer, Paragraph, TextRun,
        TableOfContents, PageBreak, AlignmentType, fs,
        TEAL, RED, GRAPHITE, TEAL_BG, RED_BG } = B;

module.exports = [
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
  bullet('**No real CDE has integrated it yet** — section 5.2. Our own demo host drives the '
       + 'whole protocol against a served viewer; your storage, your documents and your users '
       + 'are the parts nobody has exercised.'),
  bullet('**Non-PDF formats in an embedded frame** — section 4. Wiring, not design.'),
  bullet('**Collaboration in an embed** — section 5.5. Genuinely unsolved.'),
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
     + 'evaluated by an audit. If your bid depends on ours, ask for the current state in writing '
     + 'rather than citing this guide.'),
  p('What we can tell you honestly, because each item has a test that fails when it regresses:'),
  bullet('The model hierarchy tree implements the full tree pattern — roving tab stop, arrow '
       + 'navigation, `aria-level` and `aria-expanded` per row.'),
  bullet('Page reordering and the comparison wipe, both previously drag-only, have keyboard '
       + 'routes (SC 2.5.7).'),
  bullet('Icon-only controls carry accessible names rather than announcing their glyph.'),
  bullet('Form controls are programmatically associated with their labels, their validation '
       + 'messages and their hints; required fields say so to assistive technology rather than '
       + 'only showing an asterisk.'),
  bullet('Long operations and their results are announced through live regions.'),
  note('**And what we cannot.** No axe run, no Lighthouse budget, no screen-reader pass against '
     + 'the supported matrix, and no CI gate producing any of them. One known functional gap: '
     + '**markup shapes cannot yet be created or moved without a pointer**, which is an SC 2.5.7 '
     + 'failure in the annotation layer specifically. If your customers annotate drawings and '
     + 'your bid claims AA, raise this with us before you sign.'),

  p('**Localisation.** The viewer has no hardcoded user-facing strings. Everything a reader sees '
  + 'carries a stable message id and a translator note, extracted to a committed catalogue — 552 '
  + 'messages — with two CI gates keeping it honest: one fails if the catalogue drifts from '
  + 'source, the other if a template grows text a translator will never see.'),
  note('**We ship the source catalogue, not translations.** The messages are English and there '
     + 'are no other locales in the repository. If you sell into a market that needs French or '
     + 'Arabic, you supply the translated catalogue; the mechanism to consume it is Angular’s '
     + 'standard `$localize` pipeline and costs you a build per locale, not a fork. RTL layout '
     + 'has been kept in mind throughout — logical properties rather than `left`/`right` — but '
     + 'has not been verified against a real RTL locale, because there is not one to verify '
     + 'against.'),
  p('A few sentences still reach the screen in English from the server, in the places where only '
  + 'the server knows what happened. We have replaced them wherever the response also carries a '
  + 'status code the client can word itself, which is most of them, but a host serving a '
  + 'non-English market should expect a small residue and ask us to name it for the paths they '
  + 'care about.'),
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
  bullet('**Have you given your deployment contact the exact origins you will frame from, and '
       + 'confirmed they are on `cde.web.embed-parent-origins`?**'),
  bullet('**Have you confirmed what will serve the `/embed` document on that deployment?**'),
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
