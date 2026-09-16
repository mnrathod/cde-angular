/**
 * The shape of a generated comparison report, as lines a template can render.
 *
 * <p>This exists because the report used to be turned into a string of HTML
 * and bound with `[innerHTML]`. Two rules bear on that. §5.12 bans the binding
 * outright, and §10.1 requires model output be treated as untrusted input and
 * never interpolated into HTML — the old code escaped each value before
 * concatenating it, which was correct as far as it went, but it put the
 * safety of every future edit in the hands of whoever remembers to call the
 * escaper. Parsing to data and letting Angular's interpolation do the encoding
 * removes the question rather than answering it.
 *
 * <p>There was a second, quieter problem. Every line carried an inline
 * `style` attribute, and §5.4's Content-Security-Policy has no
 * `unsafe-inline`, so a correctly configured deployment dropped all of that
 * styling and rendered the report unformatted. The classes in the template
 * replace it.
 *
 * <p>Kept separate from the component both because it is the part worth
 * testing on its own and because `compare.component.ts` is already well past
 * the §3.3 size limits.
 */

/** A section heading, one of the five the report is asked to produce. */
export interface ReportSection {
  readonly kind: 'section';
  /** Decorative glyph; the heading text carries the meaning. */
  readonly icon: string;
  readonly text: string;
}

/** A suggested request for information, which the report numbers itself. */
export interface ReportRequest {
  readonly kind: 'request';
  readonly reference: string;
  /** Empty when the line carried no detail after the dash. */
  readonly detail: string;
}

export interface ReportBullet {
  readonly kind: 'bullet';
  readonly text: string;
}

export interface ReportParagraph {
  readonly kind: 'paragraph';
  readonly text: string;
}

/** A blank line in the source, preserved so the report keeps its spacing. */
export interface ReportGap {
  readonly kind: 'gap';
}

export type ReportLine =
  | ReportSection | ReportRequest | ReportBullet | ReportParagraph | ReportGap;

const SECTION_HEADINGS = [
  'REVISION SUMMARY',
  'KEY CHANGES IDENTIFIED',
  'IMPACTED DISCIPLINES',
  'REVIEW COMMENTS',
  'SUGGESTED RFIS',
] as const;

const SECTION_ICONS: Readonly<Record<string, string>> = {
  'REVISION SUMMARY': '📋',
  'KEY CHANGES IDENTIFIED': '🔍',
  'IMPACTED DISCIPLINES': '🏗',
  'REVIEW COMMENTS': '✍️',
  'SUGGESTED RFIS': '❓',
};

const NUMBERED_SECTION = new RegExp(
  `^\\d+\\.\\s+(${SECTION_HEADINGS.join('|')})`, 'i');
const REQUEST_REFERENCE = /^RFI-\d+:/i;
const BULLET_MARKER     = /^[•\-*]\s+/;
/**
 * A numbered list item.
 *
 * <p>This carried a trailing `[a-z]` — inherited, and it earns nothing. It was
 * presumably meant to stop `2. KEY CHANGES IDENTIFIED` being read as an item,
 * but {@link NUMBERED_SECTION} is tested first and already claims the
 * headings. All the letter requirement actually did was send an item that
 * happens to start with a digit, like `3. 300mm added to the slab`, to the
 * paragraph branch — which is the wrong answer for a line that is plainly a
 * numbered item. Removing it was deliberate; the test names that case.
 */
const NUMBERED_ITEM     = /^\d+\.\s+/;

/**
 * Reads a generated report into lines.
 *
 * <p>Deliberately forgiving: a model's output is not a format, so anything
 * unrecognised becomes a paragraph rather than being dropped or throwing. A
 * report that renders as plain prose is a worse-looking report; one with
 * lines missing is a wrong one, and the reader has no way to tell.
 */
export function parseComparisonReport(report: string): ReportLine[] {
  return report.split('\n').map(readLine);
}

function readLine(raw: string): ReportLine {
  const line = raw.trim();
  if (!line) return { kind: 'gap' };

  if (NUMBERED_SECTION.test(line)) {
    const heading = SECTION_HEADINGS.find(
      (candidate) => line.toUpperCase().includes(candidate));
    return { kind: 'section', icon: (heading && SECTION_ICONS[heading]) ?? '•', text: line };
  }

  if (REQUEST_REFERENCE.test(line)) {
    // An em dash separates the reference from its detail, when there is one.
    const dash = line.indexOf('—');
    return dash > 0
      ? { kind: 'request', reference: line.slice(0, dash).trim(), detail: line.slice(dash + 1).trim() }
      : { kind: 'request', reference: line, detail: '' };
  }

  if (BULLET_MARKER.test(line) || NUMBERED_ITEM.test(line)) {
    return {
      kind: 'bullet',
      text: line.replace(BULLET_MARKER, '').replace(/^\d+\.\s+/, ''),
    };
  }

  return { kind: 'paragraph', text: line };
}
