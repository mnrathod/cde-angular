/**
 * The two shape renderers must draw the same thing.
 *
 * `shapeToSvg` builds a string, and survives for the one job that wants one:
 * writing an SVG file out. `shapeToPrimitives` builds bound elements, and is
 * what reaches the DOM, because a string of SVG can only get there through
 * `[innerHTML]` and a shape carries user text, a colour from state, and — in
 * an embed — fields supplied by the host.
 *
 * Two renderers for one thing is a drift risk, so this asserts they agree:
 * for every tool, the element names in the string are the primitive kinds in
 * the list, in order. A case added to one and not the other fails here, rather
 * than in a browser weeks later with half a shape on the page.
 */
import { describe, expect, it } from 'vitest';

import { MarkupEngineService, SvgPrimitive } from './markup-engine.service';
import type { ShapeData, MarkupTool } from './viewer-state.service';

/**
 * Every tool that draws something, as a `Record` rather than an array.
 *
 * The exhaustiveness is the point: `MarkupTool` is a type-only union with no
 * runtime list, so a hand-written array would quietly fall behind and the new
 * tool would simply never be compared. Keyed by the union minus the two tools
 * that draw nothing, this stops compiling the moment a tool is added.
 */
const DRAWS: Record<Exclude<MarkupTool, 'pan' | 'select'>, true> = {
  line: true, arrow: true, rect: true, circle: true, ellipse: true,
  freehand: true, cloud: true, polygon: true, polyline: true, text: true,
  highlight: true, underline: true, strikeout: true, squiggly: true,
  stamp: true, note: true, callout: true, dimension: true, area: true,
  radius: true, calibrate: true, redact: true, formfield: true,
};

const TOOLS = Object.keys(DRAWS) as MarkupTool[];

/**
 * Geometry for every tool at once, so one fixture drives them all.
 *
 * Deliberately populated for every field: a tool that reads `points` and a
 * tool that reads `width` must both produce something, or the comparison below
 * passes by both sides drawing nothing.
 */
function shapeOf(tool: MarkupTool): ShapeData {
  return {
    id: 'shape-1', tool, pageNumber: 1,
    color: '#ff0000', strokeWidth: 2, opacity: 0.25,
    x: 10, y: 20, width: 100, height: 50,
    x1: 10, y1: 20, x2: 110, y2: 70,
    cx: 60, cy: 45, r: 25,
    points: [{ x: 0, y: 0 }, { x: 40, y: 30 }, { x: 80, y: 0 }],
    text: 'a note',
    measurement: '12.5 m', measurementDetail: '40.0 m',
    segmentLabels: ['6.0 m', '6.5 m'],
  };
}

/**
 * The element names in a string of SVG, in document order.
 *
 * Wrapper `<g>` and `<svg>` elements are dropped: the string renderer groups
 * some tools and not others, and the primitives are always a flat list drawn
 * inside one group per shape. What must match is the drawn elements.
 */
function elementNames(svg: string): string[] {
  const document = new DOMParser()
    .parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${svg}</svg>`, 'image/svg+xml');
  return [...document.documentElement.querySelectorAll('*')]
    .map((element) => element.tagName)
    .filter((name) => name !== 'g' && name !== 'svg');
}

/**
 * Which primitive field carries which SVG attribute.
 *
 * Element names matching is not enough: a callout whose box sits eighty pixels
 * off, or a squiggle with the wrong period, draws the same `path` and is
 * plainly wrong on the page. Everything geometric is compared by value.
 *
 * Paint is not: the string renderer writes `stroke="none"` where these leave a
 * colour that the element ignores, and chasing that would assert the old
 * renderer's incidental choices rather than what is drawn.
 */
const GEOMETRY: Record<string, string[]> = {
  rect: ['x', 'y', 'width', 'height', 'rx'],
  circle: ['cx', 'cy', 'r'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
  line: ['x1', 'y1', 'x2', 'y2'],
  path: ['d'],
  polygon: ['points'],
  text: ['x', 'y'],
  title: [],
};

/** Every drawn element in a string of SVG, with its attributes. */
function elementsIn(svg: string): Element[] {
  const document = new DOMParser()
    .parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${svg}</svg>`, 'image/svg+xml');
  return [...document.documentElement.querySelectorAll('*')]
    .filter((element) => element.tagName !== 'g' && element.tagName !== 'svg');
}

describe('shapeToPrimitives agrees with shapeToSvg', () => {

  const markup = new MarkupEngineService();

  for (const tool of TOOLS) {
    it(`draws the same elements for "${tool}"`, () => {
      const shape = shapeOf(tool);
      const fromString = elementNames(markup.shapeToSvg(shape));
      const fromPrimitives = markup.shapeToPrimitives(shape).map((p) => p.kind);

      expect(fromPrimitives).not.toHaveLength(0);
      expect(fromPrimitives).toEqual(fromString);
    });

    it(`puts them in the same place for "${tool}"`, () => {
      const shape = shapeOf(tool);
      const elements = elementsIn(markup.shapeToSvg(shape));
      const primitives = markup.shapeToPrimitives(shape);

      primitives.forEach((primitive, index) => {
        const element = elements[index];
        const fields = GEOMETRY[primitive.kind] ?? [];
        for (const field of fields) {
          const drawn = element?.getAttribute(field);
          // An attribute the string renderer omits is one this may omit too;
          // what must never differ is a value both of them state.
          if (drawn === null || drawn === undefined) continue;
          const value = (primitive as unknown as Record<string, unknown>)[field];
          expect(String(value), `${tool} → ${primitive.kind}.${field}`)
            .toBe(drawn.trim());
        }
      });
    });
  }

  it('carries the same text, for the tools that draw any', () => {
    for (const tool of ['text', 'stamp', 'callout', 'note'] as MarkupTool[]) {
      const shape = shapeOf(tool);
      const drawn = elementsIn(markup.shapeToSvg(shape))
        .filter((element) => element.tagName === 'text' || element.tagName === 'title')
        .map((element) => element.textContent);
      const carried = markup.shapeToPrimitives(shape)
        .filter((primitive) => primitive.kind === 'text' || primitive.kind === 'title')
        .map((primitive) => (primitive as { content: string }).content);

      expect(carried, tool).toEqual(drawn);
    }
  });

  it('draws nothing for a tool neither renderer knows', () => {
    const unknown = { ...shapeOf('rect'), tool: 'sketch' as MarkupTool };

    expect(markup.shapeToSvg(unknown)).toBe('');
    expect(markup.shapeToPrimitives(unknown)).toEqual([]);
  });

  it('omits an empty measurement label rather than drawing a bare plate', () => {
    const withoutReadout = {
      ...shapeOf('area'), measurement: undefined, measurementDetail: undefined,
    };

    const kinds = markup.shapeToPrimitives(withoutReadout).map((p) => p.kind);

    expect(kinds).toEqual(elementNames(markup.shapeToSvg(withoutReadout)));
    expect(kinds).not.toContain('text');
  });

  it('keeps user text a value, never markup', () => {
    // The string renderer escapes it; this one never builds a string, so the
    // text lands in a bound text node. Both are safe and only one needs a
    // sanitiser — which is the reason for the second renderer.
    const hostile = { ...shapeOf('text'), text: '</text><script>alert(1)</script>' };

    const primitives = markup.shapeToPrimitives(hostile);
    const text = primitives.find((p): p is Extract<SvgPrimitive, { kind: 'text' }> =>
      p.kind === 'text');

    expect(text?.content).toBe('</text><script>alert(1)</script>');
  });
});
