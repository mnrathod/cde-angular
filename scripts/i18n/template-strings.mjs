/**
 * Finding user-facing text that has not been marked for translation.
 *
 * <p>§1.4 says "no hardcoded user-facing strings". A rule like that decays
 * the moment it stops being checked — one unmarked label per pull request and
 * within a quarter the catalogue is fiction. So it is checked, by parsing the
 * templates with Angular's own parser rather than by grepping them.
 *
 * <p>Using the real parser matters, and not only for accuracy. Angular
 * *removes* `i18n` and `i18n-<attr>` from the attribute list during parsing
 * and records them as message metadata instead, so a grep for `i18n=` in the
 * raw source would answer a different question than the compiler does. This
 * reads the same metadata the compiler acts on.
 */
import { parseTemplate } from '@angular/compiler';

/**
 * Attributes whose value is read out or shown to a user.
 *
 * <p>Deliberately not every attribute: `class`, `role` and `id` are for
 * machines and translating them would break the page. These are the ones a
 * person perceives, so these are the ones that need `i18n-<attr>`.
 */
const TRANSLATABLE_ATTRIBUTES = [
  'alt',
  'aria-description',
  'aria-label',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
  // Not just <option label> and <track label>: a component that takes a
  // `label` input renders it to the user like any other, and the compiler
  // cannot tell the two apart from the attribute alone.
  'label',
  'placeholder',
  'title',
];

/**
 * One piece of text that a user will perceive and nobody has marked up.
 *
 * @typedef {object} UnmarkedString
 * @property {number} line where it is, as a template-relative line number
 * @property {string} text the text itself, trimmed
 * @property {string} [attribute] the attribute it came from, or absent for
 *   element content
 */

/**
 * Whether a string is something a person reads, or incidental markup noise.
 *
 * <p>A bare interpolation (`{{ count }}`) needs no marking: there is no
 * source text to translate, only a value. Punctuation and separators are the
 * same — a lone `·` or `/` between two translated strings means the same
 * thing in every language, and marking it produces a catalogue entry no
 * translator can act on.
 */
/**
 * The words in a text node, with any interpolated values left out.
 *
 * <p>Returns undefined when there is nothing a translator could act on — a
 * bare `{{ count }}` carries a value, not a message.
 *
 * @param {unknown} value a text node's `value`
 * @returns {string | undefined} the text to report, or undefined
 */
function literalTextOf(value) {
  if (typeof value === 'string') {
    return isUserFacing(value) ? value : undefined;
  }

  // An interpolation: `strings` holds the literal pieces around each
  // expression, and `source` is the original text, which is what a reader
  // needs to find the line again.
  const strings = value?.ast?.strings ?? value?.strings;
  if (!Array.isArray(strings)) return undefined;
  return isUserFacing(strings.join(' ')) ? (value.source ?? strings.join(' ')) : undefined;
}

/** A quoted string literal, either way round, with its contents captured. */
const QUOTED = /'([^']*)'|"([^"]*)"/g;

/**
 * English sitting inside a bound expression.
 *
 * <p>A text node is not the only place a sentence hides. `[title]="'Go to
 * page ' + page"` and `[attr.aria-label]="'Page ' + n"` are both read out to
 * somebody and neither is text this could see, because the parser hands a
 * binding an expression rather than a string. Three of those shipped before
 * this looked for them.
 *
 * <p>Only bindings whose target is perceived are scanned, which is what
 * keeps it quiet: `[class]="on ? 'bg-accent' : 'bg-white'"` is full of
 * letters and none of them are words.
 */
function quotedWordsIn(expression) {
  const words = [];
  for (const match of expression.matchAll(QUOTED)) {
    const literal = match[1] ?? match[2] ?? '';
    if (isUserFacing(literal)) words.push(literal);
  }
  return words;
}

function isUserFacing(text) {
  const withoutInterpolations = text.replace(/\{\{[^}]*\}\}/g, '');
  return /\p{Letter}/u.test(withoutInterpolations);
}

/**
 * Reports every user-facing string in a template that carries no `i18n`.
 *
 * <p>An element's `i18n` attribute covers its text content including the
 * content of descendants, which is how Angular works — `<p i18n>Hello
 * <b>there</b></p>` is one message, not two. Attributes are separate: each
 * needs its own `i18n-<attr>` on the element that declares it, regardless of
 * any ancestor.
 *
 * @param {string} template the template source
 * @param {string} name a name for the template, used in parse diagnostics
 * @returns {UnmarkedString[]} every unmarked string, in document order
 * @throws if the template does not parse — a template this cannot read is a
 *   template it cannot vouch for, and silently returning "nothing found"
 *   would be the worst possible answer
 */
export function findUnmarkedStrings(template, name) {
  const parsed = parseTemplate(template, name);
  if (parsed.errors?.length) {
    throw new Error(
      `${name} did not parse: ${parsed.errors.map(error => error.msg).join('; ')}`,
    );
  }

  const found = [];
  visit(parsed.nodes, false, found);
  return found;
}

function visit(nodes, translated, found) {
  for (const node of nodes) {
    const candidate = node;

    // A text node. `value` is a plain string for literal text, and an
    // expression object once an interpolation appears anywhere in it —
    // including when literal words sit alongside one. Those words are exactly
    // as user-facing as any other, so the literal parts are pulled back out
    // rather than skipped: `Select document for File {{ slot() }}` read as an
    // expression and passed a sweep that reported the file clean.
    if (candidate.attributes === undefined && candidate.value !== undefined) {
      if (!translated) {
        const text = literalTextOf(candidate.value);
        if (text !== undefined) record(text, candidate, found);
      }
      continue;
    }

    for (const attribute of candidate.attributes ?? []) {
      if (attribute.i18n) continue;
      if (!TRANSLATABLE_ATTRIBUTES.includes(attribute.name)) continue;
      if (!isUserFacing(attribute.value)) continue;
      record(attribute.value, attribute, found, attribute.name);
    }

    for (const binding of candidate.inputs ?? []) {
      if (binding.i18n) continue;
      const perceived = String(binding.name ?? '').replace(/^attr\./, '');
      if (!TRANSLATABLE_ATTRIBUTES.includes(perceived)) continue;
      for (const literal of quotedWordsIn(binding.value?.source ?? '')) {
        record(literal, binding, found, perceived);
      }
    }

    visit(childrenOf(candidate), translated || Boolean(candidate.i18n), found);
  }
}

/**
 * The child nodes of anything that has them, whatever shape it takes.
 *
 * <p>An element holds `children`; `@if` holds `branches`; `@switch` holds
 * `groups`; `@for` holds its body children directly plus an `@empty` block.
 * Each name has to be listed, because a block whose collection is not named
 * here is a block this walks straight past — which is a silent false pass,
 * the worst failure mode a guard can have. The `@switch` test exists for
 * exactly that reason and caught exactly that mistake.
 */
function childrenOf(node) {
  const nested = [...(node.children ?? [])];
  for (const collection of [node.branches, node.groups]) {
    for (const branch of collection ?? []) nested.push(...(branch.children ?? []));
  }
  if (node.empty?.children) nested.push(...node.empty.children);
  return nested;
}

function record(text, node, found, attribute) {
  if (!isUserFacing(text)) return;
  found.push({
    line: (node.sourceSpan?.start.line ?? 0) + 1,
    text: text.trim(),
    ...(attribute ? { attribute } : {}),
  });
}


