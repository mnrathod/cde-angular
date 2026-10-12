/**
 * Chapter 9: the accessibility and localisation architecture, and what the
 * structural decisions behind it actually cost.
 */
const B = require('../build.js');
const { p, lead, h1, h2, h3, bullet, code, note, table, caption,
        diagramBoundary, diagramIngress, diagramIdentity,
        titleBlock, makeDoc, section, Packer, Paragraph, TextRun,
        TableOfContents, PageBreak, HeadingLevel, AlignmentType, fs,
        TEAL, RED, GRAPHITE, HEAD_BG, TEAL_BG, RED_BG } = B;

module.exports = [
  h1('9.  Accessibility and localisation architecture'),
  lead('Both are procurement gates rather than preferences, and both are structural here for the '
     + 'same reason: a host CDE embedding this viewer inherits our conformance and our '
     + 'untranslated strings, and can fix neither from the outside.'),

  h2('9.1  The three structural decisions'),
  bullet('**The IFC tree is the primary data interface.** A canvas alone cannot conform. It now '
       + 'implements the full tree pattern — a roving tab stop, arrow navigation, `aria-level` '
       + 'and `aria-expanded` on each row — rather than a list of divs that looked like a tree.'),
  bullet('**Every drag interaction needs a single-pointer alternative** (SC 2.5.7).'),
  bullet('**Exports must be tagged and PDF/UA-conformant.** An inaccessible export is a product '
       + 'accessibility failure, and it is the most common gap found in government audits.'),

  h2('9.2  What the second of those cost'),
  p('SC 2.5.7 was stated in the last issue of this document and not implemented. Two drag-only '
  + 'interactions have since been given a keyboard route.'),
  bullet('**Page reordering** was a CDK drag handle and nothing else. Angular’s CDK drag-drop has '
       + 'no keyboard mode and a `<span cdkDragHandle>` cannot take focus, so a reader without a '
       + 'pointer could select, rotate, duplicate and delete pages but never move one — while the '
       + 'grip’s own translator note claimed reordering worked from the keyboard. Each page now '
       + 'carries a pair of move buttons that name the page they move.'),
  bullet('**The comparison wipe** was a drag-only divider. It is a range input with the visual '
       + 'handle drawn over it, so it answers arrow keys, Home and End.'),
  note('**The markup layer was the remaining gap, and it is closed for creation.** Two issues of '
     + 'this document said no shape could be created or moved without a pointer and called it the '
     + 'largest accessibility item outstanding. A shape can now be drawn entirely from the '
     + 'keyboard, on both surfaces.'),
  p('The overlay takes focus when a drawing tool is active, and announces what the keys do '
  + '\u2014 the only place they are written down for a reader who cannot see the crosshair. Arrow '
  + 'keys move that crosshair, Shift takes the coarse step, Space presses, Enter finishes and '
  + 'Escape cancels. Space-then-arrows-then-Enter is the single-pointer alternative SC 2.5.7 asks '
  + 'for, because the arrow keys between the press and the finish are doing what the drag did. '
  + 'The overlay claims a key only when it used it, so arrow keys still scroll a page nobody is '
  + 'drawing on and Tab still leaves.'),
  note('**The sentence that named the gap was conflating two different things, and only one of '
     + 'them was an accessibility defect.** Creating a shape was pointer-only \u2014 that was '
     + 'real, and is fixed. *Moving* a committed shape is not a keyboard gap at all: there is no '
     + 'shape selection and no move in the viewer, for any input device. `removeShape` is the only '
     + 'thing that acts on a committed shape. So the second half of that claim described a feature '
     + 'nobody has rather than a route some readers lack, which made the accessibility gap look '
     + 'larger than it was and hid a plain functional gap behind it.'),
  p('**The keyboard drives the same state machine the pointer does.** The three pointer handlers '
  + 'now hold nothing but coordinate extraction and hand a point to `pressAt`, `moveTo` and '
  + '`release`; the keyboard moves a point and calls the same three. A separate keyboard path '
  + 'would have passed its own tests and still come to disagree with the pointer about which '
  + 'tools work, what a shape\u2019s defaults are, or where a finished one goes \u2014 which is '
  + 'not a hypothetical. It is the drift this session was extracted to stop, and it had already '
  + 'happened once between the PDF page and the CAD drawing. One test asserts the keyboard and '
  + 'the pointer produce an identical shape from identical coordinates; that assertion is the '
  + 'design, not a detail of it.'),
  p('**The crosshair is a component, extracted on the second caller rather than the third.** '
  + '\u00a73.3 says to duplicate twice and abstract on the third, and this is the exception that '
  + 'rule\u2019s own wording allows: the two callers are the two surfaces that have drifted '
  + 'before, over exactly this question of what works where. Drawn twice it ends up two sizes, or '
  + 'present on one surface and absent on the other \u2014 and a reader who cannot see it has no '
  + 'way to tell which of those happened.'),
  note('**What this does not do.** It is a keyboard route to *create*; it is not a screen-reader '
     + 'account of what is already on the page. A reader still cannot enumerate existing markup, '
     + 'and cannot move or resize a committed shape, because nobody can. Neither is this a '
     + 'substitute for the testing \u00a71A.5 requires: these are unit tests of a state machine, '
     + 'and the manual keyboard pass and the screen-reader matrix remain the real gates.'),
  p('The callout half of that sentence is fixed, and the sentence was wrong about why. It read: '
  + '`updateShape` still has no `callout` case, so a callout box cannot be dragged at all. The '
  + 'first clause was true and the inference from it was not — acting on it would have changed '
  + 'nothing. `pointerDown` routed a callout by `isTextTool`, which answers “does this shape '
  + 'carry words” rather than “is this put down by a click or by a drag”, so a '
  + 'callout took the click path and `updateShape` was never reached for one at all. Adding the '
  + 'missing case on its own would have been inert, which is the trap in a gap recorded with a '
  + 'plausible cause attached: the next person fixes the cause and ships no change. Those are two '
  + 'different questions and now have two predicates.'),
  p('A callout has two positions — the anchor on the feature and the label clear of it — '
  + 'so it is now the one text tool placed by dragging: press on the detail, pull the label to '
  + 'where it should sit, and the words are asked for on release, which is also the only order a '
  + 'modal prompt permits. Before this every label sat at the seeded offset of eighty right and '
  + 'forty up: on a crowded drawing usually over the detail being annotated, near a page edge off '
  + 'the page, and no gesture moved it. A click that never moves still places a callout at that '
  + 'offset, so the gesture that already existed is extended rather than replaced.'),
  note('**This is not an accessibility improvement and must not be counted as one.** It adds a '
     + 'drag to a layer that was already wholly pointer-dependent. The label’s only '
     + 'pointer-free outcome is the seeded offset, which is a fallback and not the equivalent '
     + 'SC 2.5.7 asks for.'),

  h2('9.3  Defects that were not on anyone’s list'),
  p('A pass over the panels found a class of failure worth naming, because it is invisible to an '
  + 'automated checker and to a sighted developer alike: **accessible-name computation takes '
  + 'element content over `title`.** A `<button>` whose whole content is “↺” is announced as that '
  + 'glyph; its tooltip is never read. Six controls announced themselves as a symbol. The fix is '
  + 'an `aria-label` on the button and `aria-hidden` on the glyph.'),
  p('The same pass found a label pointing at a DOM id that did not exist, because the id was a '
  + 'PDF AcroForm field name and “Given name” has a space in it; four buttons bound to empty '
  + 'method bodies; required form fields marked only by an `aria-hidden` asterisk; validation '
  + 'messages not tied to the control they were about; and status icons announced as “white heavy '
  + 'check mark” beside a badge that already said the status.'),
  p('A later pass found one more of the same family, and it is the one a buyer’s auditor is most '
  + 'likely to meet: **the embedded toolbar declared `role="toolbar"` without implementing it.** '
  + 'That role promises arrow-key navigation over a single tab stop, and the row is a set of '
  + 'ordinary buttons each with its own tab stop. A screen-reader user is told it is a toolbar, '
  + 'presses the arrows, and nothing moves — worse off than one told it is a group of named '
  + 'buttons, which is what §1A.2 means by bad ARIA being worse than none. It is `role="group"` '
  + 'now, which promises only what is there.'),
  p('The full viewer’s own command bar had already reached that conclusion and written it down in '
  + 'a comment two directories away. A rule recorded in a comment beside one component does not '
  + 'reach the next person writing another, which is why it is in this document and asserted in '
  + 'both components’ specs.'),
  note('None of these would have been caught by axe. **This is the argument for §1A.5’s position '
     + 'that automated checks are a floor, not conformance** — and it is worth quoting to a buyer '
     + 'who asks what our VPAT rests on.'),
  note('**One defect was on the list, and the list was wrong about it.** The conformance report '
     + 'in `cde-platform/docs/accessibility/` recorded SC 2.4.6 as *Does Not Support: no `<h1>`; '
     + 'heading hierarchy is incomplete.* The first clause was false when it was written — '
     + 'three `<h1>` elements already existed — and the second was true. A row that is wrong '
     + 'in our favour on one clause is a row nobody re-reads, so the clause that was right sat '
     + 'there unactioned.'),
  p('What was actually wrong: **four of the seven routes had no heading of any level**, among them '
  + '`/viewer/:id`, the main document viewer. A reader navigating by headings arrived at the '
  + 'viewer and found nothing naming the document that was open. `/login`, `/compare` and '
  + '`/viewer3d/:id` were the same, and the embedded frame had an `<h1>` only in its *failed* '
  + 'state — so the state a reader actually spends time in had none.'),
  p('Where a visible title already existed, it now carries the semantics rather than gaining a '
  + 'hidden copy beside it: the document viewer’s top bar and the 3D toolbar held the '
  + 'page’s title in a `<span>`, and hold it in an `<h1>` now. Tailwind’s preflight '
  + 'resets heading size and margin, so nothing moved on screen. A second, hidden heading would '
  + 'have been a copy that can drift from the one a sighted reader is looking at. Where no visible '
  + 'title existed the heading is hidden, because the alternative is worse: sign-in shows a brand '
  + 'lockup, which names the product rather than the task, and compare shows two file slots and a '
  + '`VS` pill, none of which names the page.'),
  note('**The embedded frame is its own document, so it needs its own heading** — the '
     + 'host’s `<h1>` is not inside the iframe. Hidden, because a host sized that frame to '
     + 'show a document and a title we injected would be chrome in their page. One detail there is '
     + 'load-bearing: **its visually-hidden rule is declared in the component’s own styles, '
     + 'not borrowed from the application’s utility layer.** Every other class in that '
     + 'component is local by design, and a visually-hidden rule that silently stops applying does '
     + 'not fail quietly — it puts a heading we injected on screen inside a customer’s '
     + 'page.'),
  p('**Heading levels still skip, and the report now says so rather than implying otherwise.** The '
  + 'viewer, compare and 3D routes go from `h1` straight to the `h3` their panels use: the sidebar '
  + 'holding those panels contributes no heading of its own, and each panel chose its level '
  + 'independently. This is not a number to change in one template. The same panel component '
  + 'appears at more than one depth, so no single hard-coded level is correct in both places '
  + '— it needs the route outlines designing, which is a decision rather than an edit. '
  + 'Labels are untouched as well, and SC 2.4.6 covers headings *and* labels, so the row’s '
  + 'evidence does not reach half of its own criterion.'),
  note('Unlike the defects above it, **this is the kind of thing an automated checker is good at** '
     + '— a page with no top-level heading, and a jump from one level to another, are '
     + 'structural facts a tool can see without knowing what the page is for. That makes the '
     + 'missing axe gate a concrete cost rather than an outstanding task: the gate nobody has been '
     + 'able to add is the one that would have found this, and it stayed unfound long enough for '
     + 'the report describing it to go stale in both directions.'),

  h2('9.4  Localisation'),
  p('Every sentence a reader sees is an `i18n` attribute or a `$localize` call carrying a stable '
  + 'message id and a translator note, extracted to a committed catalogue at '
  + '`src/locale/messages.json` — **589 messages at this issue,** up from 587.'),
  note('**The last issue of this document said there were none left, and that was wrong by nine.** '
     + 'They were found by writing specs over two panels that had none, not by either gate. Three '
     + 'were in the version-history panel — one inside a `confirm()`, two set on an error signal — '
     + 'and six in the embed viewer, three of them operands of a template expression and three '
     + 'returned from a method. None was template *text*, which is what `check:i18n-markup` sweeps '
     + 'for, and none was a `$localize` call, which is what the extractor collects. A string in an '
     + 'expression operand or a return statement is invisible to both. The embed viewer is the '
     + 'worst place in the product for it: it renders inside a customer’s own application, so the '
     + 'English appeared framed by their translated interface.'),
  p('The gates have not been widened to catch this class, and saying so is more useful than '
  + 'implying they have. What would catch it is a lint rule against bare string literals reaching '
  + 'a template binding or a user-visible signal, which is a different kind of check from either '
  + 'existing gate. Until then the honest statement is that the catalogue is complete as far as '
  + 'two mechanical sweeps can see, and a string placed where neither looks will still get '
  + 'through.'),
  p('Two gates hold it, and both run in CI. `check:i18n` regenerates the catalogue and fails on '
  + 'any difference, the same contract §3.5 imposes on the OpenAPI spec and for the same reason: '
  + 'a generated file nothing compares to its source rots, and a stale catalogue ships an '
  + 'untranslated string to every language at once. `check:i18n-markup` sweeps component '
  + 'templates for text a translator will never see.'),
  p('Two things a host should know. Server-produced English still reaches the screen in a few '
  + 'places where only the server knows what happened — it has been removed wherever the server '
  + 'also sends a status code we can word ourselves, which is most of them. And the viewer ships '
  + 'the source catalogue, not translations: a host wanting French supplies French.'),
];
