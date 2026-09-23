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
  note('None of these would have been caught by axe. **This is the argument for §1A.5’s position '
     + 'that automated checks are a floor, not conformance** — and it is worth quoting to a buyer '
     + 'who asks what our VPAT rests on.'),

  h2('9.4  Localisation'),
  p('There are no hardcoded user-facing strings left in the application. Every sentence a reader '
  + 'sees is an `i18n` attribute or a `$localize` call carrying a stable message id and a '
  + 'translator note, extracted to a committed catalogue at `src/locale/messages.json` — **552 '
  + 'messages at this issue.**'),
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
