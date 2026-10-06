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
  note('**The remaining gap is the markup layer**, and it is the same one as last time: '
     + '`updateShape` still has no `callout` case, so a callout box cannot be dragged at all, and '
     + 'no shape can yet be created or moved without a pointer. This is the largest accessibility '
     + 'item outstanding and it is not a small one.'),

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

  h2('9.4  Localisation'),
  p('Every sentence a reader sees is an `i18n` attribute or a `$localize` call carrying a stable '
  + 'message id and a translator note, extracted to a committed catalogue at '
  + '`src/locale/messages.json` — **585 messages at this issue,** up from 552.'),
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
