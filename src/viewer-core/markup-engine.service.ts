import { Injectable } from '@angular/core';
import { ShapeData, MarkupTool } from './viewer-state.service';
import { SvgPrimitive, shapeToPrimitives } from './svg-primitives';
import { shapeToSvg, shapesToSvgContent } from './markup-svg';
import {
  PointerPoint, MEASURE_COLOUR, MEASURE_COLOUR_DIM, MEASURE_FILL, CALIBRATION_COLOUR,
} from './markup-palette';

// Re-exported because every caller already imports it from here.
export type { PointerPoint };

export type { SvgPrimitive } from './svg-primitives';

/**
 * MarkupEngineService
 * Handles all drawing logic: pointer events (mouse + touch),
 * shape creation, SVG rendering, hit testing.
 * Components call this service — no direct DOM manipulation in components.
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

  // Preview-only: appends a non-committed cursor point so the in-progress
  // polygon/polyline rubber-bands to the pointer between clicks.
  /** Tools built by clicking vertices rather than dragging. */
  private static readonly VERTEX_TOOLS: MarkupTool[] =
    ['polygon', 'polyline', 'dimension', 'area', 'radius', 'calibrate'];

  isVertexTool(tool: MarkupTool): boolean {
    return MarkupEngineService.VERTEX_TOOLS.includes(tool);
  }

  /**
   * Tools whose shape carries a `text` field, and which therefore have to ask
   * the user for that text before the shape is worth adding.
   *
   * <p>This lives here rather than in the viewers because both of them need
   * the same answer, and when the list was written out in each of them they
   * disagreed: `callout` was in {@link startShape} and in {@link shapeToSvg}
   * but in neither viewer's copy, so placing one produced an empty box that
   * could not be typed into and could not be removed except by undo. A tool
   * added to one list and not the other fails exactly that way — silently,
   * and only when someone reaches for it.
   */
  private static readonly TEXT_TOOLS: MarkupTool[] =
    ['text', 'stamp', 'note', 'callout'];

  isTextTool(tool: MarkupTool): boolean {
    return MarkupEngineService.TEXT_TOOLS.includes(tool);
  }

  /** Vertex tools that end on a fixed click count rather than a double-click. */
  requiredVertices(tool: MarkupTool): number | null {
    return tool === 'radius' ? 2 : tool === 'calibrate' ? 2 : null;
  }

  /**
   * How a tool is completed, for the toolbar to show.
   *
   * Lives here rather than in the toolbar because it is a property of how the
   * tool is drawn, not of how it is presented. The toolbar previously carried
   * its own list naming only polygon and polyline, which left Area, Length and
   * Radius with no indication that a shape has to be closed at all — and an
   * unfinished shape simply never produces a reading, so the tool looks broken
   * rather than unfinished.
   *
   * @returns an empty string for tools that are drawn by dragging.
   */
  completionHint(tool: MarkupTool): string {
    if (!this.isVertexTool(tool)) return '';

    // Returned as a finished sentence rather than a fragment the caller
    // capitalises. Upper-casing the first character in the caller works in
    // English and is wrong wherever casing rules differ, and it leaves the
    // translator a fragment with no way to know how it will be presented.
    const fixed = this.requiredVertices(tool);
    return fixed
      ? $localize`:Tells the user how to finish a shape that ends after a set number of clicks@@markupHint.fixedVertices:Click ${fixed}:count: points`
      : $localize`:Tells the user how to finish a shape with any number of points. Enter is the keyboard key.@@markupHint.anyVertices:Click each point — press Enter, or click the first point again, to finish`;
  }

  /**
   * The fewest vertices a shape needs before it can be closed. Below this the
   * shape has no area or no length, so finishing it would commit nothing.
   */
  minimumVertices(tool: MarkupTool): number {
    return tool === 'area' || tool === 'polygon' ? 3 : 2;
  }

  /**
   * Whether a click ends the shape rather than adding another vertex to it.
   *
   * Double-click alone was the only way to finish, and it is not a gesture
   * software can rely on. The browser reports one only when two presses fall
   * inside its own window of roughly half a second and a few pixels; outside
   * that they arrive as two ordinary clicks with nothing marking them as a
   * pair. Someone placing a point deliberately — the normal way to work on a
   * drawing — falls outside it constantly, so the shape gained vertices
   * instead of closing and could not be finished however many times it was
   * tried.
   *
   * A click therefore ends the shape when any of these hold, none of which
   * depend on that window:
   *
   *  - the browser did recognise a double-click (`clickDetail >= 2`);
   *  - the click lands on the first vertex, the standard gesture for closing
   *    an outline;
   *  - the click lands on the vertex just placed, which is what a slow
   *    double-click amounts to — and a repeated vertex in the same spot was
   *    never worth anything anyway.
   *
   * Tools with a fixed click count complete themselves and are left alone.
   *
   * @param tolerance radius in the shape's own coordinate space, so the target
   *                  stays the same apparent size at any zoom level.
   * @param clickDetail `MouseEvent.detail` — 1 for a single press, 2 or more
   *                    for the later presses of a rapid sequence.
   */
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

  finishesShape(
    shape: ShapeData | null,
    pt: PointerPoint,
    tolerance: number,
    clickDetail = 1
  ): boolean {
    if (!this.canFinish(shape)) return false;
    if (this.requiredVertices(shape!.tool) !== null) return false;

    const points = shape!.points ?? [];
    const near = (v: PointerPoint | undefined) =>
      v !== undefined && Math.hypot(pt.x - v.x, pt.y - v.y) <= tolerance;

    // A shape with no vertices is not near anything, which `near` now says
    // rather than throwing.
    return clickDetail >= 2 || near(points[0]) || near(points[points.length - 1]);
  }

  /** True when a click-built shape holds enough vertices to be committed. */
  canFinish(shape: ShapeData | null): boolean {
    if (!shape || !this.isVertexTool(shape.tool)) return false;
    return (shape.points?.length ?? 0) >= this.minimumVertices(shape.tool);
  }


  withPreviewPoint(shape: ShapeData, pt: PointerPoint | null): ShapeData {
    if (!pt || !this.isVertexTool(shape.tool)) return shape;
    return { ...shape, points: [...(shape.points || []), pt] };
  }

  // ── Render a ShapeData to SVG element string ─────────────────
  /**
   * A shape as drawable SVG primitives — see `svg-primitives.ts`.
   *
   * Delegated rather than implemented here so this file stays near §3.3's
   * 400-line limit, which it is already over.
   */
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

  // ── Hit test: find shape at pointer position ─────────────────
  hitTest(shapes: ShapeData[], pt: PointerPoint, tolerance = 8): ShapeData | null {
    for (let i = shapes.length - 1; i >= 0; i--) {
      // Bound once rather than indexed twice: it removes the second access the
      // compiler cannot prove safe, and it reads better.
      const shape = shapes[i];
      if (shape && this.shapeContains(shape, pt, tolerance)) return shape;
    }
    return null;
  }

  private shapeContains(s: ShapeData, pt: PointerPoint, tol: number): boolean {
    switch (s.tool) {
      case 'rect': case 'highlight': case 'formfield': case 'ellipse':
      case 'underline': case 'strikeout': case 'squiggly':
        return pt.x >= (s.x||0)-tol && pt.x <= (s.x||0)+(s.width||0)+tol &&
               pt.y >= (s.y||0)-tol && pt.y <= (s.y||0)+(s.height||0)+tol;
      case 'circle':
        return Math.hypot(pt.x-(s.cx||0), pt.y-(s.cy||0)) <= (s.r||0)+tol;
      case 'line': case 'arrow':
        return this.distToSegment(pt, {x:s.x1||0,y:s.y1||0}, {x:s.x2||0,y:s.y2||0}) <= tol;
      default: return false;
    }
  }

  private distToSegment(p: PointerPoint, a: PointerPoint, b: PointerPoint): number {
    const dx = b.x-a.x, dy = b.y-a.y;
    const len2 = dx*dx+dy*dy;
    if (len2 === 0) return Math.hypot(p.x-a.x, p.y-a.y);
    const t = Math.max(0, Math.min(1, ((p.x-a.x)*dx+(p.y-a.y)*dy)/len2));
    return Math.hypot(p.x-(a.x+t*dx), p.y-(a.y+t*dy));
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
