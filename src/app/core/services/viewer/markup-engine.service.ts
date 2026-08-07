import { Injectable } from '@angular/core';
import { ShapeData, MarkupTool } from './viewer-state.service';

export interface PointerPoint { x: number; y: number; }

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
    const clientX = event instanceof TouchEvent
      ? event.touches[0]?.clientX ?? event.changedTouches[0].clientX
      : event.clientX;
    const clientY = event instanceof TouchEvent
      ? event.touches[0]?.clientY ?? event.changedTouches[0].clientY
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
      case 'line': case 'arrow': case 'dimension':
        return { ...base, x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y };
      case 'rect': case 'highlight': case 'redact': case 'ellipse':
      case 'underline': case 'strikeout': case 'squiggly':
        return { ...base, x: pt.x, y: pt.y, width: 0, height: 0 };
      case 'circle':
        return { ...base, cx: pt.x, cy: pt.y, r: 0 };
      case 'freehand': case 'cloud': case 'polygon': case 'polyline':
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
      case 'line': case 'arrow': case 'dimension':
        return { ...shape, x2: pt.x, y2: pt.y };
      case 'rect': case 'highlight': case 'redact': case 'ellipse':
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
  withPreviewPoint(shape: ShapeData, pt: PointerPoint | null): ShapeData {
    if (!pt || shape.tool !== 'polygon' && shape.tool !== 'polyline') return shape;
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

      case 'dimension': {
        const dx = (s.x2||0)-(s.x1||0), dy = (s.y2||0)-(s.y1||0);
        const len = Math.sqrt(dx*dx+dy*dy);
        const label = s.measurement || `${len.toFixed(0)}px`;
        const mx = ((s.x1||0)+(s.x2||0))/2, my = ((s.y1||0)+(s.y2||0))/2;
        return `<g data-id="${s.id}" stroke="${stroke}" fill="${stroke}">
          <line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke-width="${sw}" marker-end="url(#arrow-${s.id})" marker-start="url(#arrow-${s.id})"/>
          <text x="${mx}" y="${my-4}" font-size="11" text-anchor="middle" fill="${stroke}" font-family="Arial">${label}</text>
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
      case 'line': case 'arrow': case 'dimension':
        return Math.hypot((s.x2||0)-(s.x1||0), (s.y2||0)-(s.y1||0)) > MIN;
      case 'rect': case 'highlight': case 'redact': case 'ellipse':
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
      if (this.shapeContains(shapes[i], pt, tolerance)) return shapes[i];
    }
    return null;
  }

  private shapeContains(s: ShapeData, pt: PointerPoint, tol: number): boolean {
    switch (s.tool) {
      case 'rect': case 'highlight': case 'ellipse':
      case 'underline': case 'strikeout': case 'squiggly':
        return pt.x >= (s.x||0)-tol && pt.x <= (s.x||0)+(s.width||0)+tol &&
               pt.y >= (s.y||0)-tol && pt.y <= (s.y||0)+(s.height||0)+tol;
      case 'circle':
        return Math.hypot(pt.x-(s.cx||0), pt.y-(s.cy||0)) <= (s.r||0)+tol;
      case 'line': case 'arrow': case 'dimension':
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

  private escapeXml(s: string): string {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
}
