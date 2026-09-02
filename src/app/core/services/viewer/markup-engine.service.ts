import { Injectable } from '@angular/core';
import { ShapeData, MarkupTool } from './viewer-state.service';

export interface PointerPoint { x: number; y: number; }

/** Measurements are drawn in a fixed palette so they stay distinct from markup. */
const MEASURE_COLOUR      = '#34d399';
const MEASURE_COLOUR_DIM  = '#6ee7b7';
const MEASURE_FILL        = 'rgba(52,211,153,0.10)';
const CALIBRATION_COLOUR  = '#fbbf24';

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

    const fixed = this.requiredVertices(tool);
    return fixed
      ? `click ${fixed} points`
      : 'click each point — press Enter, or click the first point again, to finish';
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
  shapeToSvg(s: ShapeData, zoom = 1): string {
    const stroke = s.color;
    const sw     = s.strokeWidth;
    const fill   = `${s.color}${Math.round((s.opacity || 0) * 255).toString(16).padStart(2,'0')}`;

    switch (s.tool) {
      case 'line':
        return `<line data-id="${s.id}" x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`;

      case 'arrow': {
        const dx = (s.x2||0) - (s.x1||0), dy = (s.y2||0) - (s.y1||0);
        const len = Math.sqrt(dx*dx+dy*dy) || 1;
        const ux = dx/len, uy = dy/len;
        const hs = sw * 4;
        const ax = (s.x2||0) - ux*hs, ay = (s.y2||0) - uy*hs;
        const px = -uy*hs*0.5, py = ux*hs*0.5;
        return `<g data-id="${s.id}" stroke="${stroke}" fill="${stroke}">
          <line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke-width="${sw}" stroke-linecap="round"/>
          <polygon points="${s.x2},${s.y2} ${ax+px},${ay+py} ${ax-px},${ay-py}"/>
        </g>`;
      }

      case 'rect':
        return `<rect data-id="${s.id}" x="${s.x}" y="${s.y}" width="${s.width||0}" height="${s.height||0}" stroke="${stroke}" stroke-width="${sw}" fill="${fill}" rx="2"/>`;

      case 'highlight':
        return `<rect data-id="${s.id}" x="${s.x}" y="${s.y}" width="${s.width||0}" height="${s.height||2}" fill="#FFFF0066" stroke="none"/>`;

      case 'redact':
        // Live drag preview only — committed regions render separately in
        // PDF-point space (see ViewerStateService.redactionRegions).
        return `<rect data-id="${s.id}" x="${s.x}" y="${s.y}" width="${s.width||0}" height="${s.height||0}" fill="#000000" stroke="#000000"/>`;

      case 'formfield':
        // Live drag preview only — placed drafts render separately in
        // PDF-point space (see ViewerStateService.formFieldDrafts).
        return `<rect data-id="${s.id}" x="${s.x}" y="${s.y}" width="${s.width||0}" height="${s.height||0}" fill="#3b82f622" stroke="#3b82f6" stroke-width="1.5" stroke-dasharray="4 3" rx="2"/>`;

      case 'circle':
        return `<circle data-id="${s.id}" cx="${s.cx}" cy="${s.cy}" r="${s.r||0}" stroke="${stroke}" stroke-width="${sw}" fill="${fill}"/>`;

      case 'ellipse': {
        const rx = (s.width||0)/2, ry = (s.height||0)/2;
        return `<ellipse data-id="${s.id}" cx="${(s.x||0)+rx}" cy="${(s.y||0)+ry}" rx="${rx}" ry="${ry}" stroke="${stroke}" stroke-width="${sw}" fill="${fill}"/>`;
      }

      // Text-markup tools: drag a box over the target text region.
      case 'underline':
        return `<line data-id="${s.id}" x1="${s.x}" y1="${(s.y||0)+(s.height||0)}" x2="${(s.x||0)+(s.width||0)}" y2="${(s.y||0)+(s.height||0)}" stroke="${stroke}" stroke-width="${Math.max(sw,2)}"/>`;

      case 'strikeout':
        return `<line data-id="${s.id}" x1="${s.x}" y1="${(s.y||0)+(s.height||0)/2}" x2="${(s.x||0)+(s.width||0)}" y2="${(s.y||0)+(s.height||0)/2}" stroke="${stroke}" stroke-width="${Math.max(sw,2)}"/>`;

      case 'squiggly': {
        const x0 = s.x||0, yBase = (s.y||0)+(s.height||0), w = s.width||0;
        const period = 6, amp = 2;
        let d = `M${x0},${yBase}`;
        for (let px = 0; px <= w; px += period) {
          d += ` Q${x0+px+period/2},${yBase + (Math.floor(px/period)%2===0 ? -amp : amp)} ${x0+px+period},${yBase}`;
        }
        return `<path data-id="${s.id}" d="${d}" stroke="${stroke}" stroke-width="${Math.max(sw,1.5)}" fill="none"/>`;
      }

      case 'note':
        return `<g data-id="${s.id}">
          <rect x="${(s.x||0)-9}" y="${(s.y||0)-9}" width="18" height="18" rx="3" fill="#FFD54A" stroke="${stroke}" stroke-width="1.5"/>
          <text x="${s.x}" y="${(s.y||0)+4}" text-anchor="middle" font-size="12">📝</text>
          <title>${this.escapeXml(s.text||'')}</title>
        </g>`;

      case 'polygon': {
        const pts = s.points || [];
        if (pts.length < 2) return '';
        const d = pts.map((p,i) => `${i===0?'M':'L'}${p.x},${p.y}`).join(' ') + ' Z';
        return `<path data-id="${s.id}" d="${d}" stroke="${stroke}" stroke-width="${sw}" fill="${fill}" stroke-linejoin="round"/>`;
      }

      case 'polyline': {
        const pts = s.points || [];
        if (pts.length < 2) return '';
        const d = pts.map((p,i) => `${i===0?'M':'L'}${p.x},${p.y}`).join(' ');
        return `<path data-id="${s.id}" d="${d}" stroke="${stroke}" stroke-width="${sw}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
      }

      case 'freehand': {
        const pts = s.points || [];
        if (pts.length < 2) return '';
        const d = pts.map((p,i) => `${i===0?'M':'L'}${p.x},${p.y}`).join(' ');
        return `<path data-id="${s.id}" d="${d}" stroke="${stroke}" stroke-width="${sw}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
      }

      case 'cloud': {
        const pts = s.points || [];
        if (pts.length < 2) return '';
        // Simplified cloud: polyline with arc bumps
        const d = pts.map((p,i) => `${i===0?'M':'L'}${p.x},${p.y}`).join(' ') + 'Z';
        return `<path data-id="${s.id}" d="${d}" stroke="${stroke}" stroke-width="${sw}" fill="${fill}" stroke-dasharray="8 4"/>`;
      }

      case 'text':
      case 'stamp':
        return `<g data-id="${s.id}">
          <rect x="${(s.x||0)-2}" y="${(s.y||0)-14}" width="${((s.text||'').length*7+10)||60}" height="18" fill="rgba(255,255,255,0.85)" rx="2"/>
          <text x="${s.x}" y="${s.y}" fill="${stroke}" font-size="13" font-family="Arial,sans-serif" font-weight="${s.tool==='stamp'?'bold':'normal'}">${this.escapeXml(s.text||'')}</text>
        </g>`;


      case 'callout': {
        const tx = s.x2 ?? (s.x||0)+80, ty = s.y2 ?? (s.y||0)-40;
        const txt = this.escapeXml(s.text||'');
        const boxW = Math.max(txt.length * 7 + 16, 80), boxH = 22;
        return `<g data-id="${s.id}">
          <line x1="${s.x}" y1="${s.y}" x2="${tx}" y2="${ty+boxH/2}" stroke="${stroke}" stroke-width="${sw}"/>
          <rect x="${tx}" y="${ty}" width="${boxW}" height="${boxH}" rx="3"
            fill="rgba(255,255,255,0.92)" stroke="${stroke}" stroke-width="${sw}"/>
          <text x="${tx+8}" y="${ty+15}" fill="${stroke}" font-size="12" font-family="Arial">${txt}</text>
          <circle cx="${s.x}" cy="${s.y}" r="3" fill="${stroke}"/>
        </g>`;
      }

      // ── Measurement tools ────────────────────────────────────
      // Rendered in their own colour rather than the markup stroke colour:
      // a measurement is a readout, not an annotation, and needs to stay
      // legible over whatever markup is already on the drawing.
      case 'dimension': case 'calibrate': {
        const pts = s.points || [];
        if (pts.length < 2) return '';
        const colour = s.tool === 'calibrate' ? CALIBRATION_COLOUR : MEASURE_COLOUR;
        const path   = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
        // `pts.length >= 2` above guarantees this, but TypeScript does not
        // narrow an array's length, so the guarantee is restated here rather
        // than asserted away with a `!`.
        const last   = pts[pts.length - 1];
        if (!last) return '';
        const segments = pts.slice(1).map((p, i) => {
          // pts[i] is the vertex before p, because the map runs over
          // pts.slice(1). Guarded rather than asserted: the invariant is real
          // but it lives in the slice above, and an edit there would break it
          // silently.
          const prev = pts[i];
          if (!prev) return '';
          return this.measureLabel((prev.x + p.x) / 2, (prev.y + p.y) / 2 - 8,
            s.segmentLabels?.[i] ?? '', colour, 10);
        }).join('');
        return `<g data-id="${s.id}">
          <path d="${path}" stroke="${colour}" stroke-width="2" fill="none"/>
          ${pts.map(p => this.measureDot(p, colour)).join('')}
          ${segments}
          ${s.measurement ? this.measureLabel(last.x + 6, last.y, '∑ ' + s.measurement, colour, 12) : ''}
        </g>`;
      }

      case 'area': {
        const pts = s.points || [];
        if (pts.length < 2) return '';
        const centroidX = pts.reduce((sum, p) => sum + p.x, 0) / pts.length;
        const centroidY = pts.reduce((sum, p) => sum + p.y, 0) / pts.length;
        return `<g data-id="${s.id}">
          <polygon points="${pts.map(p => `${p.x},${p.y}`).join(' ')}"
                   stroke="${MEASURE_COLOUR}" stroke-width="2" fill="${MEASURE_FILL}"/>
          ${pts.map(p => this.measureDot(p, MEASURE_COLOUR)).join('')}
          ${s.measurement ? this.measureLabel(centroidX, centroidY - 5, s.measurement, MEASURE_COLOUR, 13) : ''}
          ${s.measurementDetail ? this.measureLabel(centroidX, centroidY + 12, 'P: ' + s.measurementDetail, MEASURE_COLOUR_DIM, 10) : ''}
        </g>`;
      }

      case 'radius': {
        const pts = s.points || [];
        if (pts.length < 2) return '';
        const [centre, edge] = pts;
        if (!centre || !edge) return '';
        const r = Math.hypot(edge.x - centre.x, edge.y - centre.y);
        return `<g data-id="${s.id}">
          <circle cx="${centre.x}" cy="${centre.y}" r="${r}"
                  stroke="${MEASURE_COLOUR}" stroke-width="2" fill="${MEASURE_FILL}"/>
          <line x1="${centre.x}" y1="${centre.y}" x2="${edge.x}" y2="${edge.y}"
                stroke="${MEASURE_COLOUR}" stroke-width="1.5" stroke-dasharray="4,3"/>
          ${this.measureDot(centre, MEASURE_COLOUR)}
          ${s.measurement ? this.measureLabel((centre.x + edge.x) / 2, (centre.y + edge.y) / 2 - 8, 'r = ' + s.measurement, MEASURE_COLOUR, 12) : ''}
          ${s.measurementDetail ? this.measureLabel(centre.x, centre.y + r + 18, 'ø ' + s.measurementDetail, MEASURE_COLOUR_DIM, 11) : ''}
        </g>`;
      }

      default: return '';
    }
  }

  // ── Render all shapes for a page to an SVG string ───────────
  shapesToSvgContent(shapes: ShapeData[], width: number, height: number): string {
    const svgShapes = shapes.map(s => this.shapeToSvg(s)).join('\n');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"
      style="position:absolute;top:0;left:0;pointer-events:none;overflow:visible">
      ${svgShapes}
    </svg>`;
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

  /** Vertex marker on a measurement. */
  private measureDot(pt: PointerPoint, colour: string): string {
    return `<circle cx="${pt.x}" cy="${pt.y}" r="4" fill="${colour}" stroke="#fff" stroke-width="1"/>`;
  }

  /**
   * Readout with an opaque backing plate — a measurement drawn straight onto
   * a busy drawing is frequently unreadable without one.
   */
  private measureLabel(x: number, y: number, text: string, colour: string, size: number): string {
    if (!text) return '';
    const safe  = this.escapeXml(text);
    const width = safe.length * size * 0.58 + 8;
    return `<g>
      <rect x="${x - 2}" y="${y - size}" width="${width}" height="${size + 4}" rx="3" fill="rgba(10,12,20,0.85)"/>
      <text x="${x + 2}" y="${y}" font-size="${size}" fill="${colour}"
            font-family="monospace" font-weight="bold">${safe}</text>
    </g>`;
  }

  private escapeXml(s: string): string {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
}
