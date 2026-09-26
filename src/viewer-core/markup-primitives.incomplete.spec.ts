/**
 * Shapes that arrive without their geometry.
 *
 * <p>`markup-primitives.spec.ts` drives every tool through a fixture with
 * every field populated, which is what the comparison between the two
 * renderers needs. This is its companion, and it is the case that actually
 * happens: a shape whose geometry is missing.
 *
 * <p>Every geometry field on `ShapeData` is optional, and the renderers all
 * fall back with `?? 0`. Those fallbacks were the largest single block of
 * uncovered branches in `viewer-core` — 106 of them across the two files —
 * which means nothing had ever rendered a shape that was not fully formed.
 *
 * <p>It is not a hypothetical shape. In an embed, `ShapeData` comes from
 * `host.loadMarkup`: the host's own store, in its own format, mapped by
 * `MarkupWireFormat`, and §5.12 is explicit that nothing arriving from a
 * client is trusted. A half-built shape also exists during a drag, before
 * the second point is known.
 *
 * <p>What matters is not that a missing field defaults to zero — it is that
 * no attribute comes out `NaN`. `x="NaN"` is not an error a browser reports;
 * the element is simply not drawn, so the markup vanishes and nothing
 * anywhere says why. Arithmetic on `undefined` is how that happens, and every
 * one of these fallbacks exists to prevent it.
 */
import { describe, expect, it } from 'vitest';

import { MarkupEngineService, SvgPrimitive } from './markup-engine.service';
import type { ShapeData, MarkupTool } from './viewer-state.service';

/**
 * Every tool that draws, keyed as a `Record` so this stops compiling when a
 * tool is added — the same reason the sibling spec does it.
 */
const DRAWS: Record<Exclude<MarkupTool, 'pan' | 'select'>, true> = {
  line: true, arrow: true, rect: true, circle: true, ellipse: true,
  freehand: true, cloud: true, polygon: true, polyline: true, text: true,
  highlight: true, underline: true, strikeout: true, squiggly: true,
  stamp: true, note: true, callout: true, dimension: true, area: true,
  radius: true, calibrate: true, redact: true, formfield: true,
};

const TOOLS = Object.keys(DRAWS) as MarkupTool[];

const engine = new MarkupEngineService();

/** Only the fields `ShapeData` requires. No geometry at all. */
function bareShape(tool: MarkupTool): ShapeData {
  return {
    id: 'shape-1', tool, pageNumber: 1,
    color: '#ff0000', strokeWidth: 2, opacity: 0.25,
  };
}

/** Every numeric attribute on a primitive, whatever its kind. */
function numbersIn(primitive: SvgPrimitive): Array<[string, number]> {
  return Object.entries(primitive)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number');
}

/** Every coordinate inside a path or polygon's own string form. */
function numbersInGeometryString(primitive: SvgPrimitive): string[] {
  const geometry = 'd' in primitive ? primitive.d
    : 'points' in primitive ? primitive.points
      : '';
  return typeof geometry === 'string'
    ? geometry.match(/NaN|Infinity|undefined/g) ?? []
    : [];
}

describe('a shape with no geometry on it', () => {

  it.each(TOOLS)('%s renders without throwing', (tool) => {
    expect(() => engine.shapeToPrimitives(bareShape(tool))).not.toThrow();
  });

  /**
   * The tools whose whole geometry is a point list. With no points there is
   * genuinely nothing to draw, and both renderers say so by returning
   * nothing — which is the right answer, not a gap.
   */
  const POINT_BASED: MarkupTool[] =
    ['freehand', 'cloud', 'polygon', 'polyline', 'dimension', 'area',
     'radius', 'calibrate'];

  const FIXED_GEOMETRY = TOOLS.filter((tool) => !POINT_BASED.includes(tool));

  it.each(FIXED_GEOMETRY)('%s draws something rather than nothing', (tool) => {
    // A tool that returned an empty list here would hide the defect the rest
    // of this file is about: no primitives means no NaN to find. Only asked
    // of the tools whose geometry is not a point list.
    expect(engine.shapeToPrimitives(bareShape(tool)).length).toBeGreaterThan(0);
  });

  it.each(POINT_BASED)('%s draws nothing at all without points', (tool) => {
    // Worth asserting rather than skipping: drawing a degenerate stub for a
    // measurement nobody has placed puts a zero-length dimension on the page.
    expect(engine.shapeToPrimitives(bareShape(tool))).toEqual([]);
    expect(engine.shapeToSvg(bareShape(tool))).toBe('');
  });

  it.each(TOOLS)('%s puts no NaN in any numeric attribute', (tool) => {
    // The failure this guards. `x="NaN"` is not reported by a browser — the
    // element is silently not drawn, so the markup disappears with no error
    // anywhere.
    for (const primitive of engine.shapeToPrimitives(bareShape(tool))) {
      for (const [attribute, value] of numbersIn(primitive)) {
        expect(Number.isFinite(value),
          `${tool} produced ${attribute}=${value}`).toBe(true);
      }
    }
  });

  it.each(TOOLS)('%s puts no NaN inside a path or polygon', (tool) => {
    // A path's coordinates are interpolated into one string, so they escape
    // the numeric check above entirely — `d="M NaN,NaN"` is a perfectly
    // well-typed string.
    for (const primitive of engine.shapeToPrimitives(bareShape(tool))) {
      expect(numbersInGeometryString(primitive),
        `${tool} produced a geometry string containing it`).toEqual([]);
    }
  });

  it.each(TOOLS)('%s renders to a string with no NaN in it either', (tool) => {
    // The other renderer, which writes SVG files out. The two are kept in
    // step by the sibling spec; this checks the fallbacks exist on both
    // sides rather than only on the one that reaches the DOM.
    const svg = engine.shapeToSvg(bareShape(tool));

    expect(svg).not.toContain('NaN');
    expect(svg).not.toContain('undefined');
    expect(svg).not.toContain('Infinity');
  });
});

describe('a shape with an empty point list', () => {
  const pointBased: MarkupTool[] =
    ['freehand', 'cloud', 'polygon', 'polyline', 'dimension', 'area', 'calibrate'];

  it.each(pointBased)('%s survives no points at all', (tool) => {
    // Distinct from the field being absent: a drag that was cancelled
    // before the first point, or a host that sent `points: []`.
    const shape = { ...bareShape(tool), points: [] };

    expect(() => engine.shapeToPrimitives(shape)).not.toThrow();
    expect(engine.shapeToSvg(shape)).not.toContain('NaN');
  });

  it.each(pointBased)('%s survives a single point', (tool) => {
    // The state during a drag, and the one that divides by a zero length or
    // reads `points[1]` in the tools that measure.
    const shape = { ...bareShape(tool), points: [{ x: 12, y: 34 }] };

    for (const primitive of engine.shapeToPrimitives(shape)) {
      for (const [attribute, value] of numbersIn(primitive)) {
        expect(Number.isFinite(value),
          `${tool} produced ${attribute}=${value}`).toBe(true);
      }
    }
    expect(engine.shapeToSvg(shape)).not.toContain('NaN');
  });
});

describe('a shape with degenerate geometry', () => {

  it('draws a zero-length line without dividing by its length', () => {
    // An arrow's head is placed along the unit vector of its direction, and
    // a click without a drag has no direction. Dividing by zero here is how
    // an arrowhead becomes `NaN`.
    const shape: ShapeData = {
      ...bareShape('arrow'), x1: 40, y1: 40, x2: 40, y2: 40,
    };

    for (const primitive of engine.shapeToPrimitives(shape)) {
      for (const [attribute, value] of numbersIn(primitive)) {
        expect(Number.isFinite(value), `arrow produced ${attribute}=${value}`)
          .toBe(true);
      }
    }
  });

  it('draws a zero-radius circle', () => {
    const shape: ShapeData = { ...bareShape('circle'), cx: 10, cy: 10, r: 0 };

    expect(engine.shapeToSvg(shape)).not.toContain('NaN');
  });

  it('draws a zero-sized rectangle', () => {
    const shape: ShapeData = {
      ...bareShape('rect'), x: 10, y: 10, width: 0, height: 0,
    };

    expect(engine.shapeToSvg(shape)).not.toContain('NaN');
  });

  it('draws an ellipse with no extent', () => {
    // Halves the width and height, so a zero extent is a zero radius rather
    // than a division.
    const shape: ShapeData = {
      ...bareShape('ellipse'), x: 10, y: 10, width: 0, height: 0,
    };

    expect(engine.shapeToSvg(shape)).not.toContain('NaN');
  });

  it('draws with a negative width rather than producing nothing', () => {
    // A drag leftwards. Whether the renderer normalises or not, it must not
    // emit an attribute a browser rejects outright.
    const shape: ShapeData = {
      ...bareShape('rect'), x: 100, y: 100, width: -60, height: -40,
    };

    expect(() => engine.shapeToPrimitives(shape)).not.toThrow();
    expect(engine.shapeToSvg(shape)).not.toContain('NaN');
  });
});

describe('a shape with no opacity', () => {

  it('still produces a valid fill colour', () => {
    // The fill is the colour with an alpha byte appended, computed from
    // `opacity`. Without the fallback that byte is `NaN` and the whole fill
    // string is unparseable, which loses the shape rather than its
    // transparency.
    const shape = { ...bareShape('rect'), opacity: undefined as unknown as number };

    for (const primitive of engine.shapeToPrimitives(shape)) {
      expect(primitive.fill).not.toContain('NaN');
    }
  });

  it('produces a fully transparent fill rather than an opaque one', () => {
    // The safe direction: an absent opacity should not paint over the
    // document underneath.
    const shape = { ...bareShape('rect'), opacity: 0 };
    const [first] = engine.shapeToPrimitives(shape);

    expect(first?.fill).toMatch(/00$/);
  });
});

describe('text that was never typed', () => {
  const textBased: MarkupTool[] = ['text', 'stamp', 'note', 'callout'];

  it.each(textBased)('%s renders with no text set', (tool) => {
    // A note placed and not yet written in. Rendering `undefined` as the
    // literal word is the failure here, not a crash.
    const svg = engine.shapeToSvg(bareShape(tool));

    expect(svg).not.toContain('undefined');
  });

  it.each(textBased)('%s renders with empty text', (tool) => {
    const svg = engine.shapeToSvg({ ...bareShape(tool), text: '' });

    expect(svg).not.toContain('undefined');
  });
});
