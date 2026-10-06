import { TestBed } from '@angular/core/testing';
import { MarkupEngineService } from './markup-engine.service';
import { ShapeData, MarkupTool } from './viewer-state.service';
import { definitely } from '../testing/definitely';

describe('MarkupEngineService', () => {
  let service: MarkupEngineService;

  const pt = { x: 100, y: 150 };
  const defaults = { pageNumber: 1, color: '#FF0000', strokeWidth: 2, opacity: 0.15 };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [MarkupEngineService] });
    service = TestBed.inject(MarkupEngineService);
  });

  // ── newId ─────────────────────────────────────────────────────
  it('newId() should return unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => service.newId()));
    expect(ids.size).toBe(100);
  });

  it('newId() should start with "s-"', () => {
    expect(service.newId()).toMatch(/^s-\d+-[a-z0-9]+$/);
  });

  // ── startShape ────────────────────────────────────────────────
  it('startShape line should set x1,y1,x2,y2', () => {
    const s = service.startShape(
      'line', pt, defaults.pageNumber, defaults.color, defaults.strokeWidth, defaults.opacity
    );
    expect(s.tool).toBe('line');
    expect(s.x1).toBe(100); expect(s.y1).toBe(150);
    expect(s.x2).toBe(100); expect(s.y2).toBe(150);
  });

  it('startShape rect should set x,y,width,height', () => {
    const s = service.startShape('rect', pt, 1, '#FF0000', 2, 0.15);
    expect(s.x).toBe(100); expect(s.y).toBe(150);
    expect(s.width).toBe(0); expect(s.height).toBe(0);
  });

  it('startShape circle should set cx,cy,r', () => {
    const s = service.startShape('circle', pt, 1, '#FF0000', 2, 0.15);
    expect(s.cx).toBe(100); expect(s.cy).toBe(150); expect(s.r).toBe(0);
  });

  it('startShape freehand should start with one point', () => {
    const s = service.startShape('freehand', pt, 1, '#FF0000', 2, 0.15);
    expect(s.points).toEqual([pt]);
  });

  // ── updateShape ───────────────────────────────────────────────
  it('updateShape line should update x2,y2', () => {
    const s  = service.startShape('line', pt, 1, '#FF0000', 2, 0.15);
    const s2 = service.updateShape(s, { x: 200, y: 300 });
    expect(s2.x2).toBe(200); expect(s2.y2).toBe(300);
    expect(s2.x1).toBe(100); // unchanged
  });

  it('updateShape rect should calculate width/height correctly', () => {
    const s  = service.startShape('rect', { x: 50, y: 50 }, 1, '#FF0000', 2, 0.15);
    const s2 = service.updateShape(s, { x: 150, y: 200 });
    expect(s2.width).toBe(100);
    expect(s2.height).toBe(150);
    expect(s2.x).toBe(50);  // min x
    expect(s2.y).toBe(50);  // min y
  });

  it('updateShape rect should handle negative drag direction', () => {
    const s  = service.startShape('rect', { x: 200, y: 200 }, 1, '#FF0000', 2, 0.15);
    const s2 = service.updateShape(s, { x: 50, y: 50 });
    expect(s2.x).toBe(50);   // min
    expect(s2.y).toBe(50);   // min
    expect(s2.width).toBe(150);
    expect(s2.height).toBe(150);
  });

  it('updateShape circle should compute radius', () => {
    const s  = service.startShape('circle', { x: 100, y: 100 }, 1, '#FF0000', 2, 0.15);
    const s2 = service.updateShape(s, { x: 103, y: 104 });
    expect(s2.r).toBeCloseTo(5, 0);  // sqrt(9+16) = 5
  });

  it('updateShape freehand should append points', () => {
    const s  = service.startShape('freehand', { x: 0, y: 0 }, 1, '#FF0000', 2, 0.15);
    const s2 = service.updateShape(s, { x: 10, y: 10 });
    const s3 = service.updateShape(s2, { x: 20, y: 20 });
    expect(s3.points?.length).toBe(3);
  });

  // ── shapeToSvg ────────────────────────────────────────────────
  it('shapeToSvg line should produce <line> element', () => {
    const s: ShapeData = { id:'t1', tool:'line', pageNumber:1, color:'#FF0000',
      strokeWidth:2, opacity:0, x1:0, y1:0, x2:100, y2:100 };
    const svg = service.shapeToSvg(s);
    expect(svg).toContain('<line');
    expect(svg).toContain('data-id="t1"');
    expect(svg).toContain('stroke="#FF0000"');
  });

  it('shapeToSvg rect should produce <rect> element', () => {
    const s: ShapeData = { id:'t2', tool:'rect', pageNumber:1, color:'#0000FF',
      strokeWidth:2, opacity:0.15, x:10, y:10, width:80, height:60 };
    const svg = service.shapeToSvg(s);
    expect(svg).toContain('<rect');
    expect(svg).toContain('width="80"');
    expect(svg).toContain('height="60"');
  });

  it('shapeToSvg circle should produce <circle> element', () => {
    const s: ShapeData = { id:'t3', tool:'circle', pageNumber:1, color:'#00FF00',
      strokeWidth:2, opacity:0, cx:50, cy:50, r:30 };
    const svg = service.shapeToSvg(s);
    expect(svg).toContain('<circle');
    expect(svg).toContain('r="30"');
  });

  it('shapeToSvg arrow should contain polygon for arrowhead', () => {
    const s: ShapeData = { id:'t4', tool:'arrow', pageNumber:1, color:'#FF0000',
      strokeWidth:2, opacity:0, x1:0, y1:0, x2:100, y2:0 };
    const svg = service.shapeToSvg(s);
    expect(svg).toContain('<polygon');
    expect(svg).toContain('<line');
  });

  it('shapeToSvg text should produce <text> element with escaped content', () => {
    const s: ShapeData = { id:'t5', tool:'text', pageNumber:1, color:'#000',
      strokeWidth:2, opacity:0, x:50, y:50, text:'Hello <World>' };
    const svg = service.shapeToSvg(s);
    expect(svg).toContain('<text');
    expect(svg).toContain('Hello &lt;World&gt;');
  });

  // ── hitTest ───────────────────────────────────────────────────
  it('hitTest should find rect at pointer inside it', () => {
    const shapes: ShapeData[] = [
      { id:'h1', tool:'rect', pageNumber:1, color:'#F00', strokeWidth:2, opacity:0,
        x:50, y:50, width:100, height:100 }
    ];
    expect(service.hitTest(shapes, { x: 100, y: 100 })).toBeTruthy();
    expect(service.hitTest(shapes, { x: 100, y: 100 })?.id).toBe('h1');
  });

  it('hitTest should miss rect at pointer outside it', () => {
    const shapes: ShapeData[] = [
      { id:'h2', tool:'rect', pageNumber:1, color:'#F00', strokeWidth:2, opacity:0,
        x:50, y:50, width:100, height:100 }
    ];
    expect(service.hitTest(shapes, { x: 200, y: 200 })).toBeNull();
  });

  it('hitTest should find circle at pointer inside radius', () => {
    const shapes: ShapeData[] = [
      { id:'h3', tool:'circle', pageNumber:1, color:'#00F', strokeWidth:2, opacity:0,
        cx:100, cy:100, r:40 }
    ];
    expect(service.hitTest(shapes, { x: 110, y: 110 })).toBeTruthy();
    expect(service.hitTest(shapes, { x: 200, y: 200 })).toBeNull();
  });

  // ── serialisation ─────────────────────────────────────────────
  it('shapesToJson / parseShapesJson should round-trip', () => {
    const shapes: ShapeData[] = [
      { id:'s1', tool:'line', pageNumber:1, color:'#F00', strokeWidth:2, opacity:0,
        x1:0, y1:0, x2:100, y2:100 }
    ];
    const json   = service.shapesToJson(shapes);
    const parsed = service.parseShapesJson(json);
    expect(parsed.length).toBe(1);
    expect(definitely(parsed[0]).id).toBe('s1');
    expect(definitely(parsed[0]).tool).toBe('line');
  });

  it('parseShapesJson should return [] for invalid JSON', () => {
    expect(service.parseShapesJson('not json')).toEqual([]);
    expect(service.parseShapesJson('')).toEqual([]);
  });

  // ── completion hints ──────────────────────────────────────────
  describe('completionHint', () => {
    it('names a way to finish that does not depend on a double-click', () => {
      // Area, Length, polygon and polyline are all built the same way. The
      // hint used to say "double-click the last to finish" and that was the
      // only way out — so when a dblclick failed to register, the shape could
      // not be completed and the tool looked broken.
      for (const tool of ['polygon', 'polyline', 'dimension', 'area'] as MarkupTool[]) {
        const hint = service.completionHint(tool);
        expect(hint).toContain('Enter');
        expect(hint).toContain('first point');
      }
    });

    it('names the click count for tools that end on one', () => {
      // Promising a double-click here would be wrong: these finish by
      // themselves on the second click.
      for (const tool of ['radius', 'calibrate'] as MarkupTool[]) {
        // Sentence-cased at the source. It used to be a lowercase fragment
        // the toolbar capitalised with charAt(0).toUpperCase(), which is
        // correct in English and wrong wherever casing rules differ.
        expect(service.completionHint(tool)).toBe('Click 2 points');
        expect(service.completionHint(tool)).not.toContain('double-click');
      }
    });

    it('says nothing for tools that are dragged', () => {
      for (const tool of ['rect', 'circle', 'line', 'freehand'] as MarkupTool[]) {
        expect(service.completionHint(tool)).toBe('');
      }
    });

    it('explains every vertex tool, so a new one cannot go undocumented', () => {
      const all: MarkupTool[] = [
        'pan', 'select', 'line', 'arrow', 'rect', 'circle', 'ellipse',
        'polygon', 'polyline', 'freehand', 'cloud', 'text', 'highlight',
        'underline', 'strikeout', 'squiggly', 'stamp', 'note', 'callout',
        'dimension', 'area', 'radius', 'calibrate', 'redact', 'formfield'
      ];
      const unexplained = all.filter(
        tool => service.isVertexTool(tool) && service.completionHint(tool) === '');
      expect(unexplained).toEqual([]);
    });
  });

  // ── which tools have to ask for text ──────────────────────────
  describe('isTextTool', () => {

    const ALL_TOOLS: MarkupTool[] = [
      'pan', 'select', 'line', 'arrow', 'rect', 'circle', 'ellipse',
      'polygon', 'polyline', 'freehand', 'cloud', 'text', 'highlight',
      'underline', 'strikeout', 'squiggly', 'stamp', 'note', 'callout',
      'dimension', 'area', 'radius', 'calibrate', 'redact', 'formfield'
    ];

    /**
     * Derived from what startShape actually builds rather than from a second
     * hand-written list, because a hand-written list is what broke: `callout`
     * carried a `text` field and neither viewer knew, so it drew an empty box
     * that could not be typed into. Asserting against the real shape means a
     * new text-bearing tool cannot be added without this failing.
     */
    it('recognises every tool whose shape carries text', () => {
      const carriesText = ALL_TOOLS.filter(tool => {
        const shape = service.startShape(
          tool, pt, defaults.pageNumber, defaults.color,
          defaults.strokeWidth, defaults.opacity
        );
        return 'text' in shape;
      });

      const unrecognised = carriesText.filter(tool => !service.isTextTool(tool));
      expect(unrecognised).toEqual([]);
    });

    it('includes callout, which was the one that was missed', () => {
      expect(service.isTextTool('callout')).toBe(true);
    });

    it('leaves dragged shapes alone, so they still draw rather than prompting', () => {
      for (const tool of ['rect', 'circle', 'line', 'freehand'] as MarkupTool[]) {
        expect(service.isTextTool(tool)).toBe(false);
      }
    });
  });

  // ── closing a click-built shape ───────────────────────────────
  describe('finishesShape', () => {
    const square = [{ x: 100, y: 100 }, { x: 200, y: 100 }, { x: 200, y: 200 }];
    const area = (points = square, tool: MarkupTool = 'area'): ShapeData => ({
      id: 'c1', tool, pageNumber: 1, color: '#F00',
      strokeWidth: 2, opacity: 0.15, points
    });

    it('finishes on a browser-recognised double-click', () => {
      expect(service.finishesShape(area(), { x: 500, y: 500 }, 10, 2)).toBe(true);
    });

    it('finishes on a click back on the first vertex', () => {
      expect(service.finishesShape(area(), { x: 100, y: 100 }, 10, 1)).toBe(true);
      // A hand is not exact — near enough must also close.
      expect(service.finishesShape(area(), { x: 106, y: 96 }, 10, 1)).toBe(true);
    });

    it('finishes on a second click on the vertex just placed', () => {
      // This is what a slow double-click amounts to. The browser reports two
      // ordinary clicks once the presses are more than about half a second
      // apart, so detail stays 1 and there is no dblclick event — relying on
      // either meant the shape could never be closed by someone clicking
      // deliberately.
      expect(service.finishesShape(area(), { x: 200, y: 200 }, 10, 1)).toBe(true);
      expect(service.finishesShape(area(), { x: 197, y: 204 }, 10, 1)).toBe(true);
    });

    it('adds a vertex for a click that is merely nearby', () => {
      expect(service.finishesShape(area(), { x: 240, y: 150 }, 10, 1)).toBe(false);
    });

    it('will not finish a shape with too few points to be anything', () => {
      // Two points enclose no area, so a repeat click has to keep building
      // rather than commit an empty measurement.
      const twoPoints = [{ x: 100, y: 100 }, { x: 200, y: 100 }];
      expect(service.finishesShape(area(twoPoints), { x: 200, y: 100 }, 10, 1)).toBe(false);
      expect(service.finishesShape(area(twoPoints), { x: 200, y: 100 }, 10, 2)).toBe(false);
    });

    it('leaves fixed-click-count tools alone', () => {
      // Radius and Calibrate complete on their own second click. Ending them
      // early here would cost the point that defines them.
      for (const tool of ['radius', 'calibrate'] as MarkupTool[]) {
        const shape = area([{ x: 100, y: 100 }], tool);
        expect(service.finishesShape(shape, { x: 100, y: 100 }, 10, 2)).toBe(false);
      }
    });

    it('ignores tools that are dragged rather than clicked', () => {
      const rect: ShapeData = { id: 'r1', tool: 'rect', pageNumber: 1, color: '#F00',
        strokeWidth: 2, opacity: 0, x: 100, y: 100, width: 50, height: 50 };
      expect(service.finishesShape(rect, { x: 100, y: 100 }, 10, 2)).toBe(false);
    });

    it('finishes nothing when no shape is being drawn', () => {
      expect(service.finishesShape(null, { x: 1, y: 1 }, 10, 2)).toBe(false);
    });
  });

  /**
   * The SVG overlay that goes on top of a page.
   *
   * <p>Untested until a stray HTML comment was pasted into the middle of the
   * opening `<svg>` tag and the whole suite stayed green. A string that is
   * built as markup and never parsed is a string nobody is checking, and this
   * one ends up printed and flattened into documents.
   */
  describe('shapesToSvgContent', () => {
    const rectangle: ShapeData = {
      id: 's1', tool: 'rect', pageNumber: 1, color: '#F00', strokeWidth: 2,
      opacity: 1, x: 10, y: 20, width: 30, height: 40,
    };

    /** Parses the output, failing the test if it is not well-formed XML. */
    function parsed(svg: string): Document {
      const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
      const failure = document.querySelector('parsererror');
      expect(failure?.textContent ?? '').toBe('');
      return document;
    }

    it('produces well-formed SVG', () => {
      const root = parsed(service.shapesToSvgContent([rectangle], 800, 600)).documentElement;

      expect(root.nodeName).toBe('svg');
    });

    it('is still well-formed with nothing to draw', () => {
      // An empty page is the common case, not an edge one.
      const root = parsed(service.shapesToSvgContent([], 800, 600)).documentElement;

      expect(root.nodeName).toBe('svg');
    });

    it('sizes the overlay to the page it covers', () => {
      // A mismatch here does not fail, it silently puts every annotation in
      // the wrong place.
      const root = parsed(service.shapesToSvgContent([rectangle], 800, 600)).documentElement;

      expect(root.getAttribute('width')).toBe('800');
      expect(root.getAttribute('height')).toBe('600');
      expect(root.getAttribute('viewBox')).toBe('0 0 800 600');
    });

    it('draws one element per shape', () => {
      const svg = service.shapesToSvgContent([rectangle, { ...rectangle, id: 's2' }], 800, 600);

      expect(parsed(svg).documentElement.children.length).toBe(2);
    });
  });

  describe('canFinish', () => {
    it('requires three points for an area and two for a line', () => {
      const at = (tool: MarkupTool, count: number): ShapeData => ({
        id: 'f1', tool, pageNumber: 1, color: '#F00', strokeWidth: 2, opacity: 0,
        points: Array.from({ length: count }, (_, i) => ({ x: i * 10, y: 0 }))
      });

      expect(service.canFinish(at('area', 2))).toBe(false);
      expect(service.canFinish(at('area', 3))).toBe(true);
      expect(service.canFinish(at('dimension', 1))).toBe(false);
      expect(service.canFinish(at('dimension', 2))).toBe(true);
    });

    it('is false for nothing being drawn, so Enter does nothing', () => {
      expect(service.canFinish(null)).toBe(false);
    });
  });
});

/**
 * The branches that decide whether a drawn shape is kept, and what the pointer
 * is over.
 *
 * <p>These are the two places where a wrong answer is silent. A shape that
 * fails the minimum-size check is discarded without a word — correct for the
 * stray click that produced a one-pixel rectangle, and wrong for a legitimate
 * mark the rule happens to exclude, because the reader draws it, sees nothing
 * appear, and concludes the tool is broken. Hit testing is the same in reverse:
 * a tolerance that is too tight means a line nobody can select, and one that
 * ignores a tool entirely means a shape that cannot be deleted once drawn.
 *
 * <p>So every tool is covered rather than a representative few. The switch arms
 * are what differ between tools, and a tool missing from one of them falls to a
 * default that is wrong for it in a way nothing else reveals.
 */
describe('deciding whether a drawn shape is worth keeping', () => {
  let engine: MarkupEngineService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [MarkupEngineService] });
    engine = TestBed.inject(MarkupEngineService);
  });

  const shape = (over: Partial<ShapeData>): ShapeData =>
    ({ tool: 'rect', pageNumber: 1, ...over }) as ShapeData;

  describe('a shape dragged out', () => {
    it('keeps a rectangle big enough to see', () => {
      expect(engine.hasMinimumSize(shape({ tool: 'rect', width: 40, height: 20 }))).toBe(true);
    });

    it('discards a rectangle that is only a click', () => {
      // A stray click on the rectangle tool leaves a 0x0 shape that renders as
      // nothing and sits in the annotation list for ever.
      expect(engine.hasMinimumSize(shape({ tool: 'rect', width: 0, height: 0 }))).toBe(false);
    });

    it('discards a rectangle with width but no height', () => {
      // A drag along one axis. Invisible either way, and both dimensions have to
      // be checked — one alone keeps a zero-area shape half the time.
      expect(engine.hasMinimumSize(shape({ tool: 'rect', width: 40, height: 1 }))).toBe(false);
    });

    it('discards a rectangle with height but no width', () => {
      expect(engine.hasMinimumSize(shape({ tool: 'rect', width: 1, height: 40 }))).toBe(false);
    });

    for (const tool of ['highlight', 'redact', 'formfield', 'ellipse',
                        'underline', 'strikeout', 'squiggly'] as MarkupTool[]) {
      it(`applies the same size rule to ${tool}`, () => {
        // They share one arm, so a tool left out of it falls to the default —
        // which returns true, keeping every accidental click as a shape.
        expect(engine.hasMinimumSize(shape({ tool, width: 40, height: 20 }))).toBe(true);
        expect(engine.hasMinimumSize(shape({ tool, width: 1, height: 1 }))).toBe(false);
      });
    }

    it('keeps a circle with a real radius', () => {
      expect(engine.hasMinimumSize(shape({ tool: 'circle', r: 20 }))).toBe(true);
    });

    it('discards a circle of no radius', () => {
      expect(engine.hasMinimumSize(shape({ tool: 'circle', r: 0 }))).toBe(false);
    });

    it('keeps a line long enough to see', () => {
      expect(engine.hasMinimumSize(shape({ tool: 'line', x1: 0, y1: 0, x2: 50, y2: 0 }))).toBe(true);
    });

    it('discards a line that goes nowhere', () => {
      expect(engine.hasMinimumSize(shape({ tool: 'line', x1: 10, y1: 10, x2: 11, y2: 10 }))).toBe(false);
    });

    it('measures a diagonal line by its length, not by either axis', () => {
      // 3-4-5: neither axis exceeds the threshold on its own at this scale, and
      // the line is plainly visible.
      expect(engine.hasMinimumSize(shape({ tool: 'line', x1: 0, y1: 0, x2: 3, y2: 4 }))).toBe(true);
    });

    it('applies the same rule to an arrow', () => {
      expect(engine.hasMinimumSize(shape({ tool: 'arrow', x1: 0, y1: 0, x2: 50, y2: 0 }))).toBe(true);
      expect(engine.hasMinimumSize(shape({ tool: 'arrow', x1: 0, y1: 0, x2: 1, y2: 0 }))).toBe(false);
    });

    it('a line with no coordinates at all is discarded rather than kept', () => {
      expect(engine.hasMinimumSize(shape({ tool: 'line' }))).toBe(false);
    });
  });

  describe('a shape built from points', () => {
    const withPoints = (tool: MarkupTool, count: number): ShapeData =>
      shape({ tool, points: Array.from({ length: count }, (_, i) => ({ x: i * 10, y: i * 10 })) });

    it('keeps freehand with a stroke in it', () => {
      expect(engine.hasMinimumSize(withPoints('freehand', 5))).toBe(true);
    });

    it('discards freehand that is two points, which is a click and a twitch', () => {
      expect(engine.hasMinimumSize(withPoints('freehand', 2))).toBe(false);
    });

    it('keeps a polygon of three points, which is the fewest that enclose anything', () => {
      expect(engine.hasMinimumSize(withPoints('polygon', 3))).toBe(true);
    });

    it('discards a polygon of two points, which is a line', () => {
      expect(engine.hasMinimumSize(withPoints('polygon', 2))).toBe(false);
    });

    it('keeps a polyline of two points, because it encloses nothing by design', () => {
      // The difference between the two: a polyline is open, so two points is a
      // whole shape. Sharing the polygon rule would discard every two-point
      // polyline the reader drew.
      expect(engine.hasMinimumSize(withPoints('polyline', 2))).toBe(true);
    });

    it('discards a polyline of one point', () => {
      expect(engine.hasMinimumSize(withPoints('polyline', 1))).toBe(false);
    });

    it('applies the polygon rule to a cloud', () => {
      expect(engine.hasMinimumSize(withPoints('cloud', 3))).toBe(true);
      expect(engine.hasMinimumSize(withPoints('cloud', 2))).toBe(false);
    });

    it('keeps a dimension once it has both ends', () => {
      expect(engine.hasMinimumSize(withPoints('dimension', 2))).toBe(true);
      expect(engine.hasMinimumSize(withPoints('dimension', 1))).toBe(false);
    });

    it('needs three points for an area, since two cannot enclose one', () => {
      expect(engine.hasMinimumSize(withPoints('area', 3))).toBe(true);
      expect(engine.hasMinimumSize(withPoints('area', 2))).toBe(false);
    });

    it('needs two points to calibrate, which is what a known distance is', () => {
      expect(engine.hasMinimumSize(withPoints('calibrate', 2))).toBe(true);
      expect(engine.hasMinimumSize(withPoints('calibrate', 1))).toBe(false);
    });

    it('needs two points for a radius', () => {
      expect(engine.hasMinimumSize(withPoints('radius', 2))).toBe(true);
      expect(engine.hasMinimumSize(withPoints('radius', 1))).toBe(false);
    });

    it('a points shape with no points is discarded rather than kept', () => {
      expect(engine.hasMinimumSize(shape({ tool: 'freehand' }))).toBe(false);
    });
  });

  describe('a shape with no size of its own', () => {
    it('is kept, because its content is what makes it worth keeping', () => {
      // A note or a stamp is placed rather than dragged. Applying a size rule to
      // one would discard every comment somebody typed.
      expect(engine.hasMinimumSize(shape({ tool: 'note', x: 10, y: 10 }))).toBe(true);
      expect(engine.hasMinimumSize(shape({ tool: 'stamp', x: 10, y: 10 }))).toBe(true);
    });
  });
});

describe('finding the shape under the pointer', () => {
  let engine: MarkupEngineService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [MarkupEngineService] });
    engine = TestBed.inject(MarkupEngineService);
  });

  const rect = (over: Partial<ShapeData> = {}): ShapeData =>
    ({ tool: 'rect', pageNumber: 1, x: 100, y: 100, width: 50, height: 40, ...over }) as ShapeData;

  it('finds a rectangle the pointer is inside', () => {
    expect(engine.hitTest([rect()], { x: 120, y: 120 })).not.toBeNull();
  });

  it('finds nothing where there is nothing', () => {
    expect(engine.hitTest([rect()], { x: 500, y: 500 })).toBeNull();
  });

  it('forgives a near miss, because a 1px target cannot be hit with a mouse', () => {
    // §1A.2 asks for targets of at least 24px; a drawn shape cannot be made
    // bigger, so the tolerance is what makes a thin one selectable at all.
    expect(engine.hitTest([rect()], { x: 96, y: 120 })).not.toBeNull();
  });

  it('does not forgive a miss well outside the tolerance', () => {
    expect(engine.hitTest([rect()], { x: 50, y: 120 })).toBeNull();
  });

  it('takes the topmost shape where two overlap', () => {
    // Shapes are drawn in order, so the last one is on top — selecting the one
    // underneath would be selecting something the reader cannot see.
    const under = rect({ id: 'under' } as Partial<ShapeData>);
    const over = rect({ id: 'over' } as Partial<ShapeData>);

    expect(engine.hitTest([under, over], { x: 120, y: 120 })).toBe(over);
  });

  it('finds a circle by its distance from the centre', () => {
    const circle = { tool: 'circle', pageNumber: 1, cx: 200, cy: 200, r: 30 } as ShapeData;

    expect(engine.hitTest([circle], { x: 215, y: 200 })).not.toBeNull();
    expect(engine.hitTest([circle], { x: 300, y: 200 })).toBeNull();
  });

  it('finds a line along its length rather than only at its ends', () => {
    // A bounding-box test would select a diagonal line from anywhere in the
    // rectangle it spans, which for a long one is most of the page.
    const line = { tool: 'line', pageNumber: 1, x1: 0, y1: 0, x2: 200, y2: 0 } as ShapeData;

    expect(engine.hitTest([line], { x: 100, y: 2 })).not.toBeNull();
  });

  it('does not find a line from across the box it spans', () => {
    const diagonal = { tool: 'line', pageNumber: 1, x1: 0, y1: 0, x2: 200, y2: 200 } as ShapeData;

    expect(engine.hitTest([diagonal], { x: 200, y: 0 })).toBeNull();
  });

  it('finds an arrow the same way as a line', () => {
    const arrow = { tool: 'arrow', pageNumber: 1, x1: 0, y1: 0, x2: 200, y2: 0 } as ShapeData;

    expect(engine.hitTest([arrow], { x: 100, y: 2 })).not.toBeNull();
  });

  for (const tool of ['highlight', 'formfield', 'ellipse',
                      'underline', 'strikeout', 'squiggly'] as MarkupTool[]) {
    it(`finds a ${tool} by its box`, () => {
      // Each shares the rectangle arm. One left out of it is a shape that can be
      // drawn and then never selected, so never deleted.
      expect(engine.hitTest([rect({ tool })], { x: 120, y: 120 })).not.toBeNull();
    });
  }

  it('finds nothing in an empty page', () => {
    expect(engine.hitTest([], { x: 10, y: 10 })).toBeNull();
  });

  it('respects a tolerance given explicitly', () => {
    expect(engine.hitTest([rect()], { x: 80, y: 120 }, 2)).toBeNull();
    expect(engine.hitTest([rect()], { x: 80, y: 120 }, 30)).not.toBeNull();
  });

  it('a shape with no coordinates is not treated as covering the origin', () => {
    // Defaulting a missing x to 0 makes an incomplete shape a 0x0 box at the
    // corner, which would then swallow clicks there.
    const incomplete = { tool: 'rect', pageNumber: 1 } as ShapeData;

    expect(engine.hitTest([incomplete], { x: 300, y: 300 })).toBeNull();
  });
});

describe('reading shapes back from stored markup', () => {
  let engine: MarkupEngineService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [MarkupEngineService] });
    engine = TestBed.inject(MarkupEngineService);
  });

  it('reads back what it wrote', () => {
    const shapes = [{ tool: 'rect', pageNumber: 1, x: 1, y: 2, width: 3, height: 4 }] as ShapeData[];

    expect(engine.parseShapesJson(engine.shapesToJson(shapes))).toEqual(shapes);
  });

  it('accepts a bare array, which is what earlier versions stored', () => {
    // Markup saved before the envelope existed is still on documents, and
    // refusing it would lose every annotation on them.
    expect(engine.parseShapesJson('[{"tool":"rect","pageNumber":1}]')).toHaveLength(1);
  });

  it('returns nothing for markup that is not readable', () => {
    // A truncated column, or a column holding something else entirely. Throwing
    // here would take down the viewer rather than losing the overlay.
    expect(engine.parseShapesJson('{ not json')).toEqual([]);
  });

  it('returns nothing for an envelope whose shapes are not a list', () => {
    expect(engine.parseShapesJson('{"shapes":"all of them"}')).toEqual([]);
  });

  it('returns nothing for valid JSON that is not markup at all', () => {
    expect(engine.parseShapesJson('42')).toEqual([]);
  });

  it('returns nothing for an empty column', () => {
    expect(engine.parseShapesJson('')).toEqual([]);
  });

  it('writes a version into the envelope, so a later reader can tell what it has', () => {
    expect(JSON.parse(engine.shapesToJson([]))).toMatchObject({ version: '1.0' });
  });
});
