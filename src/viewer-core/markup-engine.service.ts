import { Injectable } from '@angular/core';
import { ShapeData, MarkupTool } from './viewer-state.service';
import { SvgPrimitive, shapeToPrimitives } from './svg-primitives';
import { shapeToSvg, shapesToSvgContent } from './markup-svg';
import { hitTest } from './markup-hit-test';
import {
  canFinish, completionHint, finishesShape, isClickPlacedTextTool, isTextTool,
  isVertexTool, minimumVertices, requiredVertices,
} from './markup-tool-kinds';
import {
  PointerPoint, MEASURE_COLOUR, MEASURE_COLOUR_DIM, MEASURE_FILL, CALIBRATION_COLOUR,
} from './markup-palette';

// Re-exported because every caller already imports it from here.
export type { PointerPoint };

export type { SvgPrimitive } from './svg-primitives';

/**
 * The drawing surface's one way in: a pointer position becomes a shape, a
 * shape becomes SVG, and a click finds what is under it.
 *
 * <p>Components call this service — no direct DOM measurement or geometry in a
 * component.
 *
 * <p>Much of it is implemented in the small modules beside this file —
 * `svg-primitives.ts` and `markup-svg.ts` for rendering, `markup-tool-kinds.ts`
 * for what a tool is and when a click-built shape is done, `markup-hit-test.ts`
 * for picking — and reached through the methods here so no caller has to know
 * which. That split is what keeps this file inside §3.3's 400-line limit, which
 * it had quietly gone over.
 */
@Injectable({ providedIn: 'root' })
export class MarkupEngineService {

  // ── Generate a unique shape ID ───────────────────────────────
  newId(): string {
    return `s-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
  }

  // ── Convert pointer/touch event to SVG coordinates ──────────
  getSvgPoint(
    event: MouseEvent | TouchEvent,
    svgEl: SVGSVGElement
  ): PointerPoint {
    const rect = svgEl.getBoundingClientRect();
    // touches is empty on touchend, and changedTouches is empty on a
    // touchcancel the browser synthesises when a gesture is interrupted — by
    // an incoming call, or the app being backgrounded mid-stroke. Reading [0]
    // unconditionally threw there; falling back to the origin ends the stroke
    // harmlessly instead.
    const touch = event instanceof TouchEvent
      ? event.touches[0] ?? event.changedTouches[0]
      : null;
    const clientX = event instanceof TouchEvent
      ? touch?.clientX ?? 0
      : event.clientX;
    const clientY = event instanceof TouchEvent
      ? touch?.clientY ?? 0
      : event.clientY;
    return {
      x: (clientX - rect.left) / (rect.width  / (svgEl.viewBox.baseVal.width  || rect.width)),
      y: (clientY - rect.top)  / (rect.height / (svgEl.viewBox.baseVal.height || rect.height))
    };
  }

  /**
   * The middle of a surface, in the same coordinates {@link getSvgPoint}
   * returns.
   *
   * <p>Where a keyboard-placed shape starts. The centre rather than the origin
   * because a shape at the top-left corner is half outside the page on a
   * drawing whose viewBox does not start at zero, and because the centre is
   * the part of the sheet a reader is most likely to be looking at.
   *
   * <p>Falls back to the element's own box when there is no viewBox, exactly
   * as `getSvgPoint` does, so the two agree about where the middle is.
   */
  centreOf(svgEl: SVGSVGElement): PointerPoint {
    const box = svgEl.viewBox.baseVal;
    if (box && (box.width || box.height)) {
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    }
    const rect = svgEl.getBoundingClientRect();
    return { x: rect.width / 2, y: rect.height / 2 };
  }

  /**
   * How far one arrow-key press moves the keyboard cursor, in surface units.
   *
   * <p>Two steps rather than one: a single fine step makes crossing a sheet
   * take hundreds of presses, and a single coarse step cannot place anything
   * precisely. Shift is the conventional modifier for the larger of the two.
   */
  keyboardStep(coarse: boolean): number {
    return coarse ? 20 : 2;
  }

  /**
   * The radius, in an SVG's own user units, that covers `screenPixels` on
   * screen.
   *
   * Needed because "within ten pixels of that vertex" is a statement about
   * what the eye and hand can do, while shape coordinates are in whatever
   * space the SVG declares. A CAD drawing's viewBox is its own model units —
   * often tens of thousands across — so a fixed ten there is a small fraction
   * of a pixel and a click can never land inside it. Reading the element's own
   * screen transform covers viewBox scale, zoom and any enclosing transform in
   * one step.
   */
  toleranceInUserUnits(svg: SVGSVGElement, screenPixels = 10): number {
    const ctm = svg.getScreenCTM();
    if (!ctm) return screenPixels;

    const scale = Math.hypot(ctm.a, ctm.b);
    return scale > 0 ? screenPixels / scale : screenPixels;
  }

  // ── Build a partial ShapeData from a start point ─────────────
  startShape(
    tool:        MarkupTool,
    pt:          PointerPoint,
    pageNumber:  number,
    color:       string,
    strokeWidth: number,
    opacity:     number,
    author?:     string
  ): ShapeData {
    const base: ShapeData = {
      id: this.newId(), tool, pageNumber,
      color, strokeWidth, opacity,
      author, createdAt: new Date().toISOString()
    };
    switch (tool) {
      case 'line': case 'arrow':
        return { ...base, x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y };
      case 'rect': case 'highlight': case 'redact': case 'formfield': case 'ellipse':
      case 'underline': case 'strikeout': case 'squiggly':
        return { ...base, x: pt.x, y: pt.y, width: 0, height: 0 };
      case 'circle':
        return { ...base, cx: pt.x, cy: pt.y, r: 0 };
      case 'freehand': case 'cloud': case 'polygon': case 'polyline':
      case 'dimension': case 'area': case 'calibrate':
        return { ...base, points: [pt] };
      case 'radius':
        // Centre first, edge second — the radius is the gap between them.
        return { ...base, points: [pt] };
      case 'text':
      case 'callout':
        return { ...base, x: pt.x, y: pt.y, text: '', x1: pt.x, y1: pt.y, x2: pt.x + 80, y2: pt.y - 40 };
      case 'stamp':
        return { ...base, x: pt.x, y: pt.y, text: 'REVIEWED' };
      case 'note':
        return { ...base, x: pt.x, y: pt.y, text: '' };
      default:
        return { ...base, x: pt.x, y: pt.y };
    }
  }

  // ── Update shape as pointer moves (drag-driven tools only —
  //    'polygon'/'polyline' are click-driven, see addVertex()) ─────
  updateShape(shape: ShapeData, pt: PointerPoint): ShapeData {
    switch (shape.tool) {
      case 'line': case 'arrow':
        return { ...shape, x2: pt.x, y2: pt.y };
      case 'rect': case 'highlight': case 'redact': case 'formfield': case 'ellipse':
      case 'underline': case 'strikeout': case 'squiggly':
        return {
          ...shape,
          x:      Math.min(shape.x!, pt.x),
          y:      Math.min(shape.y!, pt.y),
          width:  Math.abs(pt.x - shape.x!),
          height: Math.abs(pt.y - shape.y!)
        };
      case 'circle': {
        const dx = pt.x - shape.cx!, dy = pt.y - shape.cy!;
        return { ...shape, r: Math.sqrt(dx*dx + dy*dy) };
      }
      case 'freehand': case 'cloud':
        return { ...shape, points: [...(shape.points || []), pt] };
      case 'callout':
        // A callout has two positions: the anchor, which marks the feature
        // being annotated and stays where the pointer went down, and the label
        // box, which `x2`/`y2` carry. The drag places the label — pressing on a
        // crowded detail and pulling its label into clear space is the whole
        // gesture, and it is why this tool is the one text tool that drags.
        return { ...shape, x2: pt.x, y2: pt.y };
      default:
        return shape;
    }
  }

  // ── Click-driven vertex tools (polygon/polyline) ─────────────
  // Each click appends exactly one vertex (unlike freehand/cloud, which
  // append a point per mousemove while dragging). A double-click finishes
  // the shape — see removeLastVertex() for stripping the duplicate vertex
  // a dblclick's second mousedown produces.
  addVertex(shape: ShapeData, pt: PointerPoint): ShapeData {
    return { ...shape, points: [...(shape.points || []), pt] };
  }

  removeLastVertex(shape: ShapeData): ShapeData {
    return { ...shape, points: (shape.points || []).slice(0, -1) };
  }

  /**
   * Preview-only: appends a non-committed cursor point so the in-progress
   * polygon or polyline rubber-bands to the pointer between clicks.
   *
   * <p>This comment sat above {@link isVertexTool} for several commits, which
   * is the ordinary fate of a comment that is not next to what it describes.
   */
  withPreviewPoint(shape: ShapeData, pt: PointerPoint | null): ShapeData {
    if (!pt || !isVertexTool(shape.tool)) return shape;
    return { ...shape, points: [...(shape.points || []), pt] };
  }

  // ── What kind of tool this is — see `markup-tool-kinds.ts` ────
  /** Tools built by clicking vertices rather than dragging. */
  isVertexTool(tool: MarkupTool): boolean {
    return isVertexTool(tool);
  }

  /** Tools whose shape carries words, which have to be asked for. */
  isTextTool(tool: MarkupTool): boolean {
    return isTextTool(tool);
  }

  /** Text tools placed by one click — every one except `callout`. */
  isClickPlacedTextTool(tool: MarkupTool): boolean {
    return isClickPlacedTextTool(tool);
  }

  /** Vertex tools that end on a fixed click count rather than a double-click. */
  requiredVertices(tool: MarkupTool): number | null {
    return requiredVertices(tool);
  }

  /** The fewest vertices a shape needs before it can be closed. */
  minimumVertices(tool: MarkupTool): number {
    return minimumVertices(tool);
  }

  /** How a tool is completed, for the toolbar to show. */
  completionHint(tool: MarkupTool): string {
    return completionHint(tool);
  }

  /** Whether a click ends the shape rather than adding another vertex. */
  finishesShape(
    shape: ShapeData | null,
    pt: PointerPoint,
    tolerance: number,
    clickDetail = 1
  ): boolean {
    return finishesShape(shape, pt, tolerance, clickDetail);
  }

  /** True when a click-built shape holds enough vertices to be committed. */
  canFinish(shape: ShapeData | null): boolean {
    return canFinish(shape);
  }

  // ── Render a ShapeData to SVG element string ─────────────────
  /** A shape as drawable SVG primitives — see `svg-primitives.ts`. */
  shapeToPrimitives(shape: ShapeData): SvgPrimitive[] {
    return shapeToPrimitives(shape);
  }

  /** A shape as an SVG element string — see `markup-svg.ts`. */
  shapeToSvg(shape: ShapeData, zoom = 1): string {
    return shapeToSvg(shape, zoom);
  }

  /** Every shape on a page as one SVG overlay — see `markup-svg.ts`. */
  shapesToSvgContent(shapes: ShapeData[], width: number, height: number): string {
    return shapesToSvgContent(shapes, width, height);
  }

  // ── Minimum-size check before committing a drawn shape ────────
  hasMinimumSize(s: ShapeData): boolean {
    const MIN = 3;
    switch (s.tool) {
      case 'line': case 'arrow':
        return Math.hypot((s.x2||0)-(s.x1||0), (s.y2||0)-(s.y1||0)) > MIN;
      case 'dimension': case 'area': case 'calibrate':
        return (s.points?.length || 0) >= (s.tool === 'area' ? 3 : 2);
      case 'radius':
        return (s.points?.length || 0) >= 2;
      case 'rect': case 'highlight': case 'redact': case 'formfield': case 'ellipse':
      case 'underline': case 'strikeout': case 'squiggly':
        return (s.width||0) > MIN && (s.height||0) > MIN;
      case 'circle':
        return (s.r||0) > MIN;
      case 'freehand': case 'cloud': case 'polygon':
        return (s.points?.length || 0) > 2;
      case 'polyline':
        return (s.points?.length || 0) > 1;
      default:
        return true;
    }
  }

  /** The topmost committed shape under a point — see `markup-hit-test.ts`. */
  hitTest(shapes: ShapeData[], pt: PointerPoint, tolerance = 8): ShapeData | null {
    return hitTest(shapes, pt, tolerance);
  }

  // ── Serialise shapes to XFDF-compatible JSON ─────────────────
  shapesToJson(shapes: ShapeData[]): string {
    return JSON.stringify({ shapes, version: '1.0', format: 'cde-xfdf-json' });
  }

  parseShapesJson(json: string): ShapeData[] {
    try {
      const parsed = JSON.parse(json);
      if (parsed.shapes && Array.isArray(parsed.shapes)) return parsed.shapes;
      if (Array.isArray(parsed)) return parsed;
    } catch { /* ignore */ }
    return [];
  }

}
