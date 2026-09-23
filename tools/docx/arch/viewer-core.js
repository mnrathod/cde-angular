/**
 * Chapters 3 and 4: the rendering core, and the surface a host embeds.
 */
const B = require('../build.js');
const { p, lead, h1, h2, h3, bullet, code, note, table, caption,
        diagramBoundary, diagramIngress, diagramIdentity,
        titleBlock, makeDoc, section, Packer, Paragraph, TextRun,
        TableOfContents, PageBreak, HeadingLevel, AlignmentType, fs,
        TEAL, RED, GRAPHITE, HEAD_BG, TEAL_BG, RED_BG } = B;

module.exports = [
  h1('3.  viewer-core'),
  h2('3.1  Services'),
  table([2600, 900, 6246], [
    { header: true, cells: [{ t: 'Service' }, { t: 'Lines' }, { t: 'Responsibility' }] },
    { cells: [{ t: 'viewer-state.service' }, { t: '375', align: AlignmentType.CENTER },
      { t: 'The single source of truth. Signals for document, page, zoom, rotation, active tool, selection, sidebar tab, and the version-commit token that makes panels reload after a server-side operation' }] },
    { cells: [{ t: 'markup-engine.service' }, { t: '372', align: AlignmentType.CENTER },
      { t: 'Shape creation, geometry updates and hit testing. Pointer handling and the in-progress shape moved out to markup-drawing-session when the second surface needed them' }] },
    { cells: [{ t: 'pdf-engine.service' }, { t: '238', align: AlignmentType.CENTER },
      { t: 'pdfjs-dist wrapper — document loading, page rendering to canvas, text-layer extraction' }] },
    { cells: [{ t: 'measurement.service' }, { t: '165', align: AlignmentType.CENTER },
      { t: 'Scale calibration and the geometry behind length, area and radius. unitsPerPixel === 1 with unit px means uncalibrated' }] },
    { cells: [{ t: 'outline.service' }, { t: '147', align: AlignmentType.CENTER },
      { t: 'A PDF’s bookmarks and its link annotations' }] },
    { cells: [{ t: 'drawing-search.service' }, { t: '129', align: AlignmentType.CENTER },
      { t: 'Text search across a converted drawing’s labels' }] }
  ]),
  caption('Table 2 — The six server-independent services.'),

  h2('3.2  Components'),
  p('`cad-viewer` (the DXF/DWG canvas), `ifc-tree` (the model hierarchy), `outline-panel`, '
  + '`page-links`, `tool-rail`, and `icon` — the last being the product’s whole icon set as '
  + 'stroke-only 24×24 path data, so one definition sits on a light rail, a dark header and an '
  + 'accent-filled button without variants.'),
  p('**Every component in `viewer-core` is now inside the §3.3 limits.** The last issue recorded '
  + '`cad-viewer.component.ts` at 678 lines and called splitting it debt that wanted a runnable '
  + 'test suite first. The suite runs (§12), and the split happened: `cad-viewer` is 118 lines, '
  + 'with the viewport transform, the image lifecycle, the layer panel and the markup overlay '
  + 'each in their own file. `ifc-tree` went the same way, 398 to 190, with a row component and '
  + 'a roving tab stop beside it.'),
  p('The decomposition was not cosmetic. Splitting a file forces every seam through a test, and '
  + 'four defects came out of these two alone: a drawing whose rotation shift had never been '
  + 'asserted, a layer panel whose checkbox the spec bypassed by reaching into the component, an '
  + 'image-viewer branch that could never have run, and model metadata computed, translated and '
  + 'never rendered.'),
  note('Two spec files remain over the 400-line file limit — `ifc-tree.visibility.spec.ts` (458) '
     + 'and `markup-drawing-session.spec.ts` (408). Recorded rather than hidden; they are the '
     + 'next thing to split.'),

  h2('3.3  What is deliberately not here'),
  p('The 33 viewer components still in the application are not there by accident. Eighteen '
  + 'import the platform’s HTTP services directly; the rest are presentational children produced '
  + 'by the §3.3 decomposition, and those move as they are — a page card, a signature stamp, a '
  + 'form-field row and a toolbar have no opinion about where their data came from.'),
  p('That count rose while the coupling did not, which is the point: splitting an oversized '
  + 'component multiplies files, and the question “what still has to move” is answered by the '
  + 'eighteen, not the thirty-three. `viewer.component` is no longer among them — it was dead '
  + 'and has been deleted.'),
  p('**ADR 12’s open step 4 is now closed.** ADR 14 decided the rule: reads and computations are '
  + 'viewer-side, and anything that changes the document is a callback into the host. That covers '
  + 'seventeen operations, and three of them — `document.sign`, `version.create`, '
  + '`version.restore` — never become viewer-side whatever else changes, because a signature over '
  + 'a copy the host has since replaced is worse than no signature. What remains is the work of '
  + 'moving these components, not the question of where they go.'),

  h1('4.  The embed surface'),
  lead('New since the last issue of this document, and the reason its status line changed. The '
     + 'contract ADR 14 settled is now code on both sides.'),
  p('`src/app/features/embed/` — 1,128 lines of production TypeScript across six files, with 811 '
  + 'lines of spec beside them. It is deliberately **not** in `viewer-core`: the protocol is how a '
  + 'host talks to a deployment of the viewer, so it belongs to the application that is deployed, '
  + 'while `viewer-core` stays the part that knows no backend exists.'),
  table([2900, 6846], [
    { header: true, cells: [{ t: 'File' }, { t: 'What it does' }] },
    { cells: [{ t: 'embed-protocol.ts' },
      { t: 'The envelope, the message union, and the validators. No Angular, no DOM — it is the contract as types plus the predicates that enforce them' }] },
    { cells: [{ t: 'host-channel.service.ts' },
      { t: 'The postMessage boundary. Every inbound message is checked in a fixed order: origin, then event.source, then protocol envelope, then direction' }] },
    { cells: [{ t: 'embed-session.service.ts' },
      { t: 'The session state machine — ready, awaiting init, loaded, failed — and the document-open path' }] },
    { cells: [{ t: 'embed-page.component.ts' },
      { t: 'The rendering surface and the markup overlay' }] },
    { cells: [{ t: 'embed-viewer.component.ts' },
      { t: 'The /embed route component. No auth guard, deliberately — the viewer authenticates nobody' }] },
    { cells: [{ t: 'markup-wire-format.ts' },
      { t: 'Translation between the viewer’s ShapeData and the protocol’s Markup — the only part of the session with no session state, so it tests against the two representations directly' }] }
  ]),
  caption('Table 3 — The embed implementation.'),
  p('**Fourteen message types run viewer → host and six run host → viewer.** Four of the fourteen '
  + 'are lifecycle events — `viewer.opened`, `viewer.unloaded`, `viewer.markupLoaded` and '
  + '`viewer.pageRendered` — added after the first integrations asked how to record what a reader '
  + 'did. None is required: a host can ignore every one and still open documents and collect '
  + 'markup. Adding them was additive within v1, which is the compatibility promise in §10 of the '
  + 'protocol doing the job it exists for.'),
  note('**`viewer.pageRendered` is deduplicated per document, and that is the whole point of it.** '
     + 'Zooming repaints a page; it is not a second reading of it. An undeduplicated stream would '
     + 'inflate a “pages read” figure by however many times the user changed zoom, and a host '
     + 'building that metric would have no way to tell. The viewer deduplicates so that every host '
     + 'does not have to, and so that the ones that forget are not silently wrong.'),

  h2('4.1  Five rules, and the order they are checked in'),
  p('§5.13.8 and the protocol’s own §3 give five rules that are not negotiable: never post to '
  + '`\'*\'`, check the origin on every message rather than once, check `event.source` as well as '
  + 'the origin, validate in both directions, and never put a credential in a message. The first '
  + 'four are enforced in `host-channel.service.ts`, in that order, and a message failing any of '
  + 'them is dropped with the reason recorded.'),
  note('**The order is load-bearing, and so is checking `event.source`.** Origin alone is not '
     + 'enough: any frame on the host’s page — an advertisement, a third-party widget — posts from '
     + 'the host’s origin. Without the source check a sibling frame can drive the viewer, and '
     + 'nothing about the message would look wrong.'),

  h2('4.2  Two implementations, checked against each other'),
  p('`demo/public/host-protocol.js` is an independent implementation of the host half — 237 lines '
  + 'of plain JavaScript, no framework, no build step, no dependency on anything in this '
  + 'repository. `protocol-conversation.spec.ts` then runs the **real** viewer channel against the '
  + '**real** demo host through two fake windows, and asserts the conversation rather than either '
  + 'side’s internals.'),
  p('That is worth more than either side tested against a mock. A mock encodes the same '
  + 'assumption the implementation makes, so the two agree by construction; two implementations '
  + 'written from the specification disagree wherever the specification was ambiguous, which is '
  + 'exactly where an integrator would have disagreed with us.'),
  note('**A green test proves nothing until the thing it guards is broken on purpose.** The '
     + 'host-trusts-the-author rule passed its first test while broken, because the viewer never '
     + 'sends an author and the test asserted an outcome rather than forging the field. The test '
     + 'that works posts a `viewer.markupCreated` carrying `author: "Someone Else"` and asserts '
     + 'the host stores the name from its own session instead.'),
  p('Eight Playwright tests drive the demo in a real browser against a stub viewer on a third '
  + 'origin. They earn their keep: three defects no unit test could reach were found there — a '
  + 'captured `contentWindow` going stale across navigation, an author `display` rule beating the '
  + 'user agent’s `[hidden] { display: none }` so a placeholder swallowed every click, and the '
  + 'page and the server disagreeing about the viewer’s origin.'),

  h2('4.3  What the embed cannot open'),
  note('**Only PDF renders in an embedded frame today.** `embed-session.service.ts` treats '
     + '`application/pdf` as directly renderable and refuses everything else with a 415 '
     + '`conversion-required` problem naming the format. The conversion service in section 6 '
     + 'exists and works — the embed path simply does not call it yet. Office and IFC are '
     + 'therefore supported by the product and **not** supported through the embed, which is a '
     + 'distinction worth stating before a customer discovers it.'),
];
