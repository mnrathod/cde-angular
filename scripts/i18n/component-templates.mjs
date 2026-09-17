/**
 * Pulling a component's template out of its source file.
 *
 * <p>Every component in this application declares its template inline, in a
 * `template:` backtick literal. Reading them back out is what lets the
 * untranslated-string guard see the same markup the compiler sees.
 */

const TEMPLATE_PROPERTY = /(^|[\s,{])template\s*:\s*`/;

/**
 * Returns the inline template in a component source file.
 *
 * <p>Scans to the matching unescaped backtick rather than to the next one, so
 * a template containing an escaped backtick does not truncate silently. A
 * silent truncation is the failure worth guarding against here: it would hand
 * the caller *part* of a template, which looks like a clean answer and is not.
 *
 * @param {string} source the component's TypeScript source
 * @returns {string | undefined} the template, or `undefined` if it declares none
 * @throws if a template opens and never closes — a file this cannot read
 *   completely is one it must not half-report on
 */
export function extractInlineTemplate(source) {
  const opening = TEMPLATE_PROPERTY.exec(source);
  if (!opening) return undefined;

  const start = opening.index + opening[0].length;
  for (let cursor = start; cursor < source.length; cursor++) {
    const character = source[cursor];
    if (character === '\\') {
      cursor++;
      continue;
    }
    if (character === '`') return source.slice(start, cursor);
  }
  throw new Error('An inline template opens and is never closed');
}
