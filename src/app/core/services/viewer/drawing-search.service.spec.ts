import { TestBed } from '@angular/core/testing';
import { DrawingSearchService } from './drawing-search.service';
import { definitely } from '../../../../testing/definitely';

/**
 * Search ran only against a PDF's text layer and gave up the moment there was
 * no PDF document — silently. A converted DWG answered every query with "No
 * matches found" whether the words were on the drawing or not, which is the
 * hardest kind of failure to notice: it looks like an answer.
 */
describe('DrawingSearchService', () => {
  let service: DrawingSearchService;

  const svg = (body: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">${body}</svg>`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [DrawingSearchService] });
    service = TestBed.inject(DrawingSearchService);
  });

  // ── extractText ───────────────────────────────────────────────
  it('finds text and where it sits', () => {
    const items = service.extractText(
      svg('<text x="630" y="663" font-size="11">CITY BRIDGE EXPANSION</text>'));

    expect(items.length).toBe(1);
    expect(definitely(items[0]).text).toBe('CITY BRIDGE EXPANSION');
    expect(definitely(items[0]).x).toBe(630);
    expect(definitely(items[0]).y).toBe(663);
    expect(definitely(items[0]).width).toBeGreaterThan(0);
  });

  // ── anchor handling ───────────────────────────────────────────
  it('resolves a centred label to its left edge', () => {
    // Converters centre nearly every label this way. Taking x at face value
    // marked a box that began halfway through the words it was framing.
    const item = definitely((service.extractText(svg(
      '<text x="655" y="530" text-anchor="middle" font-size="10">CITY BRIDGE EXPANSION</text>')))[0]);

    expect(item.x).toBeCloseTo(655 - item.width / 2, 5);
    expect(item.x).toBeLessThan(655);
  });

  it('resolves a right-anchored label to its left edge', () => {
    const item = definitely((service.extractText(svg(
      '<text x="400" y="100" text-anchor="end" font-size="10">REV A</text>')))[0]);

    expect(item.x).toBeCloseTo(400 - item.width, 5);
  });

  it('leaves a start-anchored label where it is', () => {
    const item = definitely((service.extractText(svg(
      '<text x="400" y="100" text-anchor="start" font-size="10">REV A</text>')))[0]);

    expect(item.x).toBe(400);
  });

  it('honours an anchor set on an enclosing group', () => {
    // A converter often sets this once on a group rather than per label.
    const item = definitely((service.extractText(svg(
      '<g text-anchor="middle"><text x="200" y="50" font-size="10">TITLE</text></g>')))[0]);

    expect(item.x).toBeCloseTo(200 - item.width / 2, 5);
  });

  it('reads a label split into tspans as the one phrase it looks like', () => {
    // Converters emit multi-line text this way. Indexing the fragments
    // separately would make a title block unsearchable by its own title.
    const items = service.extractText(svg(
      '<text x="10" y="20"><tspan>CITY BRIDGE</tspan><tspan> EXPANSION</tspan></text>'));

    expect(items.length).toBe(1);
    expect(definitely(items[0]).text).toBe('CITY BRIDGE EXPANSION');
  });

  it('takes the position from the first tspan when the text has none', () => {
    const items = service.extractText(svg(
      '<text font-size="9"><tspan x="120" y="240">ABUTMENT W</tspan></text>'));

    expect(definitely(items[0]).x).toBe(120);
    expect(definitely(items[0]).y).toBe(240);
  });

  it('skips empty and unpositioned text rather than indexing blanks', () => {
    const items = service.extractText(svg(
      '<text x="1" y="1">   </text><text>no position</text><text x="5" y="5">real</text>'));

    expect(items.map(i => i.text)).toEqual(['real']);
  });

  it('returns nothing for empty or unparseable content', () => {
    expect(service.extractText('')).toEqual([]);
    expect(service.extractText('<svg><text x="1" y="1">unclosed')).toEqual([]);
  });

  // ── search ────────────────────────────────────────────────────
  describe('search', () => {
    const drawing = () => service.extractText(svg(`
      <text x="630" y="663" font-size="11">CITY BRIDGE EXPANSION</text>
      <text x="640" y="679" font-size="8">STRUCTURAL PLAN - LEVEL 1</text>
      <text x="120" y="240" font-size="9">ABUTMENT W</text>
      <text x="700" y="240" font-size="9">ABUTMENT E</text>
      <text x="440" y="700" font-size="9">640m TOTAL SPAN</text>
    `));

    it('finds a phrase regardless of case', () => {
      const matches = service.search(drawing(), 'city bridge expansion');
      expect(matches.length).toBe(1);
      expect(definitely(matches[0]).text).toBe('CITY BRIDGE EXPANSION');
      expect(definitely(matches[0]).item.x).toBe(630);
    });

    it('finds every label sharing a word', () => {
      const matches = service.search(drawing(), 'ABUTMENT');
      expect(matches.map(m => m.text)).toEqual(['ABUTMENT W', 'ABUTMENT E']);
    });

    it('finds a partial word, so a query need not be complete', () => {
      expect(service.search(drawing(), 'BRIDG').length).toBe(1);
    });

    it('reports every occurrence within one label', () => {
      const repeated = service.extractText(svg('<text x="1" y="1">SPAN A SPAN B</text>'));
      const matches = service.search(repeated, 'SPAN');
      expect(matches.length).toBe(2);
      expect(definitely(matches[0]).matchIndex).toBe(0);
      expect(definitely(matches[1]).matchIndex).toBe(7);
    });

    it('ignores whitespace differences between query and drawing', () => {
      const wrapped = service.extractText(svg('<text x="1" y="1">CITY   BRIDGE</text>'));
      expect(service.search(wrapped, 'CITY BRIDGE').length).toBe(1);
    });

    it('returns nothing for a blank query rather than matching everything', () => {
      expect(service.search(drawing(), '')).toEqual([]);
      expect(service.search(drawing(), '   ')).toEqual([]);
    });

    it('returns nothing when the text is genuinely absent', () => {
      expect(service.search(drawing(), 'BASEMENT')).toEqual([]);
    });

    it('reports a drawing as a single sheet', () => {
      expect(service.search(drawing(), 'ABUTMENT').every(m => m.pageIndex === 1)).toBe(true);
    });
  });
});
