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
    { cells: [{ t: 'viewer-state.service' }, { t: '390', align: AlignmentType.CENTER },
      { t: 'The single source of truth. Signals for document, page, zoom, rotation, active tool, selection, sidebar tab, and the version-commit token that makes panels reload after a server-side operation' }] },
    { cells: [{ t: 'markup-engine.service' }, { t: '323', align: AlignmentType.CENTER },
      { t: 'Shape creation and geometry updates. Pointer handling and the in-progress shape moved out to markup-drawing-session when the second surface needed them; what a tool is and where a shape lies moved out to markup-tool-kinds and markup-hit-test when the file went over the section 3.3 limit' }] },
    { cells: [{ t: 'pdf-engine.service' }, { t: '238', align: AlignmentType.CENTER },
      { t: 'pdfjs-dist wrapper — document loading, page rendering to canvas, text-layer extraction' }] },
    { cells: [{ t: 'measurement.service' }, { t: '165', align: AlignmentType.CENTER },
      { t: 'Scale calibration and the geometry behind length, area and radius. unitsPerPixel === 1 with unit px means uncalibrated' }] },
    { cells: [{ t: 'outline.service' }, { t: '147', align: AlignmentType.CENTER },
      { t: 'A PDF’s bookmarks and its link annotations' }] },
    { cells: [{ t: 'drawing-search.service' }, { t: '129', align: AlignmentType.CENTER },
      { t: 'Text search across a converted drawing’s labels' }] }
  ]),
  caption('Table 2 — The six server-independent singletons.'),
  p('Six files carry the `.service` suffix; nine in `viewer-core` are `@Injectable`. '
  + '`drawing-image`, `drawing-viewport` and `markup-drawing-session` are the three that do not, '
  + 'and that is deliberate rather than an oversight \u2014 each is provided per component rather '
  + 'than once for the application, because each holds state for one surface and two surfaces '
  + 'sharing one would see each other’s. Table 2 lists the six singletons.'),
  p('`viewer-state.service` at 390 lines is the closest thing here to the section 3.3 limit, with '
  + 'ten to spare. It is the one to watch, and as of this issue something is watching it.'),

  h2('3.2  Components'),
  p('`cad-viewer` (the DXF/DWG canvas), `ifc-tree` (the model hierarchy), `outline-panel`, '
  + '`page-links`, `tool-rail`, and `icon` — the last being the product’s whole icon set as '
  + 'stroke-only 24×24 path data, so one definition sits on a light rail, a dark header and an '
  + 'accent-filled button without variants.'),
  p('**Every component in `viewer-core` is inside the §3.3 limits.** An earlier issue recorded '
  + '`cad-viewer.component.ts` at 678 lines and called splitting it debt that wanted a runnable '
  + 'test suite first. The suite runs (§12), and the split happened: `cad-viewer` is 118 lines, '
  + 'with the viewport transform, the image lifecycle, the layer panel and the markup overlay '
  + 'each in their own file. `ifc-tree` went the same way, 398 to 198, with a row component and '
  + 'a roving tab stop beside it.'),
  p('The decomposition was not cosmetic. Splitting a file forces every seam through a test, and '
  + 'four defects came out of these two alone: a drawing whose rotation shift had never been '
  + 'asserted, a layer panel whose checkbox the spec bypassed by reaching into the component, an '
  + 'image-viewer branch that could never have run, and model metadata computed, translated and '
  + 'never rendered.'),
  p('**The two production files that were over the 400-line limit are now under it, and a gate '
  + 'measures the limit for the first time.** The last issue recorded '
  + '`markup-drawing-session.ts` at 460 lines and `markup-engine.service.ts` at 434, both over '
  + 'because of the keyboard work in section 9.2 \u2014 the honest cost of the single-pointer '
  + 'alternative, which gave the state machine and the engine each a cursor, a key interpreter '
  + 'and the geometry behind them. It said splitting a state machine wanted its own verification '
  + 'rather than being folded into a documentation pass. That verification is this issue’s work.'),
  table([3400, 1300, 5046], [
    { header: true, cells: [{ t: 'Was' }, { t: 'Now' }, { t: 'Extracted to' }] },
    { cells: [{ t: 'markup-drawing-session.ts  460' }, { t: '381' },
      { t: 'markup-keyboard-drawing.ts (147)' }] },
    { cells: [{ t: 'markup-engine.service.ts  434' }, { t: '323' },
      { t: 'markup-tool-kinds.ts (156), markup-hit-test.ts (83)' }] },
  ]),
  caption('Table 2a \u2014 The two files split to come back inside the section 3.3 limit.'),
  p('Each split followed a seam the files already had. The engine delegated its rendering to '
  + '`svg-primitives.ts` and `markup-svg.ts` and said in a comment that it did so to stay near '
  + 'the limit; the tool predicates and the hit test went the same way, so every one of them is '
  + 'still a method on the service and no caller changed. The drawing session’s keyboard route '
  + 'was already a labelled section: it became a class holding one thing \u2014 where the cursor '
  + 'is \u2014 that hands every action to the same press/move/release state machine the pointer '
  + 'drives. **It does not re-implement the gesture**, which is the whole reason that file '
  + 'exists; the dependency runs one way, from the session to the keys.'),
  p('Three defects came out of it, all of the kind that only surfaces when somebody moves code: '
  + 'the doc comment for `finishesShape` had come adrift and was sitting above '
  + '`toleranceInUserUnits`’s own comment, so the longest explanation in the file documented '
  + 'nothing; the comment describing `withPreviewPoint` sat above `isVertexTool`; and the hit '
  + 'test’s default arm silently reports “not hit” for every shape it does not know, which is a '
  + 'real gap rather than a safe default and is now written down where the code is.'),
  p('The splits were verified by breaking them. The coarse keyboard step, the polygon vertex '
  + 'minimum and the hit test’s search direction were each inverted in turn, and each failed '
  + 'exactly the tests that name it \u2014 five keyboard tests, two vertex tests, two '
  + 'topmost-shape tests \u2014 and nothing else.'),
  note('**Nothing had been measuring the limit, and that is the defect behind the defect.** '
     + 'Section 3.3 sets two hard limits \u2014 400 lines for a file, 200 for an Angular '
     + 'component \u2014 and a limit nothing measures holds only until somebody is in a hurry. '
     + 'Both were crossed by the accessibility work and the only thing that noticed was a later '
     + 'reading of this document against the code. `scripts/check-file-size.mjs` now measures '
     + 'them over 330 code files, runs as `npm run check:file-size`, and is wired into the '
     + 'pipeline’s static analysis stage.'),
  p('It ships with a baseline, because failing seventeen files on day one is how a gate gets '
  + 'switched off by the second day. Each is recorded at its measured length and **may only '
  + 'shrink**: a file on the baseline that grows fails, and one that comes back inside the limit '
  + 'fails until its entry is deleted. The same ratcheting floor as `check-i18n-markup.mjs`. Its '
  + 'own spec breaks the ratchet two ways \u2014 stopping the growth check, and an off-by-one '
  + 'that fails a compliant file \u2014 and each failed exactly the test naming it.'),
  p('**This passage has also been wrong in the other direction, and that is worth keeping.** Two '
  + 'issues ago it named two spec files as the next thing to split \u2014 '
  + '`ifc-tree.visibility.spec.ts` at 458 and `markup-drawing-session.spec.ts` at 408. Both were '
  + 'split; they are 109 and 110 lines, and nothing recorded that the debt had been paid. A '
  + 'document that keeps claiming work is outstanding after it is done misleads as much as one '
  + 'claiming work is finished when it is not, and the second kind at least gets corrected when '
  + 'somebody looks.'),
  p('And the sentence this passage used to open with \u2014 “four files are over the 400-line '
  + 'limit” \u2014 was true only of `viewer-core`, which is not what it said. The gate counts '
  + 'every root, and the real figures are these.'),
  table([5200, 1200, 3346], [
    { header: true, cells: [{ t: 'What is over' }, { t: 'Count' }, { t: '' }] },
    { cells: [{ t: 'Spec files over 400' }, { t: '12' },
      { t: 'largest markup-engine.service.spec.ts at 691' }] },
    { cells: [{ t: 'demo/public/host.js over 400' }, { t: '1' }, { t: '401, the demo host page' }] },
    { cells: [{ t: 'Components over 200' }, { t: '4' },
      { t: 'embed-viewer 245, pdf-markup-layer 218, pdf-form-design 213, login 201' }] },
  ]),
  caption('Table 2b \u2014 Everything on the file-size baseline.'),
  p('**Every component in `viewer-core` is inside the 200-line limit** \u2014 the largest is '
  + '`ifc-tree` at 198. The four that are over are all in `src/app`, and the earlier claim that '
  + '“every component is inside again” was true of `viewer-core` and false of the application. '
  + 'They are the next real debt, and they are production code, unlike most of the baseline.'),
  note('**Twelve of the seventeen baseline entries are spec files, and whether section 3.3’s '
     + 'limit is meant to bind a spec file is an open question for the team, not one this '
     + 'document should answer** (section 0.7 \u2014 flag the conflict rather than quietly '
     + 'picking). The limit as written says “files”, so that is what the gate measures. If the '
     + 'team decides a 500-line spec of independent cases is not the hazard a 500-line service '
     + 'is, the exclusion belongs in section 3.3 and then in the gate \u2014 not as a silent '
     + 'condition inside a script.'),

  h2('3.3  What is deliberately not here'),
  p('The 38 viewer components still in the application are not there by accident. Eighteen '
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
  p('`src/app/features/embed/` — 1,338 lines of production TypeScript across seven files, with 2,216 '
  + 'lines of spec beside them. It is deliberately **not** in `viewer-core`: the protocol is how a '
  + 'host talks to a deployment of the viewer, so it belongs to the application that is deployed, '
  + 'while `viewer-core` stays the part that knows no backend exists.'),
  note('The figures in the paragraph above read “1,128 across six, with 811 of spec” until this '
     + 'issue, while the diagram in section 2 already said seven files and 1,338 lines. **The '
     + 'document contradicted itself two hundred lines apart**, because the last pass corrected '
     + 'the diagram and never reached the prose. Worth stating rather than quietly fixing: a '
     + 'figure is only as good as the last place it appears.'),
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
      { t: 'Translation between the viewer’s ShapeData and the protocol’s Markup — the only part of the session with no session state, so it tests against the two representations directly' }] },
    { cells: [{ t: 'embed-stroke-session.ts' },
      { t: 'A stroke in progress on the embed surface, kept out of embed-page.component so the component stays inside the section 3.3 limit of 200 lines. It was missing from this table, which is how the file count came to be wrong' }] }
  ]),
  caption('Table 3 — The embed implementation.'),
  p('**Thirteen message types run viewer → host and six run host → viewer.** Four of the thirteen '
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
  p('Eleven Playwright tests drive the demo in a real browser against a stub viewer on a third '
  + 'origin. They earn their keep: three defects no unit test could reach were found there — a '
  + 'captured `contentWindow` going stale across navigation, an author `display` rule beating the '
  + 'user agent’s `[hidden] { display: none }` so a placeholder swallowed every click, and the '
  + 'page and the server disagreeing about the viewer’s origin.'),
  p('Four, now. The eleventh test exists because **the demo was missing a documented event, and '
  + 'the demo is what an integrator reads instead of the specification.** '
  + '`viewer.selectionChanged` is in the protocol\u2019s event table and is genuinely sent by '
  + '`embed-session.service.ts`, and the demo neither handled it nor summarised it in its log '
  + '\u2014 so a host built by copying the reference integration would have omitted it without '
  + 'anything saying so. It now highlights the stored row whose markup the reader has selected, '
  + 'and clears the highlight when the selection goes to `null` \u2014 the half most likely to '
  + 'be got wrong, because a host that treats a clear as a selection leaves the last row '
  + 'highlighted for ever.'),

  h2('4.3  A documented event that nothing sent'),
  note('Checking the demo against the protocol found the drift running the other way too, and '
     + 'worse. **`viewer.resized` was declared in the `ViewerMessageType` union and documented '
     + 'in `docs/viewer-embed-protocol.md` \u2014 the file `embed-protocol.ts` names as the '
     + 'authority \u2014 with a payload shape of `{ contentHeightPx }` and guidance on when a '
     + 'host should ignore it. No code path ever sent it.**'),
  p('A host implementing the published protocol would wire a handler, size its frame to the '
  + 'content, and wait for an event that never arrives. Nothing errors. The frame simply never '
  + 'resizes, and the integrator looks for the bug in their own code, because the document they '
  + 'are working from says the event exists.'),
  p('No test could have caught it: the event nothing sends is also the event nothing asserts, so '
  + 'the suite was green and the protocol was wrong. What catches it is a comparison between the '
  + 'three places the protocol describes itself \u2014 the union, the `send` calls, and the '
  + 'authority\u2019s event table \u2014 which is now the `check:embed-protocol` gate in '
  + '\u00a712.2. It was verified by putting the defect back and watching it fail, and it names '
  + 'the consequence rather than the discrepancy: *a host that handles it waits for an event that '
  + 'never arrives.*'),
  note('The event is removed rather than implemented, and that is a deliberate choice with an '
     + 'open question behind it. The viewer paginates and scrolls internally, so \u201ccontent '
     + 'height\u201d has no single meaning \u2014 one page, all pages, or the current fit '
     + '\u2014 and the answer is entangled with whether the viewer should ever manage its own '
     + 'scrolling, which changes the accessibility story around focus and scroll containers. '
     + '**That decision is open; advertising the event before it is made is not a way of keeping '
     + 'it open.** A host that wants the frame to follow the content measures it from its own '
     + 'page.'),

  h2('4.4  What the embed cannot open'),
  note('**Only PDF renders in an embedded frame today.** `embed-session.service.ts` treats '
     + '`application/pdf` as directly renderable and refuses everything else with a 415 '
     + '`conversion-required` problem naming the format. The conversion service in section 6 '
     + 'exists and works — the embed path simply does not call it yet. Office and IFC are '
     + 'therefore supported by the product and **not** supported through the embed, which is a '
     + 'distinction worth stating before a customer discovers it.'),
];
