/**
 * Reading a generated report into renderable lines.
 *
 * <p>The input is a language model's output, so the property that matters most
 * is not that well-formed reports parse prettily — it is that malformed ones
 * still arrive intact. A parser that drops a line it does not recognise loses
 * content from an engineering review, and the reader has no way to tell
 * anything is missing.
 *
 * <p>The second property is that nothing in the output is markup. The old
 * implementation built an HTML string and escaped each value on the way in;
 * this returns data and lets Angular's interpolation encode it, so a report
 * containing a tag is text by construction rather than by remembering to call
 * an escaper.
 */
import { describe, expect, it } from 'vitest';

import { parseComparisonReport, ReportLine } from './comparison-report';

/** The kinds, in order, for a quick shape assertion. */
function kinds(report: string): string[] {
  return parseComparisonReport(report).map((line) => line.kind);
}

describe('reading a comparison report', () => {

  it('recognises the five section headings', () => {
    const report = [
      '1. REVISION SUMMARY',
      '2. KEY CHANGES IDENTIFIED',
      '3. IMPACTED DISCIPLINES',
      '4. REVIEW COMMENTS',
      '5. SUGGESTED RFIs',
    ].join('\n');

    expect(kinds(report)).toEqual(
      ['section', 'section', 'section', 'section', 'section']);
  });

  it('gives each section its own glyph', () => {
    const [summary, changes] = parseComparisonReport(
      '1. REVISION SUMMARY\n2. KEY CHANGES IDENTIFIED');

    expect((summary as { icon: string }).icon).toBe('📋');
    expect((changes as { icon: string }).icon).toBe('🔍');
  });

  it('splits a request into its reference and its detail', () => {
    const [line] = parseComparisonReport('RFI-01: Slab thickness — confirm the revised depth');

    expect(line).toEqual({
      kind: 'request',
      reference: 'RFI-01: Slab thickness',
      detail: 'confirm the revised depth',
    });
  });

  it('keeps a request that carries no detail', () => {
    const [line] = parseComparisonReport('RFI-02: Confirm the datum');

    expect(line).toEqual({ kind: 'request', reference: 'RFI-02: Confirm the datum', detail: '' });
  });

  it('strips the marker from a bullet', () => {
    expect(parseComparisonReport('• Beam depth increased')).toEqual(
      [{ kind: 'bullet', text: 'Beam depth increased' }]);
    expect(parseComparisonReport('- Beam depth increased')).toEqual(
      [{ kind: 'bullet', text: 'Beam depth increased' }]);
  });

  it('treats a numbered item as a bullet, not as a section', () => {
    // "2. the column grid moved" is an item; "2. KEY CHANGES IDENTIFIED" is a
    // heading. Only the heading list distinguishes them.
    expect(kinds('2. the column grid moved')).toEqual(['bullet']);
  });

  it('reads a numbered item that starts with a figure as an item', () => {
    // Dimensions lead a line constantly in this domain. The heading list is
    // what separates an item from a section, so an item does not additionally
    // have to begin with a letter.
    expect(parseComparisonReport('3. 300mm added to the slab')).toEqual(
      [{ kind: 'bullet', text: '300mm added to the slab' }]);
  });

  it('still reads a numbered heading as a section, not as an item', () => {
    // The pair to the test above: the two are told apart by the heading list,
    // and the order the rules are tried in is what makes that work.
    expect(kinds('2. KEY CHANGES IDENTIFIED')).toEqual(['section']);
  });

  it('keeps blank lines, so the report keeps its spacing', () => {
    expect(kinds('First\n\nSecond')).toEqual(['paragraph', 'gap', 'paragraph']);
  });

  it('keeps a line it does not recognise', () => {
    // The property that matters. A model does not emit a format, and a
    // dropped line is a silently incomplete review.
    const odd = 'Nothing here matches any rule at all';

    expect(parseComparisonReport(odd)).toEqual([{ kind: 'paragraph', text: odd }]);
  });

  it('loses no line from a mixed report', () => {
    const report = [
      '1. REVISION SUMMARY',
      'The revision moves two gridlines.',
      '',
      '• Grid C shifted 300mm east',
      'RFI-01: Grid C — confirm against the survey',
      'Unstructured trailing note',
    ].join('\n');

    expect(parseComparisonReport(report)).toHaveLength(6);
  });

  it('returns nothing for an empty report', () => {
    expect(parseComparisonReport('')).toEqual([{ kind: 'gap' }]);
  });

  it('carries markup through as text, never as structure', () => {
    // §10.1 treats model output as untrusted. The parser's job is to hand the
    // template a string; the encoding is interpolation's.
    const injected = '<img src=x onerror="alert(1)">';

    const [line] = parseComparisonReport(`• ${injected}`);

    expect(line).toEqual({ kind: 'bullet', text: injected });
  });

  it('produces no field that is not a plain string', () => {
    // A guard against anyone reintroducing a pre-rendered HTML field on these
    // objects, which is what the template would then be tempted to bind.
    const lines: ReportLine[] = parseComparisonReport(
      '1. REVIEW COMMENTS\n• check the datum\nRFI-03: Datum — confirm');

    for (const line of lines) {
      for (const value of Object.values(line)) {
        expect(typeof value).toBe('string');
      }
    }
  });
});
