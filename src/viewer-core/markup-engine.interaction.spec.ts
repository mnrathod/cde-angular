/**
 * The decisions the markup engine makes while someone is drawing.
 *
 * <p>Four of them, and each is the difference between a tool that works and
 * one that is merely present: where a pointer is in the drawing's own
 * coordinates, whether a drag produced a shape worth keeping, whether a click
 * landed on an existing shape, and how far "near enough" is in a document
 * whose units are not pixels.
 *
 * <p>Touch is the half of this that nothing exercised. A stroke on a tablet
 * goes through the same code as a stroke with a mouse and then diverges in
 * one place — reading the touch out of the event — and the two lists a browser
 * keeps there are empty at different moments. §1.4 asks the product to work
 * from 360px up, which means a phone, which means touch.
 */
import { describe, expect, it } from 'vitest';

import { MarkupEngineService } from './markup-engine.service';
import type { ShapeData, MarkupTool } from './viewer-state.service';

const engine = new MarkupEngineService();

/** An SVG whose own coordinate space is the same size as its box on screen. */
function svgElement(
  { width = 800, height = 600, viewBoxWidth = 800, viewBoxHeight = 600 } = {},
): SVGSVGElement {
  return {
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
    viewBox: { baseVal: { width: viewBoxWidth, height: viewBoxHeight } },
    getScreenCTM: () => null,
  } as unknown as SVGSVGElement;
}

function shape(tool: MarkupTool, fields: Partial<ShapeData> = {}): ShapeData {
  return {
    id: 'shape-1', tool, pageNumber: 1,
    color: '#ff0000', strokeWidth: 2, opacity: 0.25,
    ...fields,
  };
}

describe('finding where the pointer is', () => {

  it('reads a mouse position relative to the drawing', () => {
    const point = engine.getSvgPoint(
      { clientX: 120, clientY: 90 } as MouseEvent, svgElement());

    expect(point).toEqual({ x: 120, y: 90 });
  });

  it('scales a mouse position into the drawing’s own units', () => {
    // A CAD drawing's viewBox is its model units, often tens of thousands
    // across. A pointer at 400px along an 800px-wide box is halfway, which
    // is 4000 in a drawing 8000 units wide — not 400.
    const point = engine.getSvgPoint(
      { clientX: 400, clientY: 300 } as MouseEvent,
      svgElement({ viewBoxWidth: 8000, viewBoxHeight: 6000 }));

    expect(point).toEqual({ x: 4000, y: 3000 });
  });

  it('accounts for the drawing not being at the top left of the page', () => {
    const svg = {
      getBoundingClientRect: () => ({ left: 40, top: 25, width: 800, height: 600 }),
      viewBox: { baseVal: { width: 800, height: 600 } },
      getScreenCTM: () => null,
    } as unknown as SVGSVGElement;

    const point = engine.getSvgPoint({ clientX: 140, clientY: 125 } as MouseEvent, svg);

    expect(point).toEqual({ x: 100, y: 100 });
  });

  it('falls back to the box size when the drawing declares no viewBox', () => {
    // `viewBox.baseVal.width` is 0 on an SVG without one, and dividing by
    // zero here would put the pointer at Infinity.
    const point = engine.getSvgPoint(
      { clientX: 120, clientY: 90 } as MouseEvent,
      svgElement({ viewBoxWidth: 0, viewBoxHeight: 0 }));

    expect(point).toEqual({ x: 120, y: 90 });
  });

  describe('a stroke made with a finger', () => {
    /**
     * A TouchEvent as the browser hands it over, with the two lists set.
     *
     * <p>Built on the real prototype, because the code under test branches on
     * `event instanceof TouchEvent` — a plain object with the right fields
     * would take the mouse path and prove nothing. `touches` and
     * `changedTouches` are getter-only on that prototype, so they are defined
     * rather than assigned.
     */
    function touchEvent(
      touches: Array<{ clientX: number; clientY: number }>,
      changedTouches: Array<{ clientX: number; clientY: number }> = [],
    ): TouchEvent {
      const event = Object.create(TouchEvent.prototype) as TouchEvent;
      Object.defineProperty(event, 'touches', { value: touches });
      Object.defineProperty(event, 'changedTouches', { value: changedTouches });
      return event;
    }

    it('reads the position of the finger on the screen', () => {
      const point = engine.getSvgPoint(
        touchEvent([{ clientX: 120, clientY: 90 }]), svgElement());

      expect(point).toEqual({ x: 120, y: 90 });
    });

    it('reads the lifted finger on touchend, where touches is empty', () => {
      // `touches` holds fingers still down, so it is empty the moment the
      // last one lifts — which is exactly when a stroke ends. Reading [0]
      // unconditionally threw there, so every completed touch stroke used
      // to fail on its final event.
      const point = engine.getSvgPoint(
        touchEvent([], [{ clientX: 200, clientY: 150 }]), svgElement());

      expect(point).toEqual({ x: 200, y: 150 });
    });

    it('ends harmlessly at the origin when a gesture is cancelled', () => {
      // A synthesised touchcancel — an incoming call, or the app
      // backgrounded mid-stroke — carries neither list. The origin ends the
      // stroke; throwing would leave the markup layer mid-drag with a
      // pointer that never lifts.
      const point = engine.getSvgPoint(touchEvent([], []), svgElement());

      expect(point).toEqual({ x: 0, y: 0 });
    });

    it('scales a finger position into the drawing’s units too', () => {
      const point = engine.getSvgPoint(
        touchEvent([{ clientX: 400, clientY: 300 }]),
        svgElement({ viewBoxWidth: 8000, viewBoxHeight: 6000 }));

      expect(point).toEqual({ x: 4000, y: 3000 });
    });
  });
});

describe('how near counts as near', () => {

  it('falls back to screen pixels when the element has no transform', () => {
    // `getScreenCTM` returns null for an element that is not rendered —
    // detached, or inside a `display:none` ancestor. Returning the pixel
    // figure is the only honest answer; zero would make nothing clickable.
    expect(engine.toleranceInUserUnits(svgElement(), 10)).toBe(10);
  });

  it('converts screen pixels into the drawing’s own units', () => {
    // A fixed tolerance of ten is ten pixels on a PDF and a small fraction
    // of one on a CAD drawing measured in tens of thousands of units, where
    // a click could never land inside it.
    const svg = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
      viewBox: { baseVal: { width: 800, height: 600 } },
      getScreenCTM: () => ({ a: 0.1, b: 0 }),
    } as unknown as SVGSVGElement;

    expect(engine.toleranceInUserUnits(svg, 10)).toBe(100);
  });

  it('falls back rather than dividing by a zero scale', () => {
    const svg = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
      viewBox: { baseVal: { width: 800, height: 600 } },
      getScreenCTM: () => ({ a: 0, b: 0 }),
    } as unknown as SVGSVGElement;

    expect(engine.toleranceInUserUnits(svg, 10)).toBe(10);
  });
});

describe('whether a drag produced a shape worth keeping', () => {

  it('keeps a line that was actually dragged', () => {
    expect(engine.hasMinimumSize(
      shape('line', { x1: 0, y1: 0, x2: 100, y2: 0 }))).toBe(true);
  });

  it('discards a line that was only clicked', () => {
    // The rule that stops a stray click leaving an invisible zero-length
    // line on the page, which then has to be found and deleted.
    expect(engine.hasMinimumSize(
      shape('line', { x1: 50, y1: 50, x2: 50, y2: 50 }))).toBe(false);
  });

  it('discards a line dragged less far than the threshold', () => {
    expect(engine.hasMinimumSize(
      shape('line', { x1: 0, y1: 0, x2: 2, y2: 0 }))).toBe(false);
  });

  it('applies the same rule to an arrow', () => {
    expect(engine.hasMinimumSize(shape('arrow', { x1: 0, y1: 0, x2: 1, y2: 1 })))
      .toBe(false);
  });

  it.each(['rect', 'highlight', 'redact', 'formfield', 'ellipse',
           'underline', 'strikeout', 'squiggly'] as MarkupTool[])(
    'keeps a %s with real extent', (tool) => {
      expect(engine.hasMinimumSize(shape(tool, { width: 40, height: 20 }))).toBe(true);
    });

  it.each(['rect', 'highlight', 'redact', 'formfield', 'ellipse',
           'underline', 'strikeout', 'squiggly'] as MarkupTool[])(
    'discards a %s with no extent', (tool) => {
      expect(engine.hasMinimumSize(shape(tool, { width: 0, height: 0 }))).toBe(false);
    });

  it('discards a box that is wide but not tall', () => {
    // Both dimensions, not either: a one-pixel-tall band is a stray drag,
    // not a highlight.
    expect(engine.hasMinimumSize(shape('rect', { width: 200, height: 1 }))).toBe(false);
  });

  it('keeps a circle with a radius and discards one without', () => {
    expect(engine.hasMinimumSize(shape('circle', { r: 20 }))).toBe(true);
    expect(engine.hasMinimumSize(shape('circle', { r: 1 }))).toBe(false);
  });

  it('wants three points for an area and two for a dimension', () => {
    // An area of two points has no area. A dimension of two is a length.
    const two = [{ x: 0, y: 0 }, { x: 10, y: 0 }];

    expect(engine.hasMinimumSize(shape('area', { points: two }))).toBe(false);
    expect(engine.hasMinimumSize(shape('dimension', { points: two }))).toBe(true);
  });

  it('wants three points for an area and accepts three', () => {
    const three = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];

    expect(engine.hasMinimumSize(shape('area', { points: three }))).toBe(true);
  });

  it('wants two points for a radius', () => {
    expect(engine.hasMinimumSize(shape('radius', { points: [{ x: 0, y: 0 }] })))
      .toBe(false);
  });

  it('wants more than two points for a freehand stroke', () => {
    // Two points is a line somebody drew with the wrong tool; the stroke
    // tools need a path.
    const two = [{ x: 0, y: 0 }, { x: 10, y: 10 }];

    expect(engine.hasMinimumSize(shape('freehand', { points: two }))).toBe(false);
    expect(engine.hasMinimumSize(shape('polyline', { points: two }))).toBe(true);
  });

  it.each(['freehand', 'cloud', 'polygon'] as MarkupTool[])(
    'keeps a %s of three points', (tool) => {
      const three = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];

      expect(engine.hasMinimumSize(shape(tool, { points: three }))).toBe(true);
    });

  it('keeps a tool with no size rule of its own', () => {
    // A note is a pin; a stamp is a label. Neither has an extent to measure,
    // and discarding them for not having one would make them unplaceable.
    expect(engine.hasMinimumSize(shape('note'))).toBe(true);
    expect(engine.hasMinimumSize(shape('text'))).toBe(true);
  });

  it('discards a shape whose geometry never arrived', () => {
    expect(engine.hasMinimumSize(shape('rect'))).toBe(false);
    expect(engine.hasMinimumSize(shape('circle'))).toBe(false);
    expect(engine.hasMinimumSize(shape('freehand'))).toBe(false);
  });
});

describe('clicking on a shape that is already there', () => {
  const box = shape('rect', { id: 'box', x: 100, y: 100, width: 80, height: 40 });
  const dot = shape('circle', { id: 'dot', cx: 400, cy: 400, r: 20 });
  const rule = shape('line', { id: 'rule', x1: 0, y1: 0, x2: 200, y2: 0 });

  it('finds a box clicked in the middle', () => {
    expect(engine.hitTest([box], { x: 140, y: 120 })?.id).toBe('box');
  });

  it('finds a box clicked just outside it, within tolerance', () => {
    // A stroke has width and a finger is not precise. Requiring a click
    // strictly inside the geometry makes a thin shape unselectable.
    expect(engine.hitTest([box], { x: 96, y: 120 })?.id).toBe('box');
  });

  it('does not find a box clicked well away from it', () => {
    expect(engine.hitTest([box], { x: 300, y: 300 })).toBeNull();
  });

  it('finds a circle by distance from its centre', () => {
    expect(engine.hitTest([dot], { x: 410, y: 400 })?.id).toBe('dot');
    expect(engine.hitTest([dot], { x: 460, y: 400 })).toBeNull();
  });

  it('finds a line by distance from the line, not from its ends', () => {
    // The whole point of a segment distance: a click halfway along a line
    // is on the line, and a click past its end is not.
    expect(engine.hitTest([rule], { x: 100, y: 2 })?.id).toBe('rule');
    expect(engine.hitTest([rule], { x: 300, y: 0 })).toBeNull();
  });

  it('finds a zero-length line by distance from the point it is', () => {
    // The degenerate segment, where the projection would divide by zero.
    const dotLine = shape('line', { id: 'dot-line', x1: 50, y1: 50, x2: 50, y2: 50 });

    expect(engine.hitTest([dotLine], { x: 52, y: 52 })?.id).toBe('dot-line');
    expect(engine.hitTest([dotLine], { x: 200, y: 200 })).toBeNull();
  });

  it('returns the topmost shape when several overlap', () => {
    // Drawing order is stacking order, and a click selects what is visibly
    // on top rather than what happens to be first in the list.
    const under = shape('rect', { id: 'under', x: 0, y: 0, width: 200, height: 200 });
    const over = shape('rect', { id: 'over', x: 50, y: 50, width: 50, height: 50 });

    expect(engine.hitTest([under, over], { x: 70, y: 70 })?.id).toBe('over');
  });

  it('finds nothing on an empty page', () => {
    expect(engine.hitTest([], { x: 10, y: 10 })).toBeNull();
  });

  it('ignores a tool with no hit shape of its own', () => {
    // Freehand and the measurement tools have no area to test, so they are
    // not selectable by click. Returning them would select a shape the user
    // cannot see themselves having hit.
    const stroke = shape('freehand', {
      id: 'stroke', points: [{ x: 10, y: 10 }, { x: 20, y: 20 }],
    });

    expect(engine.hitTest([stroke], { x: 15, y: 15 })).toBeNull();
  });

  it('honours a wider tolerance on a drawing measured in large units', () => {
    expect(engine.hitTest([box], { x: 60, y: 120 }, 50)?.id).toBe('box');
  });
});

describe('building a shape click by click', () => {

  it('will not finish a shape with too few vertices', () => {
    const polygon = shape('polygon', { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] });

    expect(engine.canFinish(polygon)).toBe(false);
  });

  it('will finish a polygon once it has three', () => {
    const polygon = shape('polygon', {
      points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
    });

    expect(engine.canFinish(polygon)).toBe(true);
  });

  it('will not finish a shape that is not built by clicking', () => {
    expect(engine.canFinish(shape('rect', { width: 40, height: 40 }))).toBe(false);
  });

  it('will not finish a shape that does not exist', () => {
    expect(engine.canFinish(null)).toBe(false);
  });

  it('adds a preview vertex for a click-built tool', () => {
    // What draws the segment following the cursor before the next click.
    const polygon = shape('polygon', { points: [{ x: 0, y: 0 }] });

    expect(engine.withPreviewPoint(polygon, { x: 5, y: 5 }).points).toHaveLength(2);
  });

  it('adds no preview vertex when the cursor has left the page', () => {
    const polygon = shape('polygon', { points: [{ x: 0, y: 0 }] });

    expect(engine.withPreviewPoint(polygon, null).points).toHaveLength(1);
  });

  it('adds no preview vertex to a dragged tool', () => {
    const rect = shape('rect', { width: 10, height: 10 });

    expect(engine.withPreviewPoint(rect, { x: 5, y: 5 }).points).toBeUndefined();
  });

  it('adds a preview vertex to a shape that has none yet', () => {
    const polygon = shape('polygon');

    expect(engine.withPreviewPoint(polygon, { x: 5, y: 5 }).points)
      .toEqual([{ x: 5, y: 5 }]);
  });
});

describe('serialising shapes', () => {

  it('round-trips through JSON', () => {
    const shapes = [shape('rect', { x: 1, y: 2, width: 3, height: 4 })];

    expect(engine.parseShapesJson(engine.shapesToJson(shapes))).toEqual(shapes);
  });

  it('returns nothing for text that is not JSON at all', () => {
    // This reads a file somebody chose. A parse failure has to be an empty
    // list rather than an exception, or opening the wrong file takes the
    // viewer down.
    expect(engine.parseShapesJson('not json')).toEqual([]);
  });

  it('returns nothing for JSON that is not a shape file', () => {
    expect(engine.parseShapesJson('{"unrelated":true}')).toEqual([]);
  });

  it('returns nothing for an empty string', () => {
    expect(engine.parseShapesJson('')).toEqual([]);
  });
});
