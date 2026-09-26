/**
 * Drawing a markup shape as SVG.
 *
 * <p>Split out of MarkupEngineService, which had grown to 588 lines with this
 * as its largest part and carried a comment admitting it was over §3.3's
 * limit. Nothing here needs injecting: a shape in, a string out.
 *
 * <p>The output of `shapesToSvgContent` is printed and flattened into
 * customer documents, so it has to be well-formed XML — an HTML comment
 * pasted into the middle of the opening tag once passed 559 tests. It is
 * parsed in its own spec now.
 */
import {
  CALIBRATION_COLOUR, MEASURE_COLOUR, MEASURE_COLOUR_DIM, MEASURE_FILL,
  PointerPoint,
} from './markup-palette';
import { shapeToPrimitives } from './svg-primitives';
import { ShapeData } from './viewer-state.service';

export function shapeToSvg(s: ShapeData, zoom = 1): string {
  const stroke = s.color;
  const sw     = s.strokeWidth;
  const fill   = `${s.color}${Math.round((s.opacity || 0) * 255).toString(16).padStart(2,'0')}`;

  /*
   * Every geometry field on ShapeData is optional, and a shape reaches here
   * without one routinely: mid-drag before the second point exists, and from
   * an embed host's own store, which §5.12 says is not trusted.
   *
   * This function defended the fields it did arithmetic on — `s.width||0` and
   * the rest — and interpolated the others straight in, so an incomplete shape
   * rendered `x1="undefined"`. That is not an error anything reports: the
   * attribute is invalid, the element is dropped, and the shape vanishes from
   * an exported drawing with nothing to say it was ever there.
   *
   * `shapeToPrimitives` had the fallbacks all along. The pair's own spec
   * compares element names against a fully-populated fixture, so it could not
   * see a disagreement that only appears when a field is missing.
   *
   * `s.x2` and `s.y2` are still read raw further down, by `callout`, which
   * offsets its tail from the anchor when they are absent — defaulting them to
   * zero here would move that tail to the corner of the page.
   */
  const x  = s.x  ?? 0, y  = s.y  ?? 0;
  const x1 = s.x1 ?? 0, y1 = s.y1 ?? 0;
  const x2 = s.x2 ?? 0, y2 = s.y2 ?? 0;
  const cx = s.cx ?? 0, cy = s.cy ?? 0, r = s.r ?? 0;

  switch (s.tool) {
    case 'line':
      return `<line data-id="${s.id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>`;

    case 'arrow': {
      const dx = (s.x2||0) - (s.x1||0), dy = (s.y2||0) - (s.y1||0);
      const len = Math.sqrt(dx*dx+dy*dy) || 1;
      const ux = dx/len, uy = dy/len;
      const hs = sw * 4;
      const ax = (s.x2||0) - ux*hs, ay = (s.y2||0) - uy*hs;
      const px = -uy*hs*0.5, py = ux*hs*0.5;
      return `<g data-id="${s.id}" stroke="${stroke}" fill="${stroke}">
        <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke-width="${sw}" stroke-linecap="round"/>
        <polygon points="${x2},${y2} ${ax+px},${ay+py} ${ax-px},${ay-py}"/>
      </g>`;
    }

    case 'rect':
      return `<rect data-id="${s.id}" x="${x}" y="${y}" width="${s.width||0}" height="${s.height||0}" stroke="${stroke}" stroke-width="${sw}" fill="${fill}" rx="2"/>`;

    case 'highlight':
      return `<rect data-id="${s.id}" x="${x}" y="${y}" width="${s.width||0}" height="${s.height||2}" fill="#FFFF0066" stroke="none"/>`;

    case 'redact':
      // Live drag preview only — committed regions render separately in
      // PDF-point space (see ViewerStateService.redactionRegions).
      return `<rect data-id="${s.id}" x="${x}" y="${y}" width="${s.width||0}" height="${s.height||0}" fill="#000000" stroke="#000000"/>`;

    case 'formfield':
      // Live drag preview only — placed drafts render separately in
      // PDF-point space (see ViewerStateService.formFieldDrafts).
      return `<rect data-id="${s.id}" x="${x}" y="${y}" width="${s.width||0}" height="${s.height||0}" fill="#3b82f622" stroke="#3b82f6" stroke-width="1.5" stroke-dasharray="4 3" rx="2"/>`;

    case 'circle':
      return `<circle data-id="${s.id}" cx="${cx}" cy="${cy}" r="${s.r||0}" stroke="${stroke}" stroke-width="${sw}" fill="${fill}"/>`;

    case 'ellipse': {
      const rx = (s.width||0)/2, ry = (s.height||0)/2;
      return `<ellipse data-id="${s.id}" cx="${(s.x||0)+rx}" cy="${(s.y||0)+ry}" rx="${rx}" ry="${ry}" stroke="${stroke}" stroke-width="${sw}" fill="${fill}"/>`;
    }

    // Text-markup tools: drag a box over the target text region.
    case 'underline':
      return `<line data-id="${s.id}" x1="${x}" y1="${(s.y||0)+(s.height||0)}" x2="${(s.x||0)+(s.width||0)}" y2="${(s.y||0)+(s.height||0)}" stroke="${stroke}" stroke-width="${Math.max(sw,2)}"/>`;

    case 'strikeout':
      return `<line data-id="${s.id}" x1="${x}" y1="${(s.y||0)+(s.height||0)/2}" x2="${(s.x||0)+(s.width||0)}" y2="${(s.y||0)+(s.height||0)/2}" stroke="${stroke}" stroke-width="${Math.max(sw,2)}"/>`;

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
        <text x="${x}" y="${(s.y||0)+4}" text-anchor="middle" font-size="12">📝</text>
        <title>${escapeXml(s.text||'')}</title>
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
        <text x="${x}" y="${y}" fill="${stroke}" font-size="13" font-family="Arial,sans-serif" font-weight="${s.tool==='stamp'?'bold':'normal'}">${escapeXml(s.text||'')}</text>
      </g>`;


    case 'callout': {
      const tx = s.x2 ?? (s.x||0)+80, ty = s.y2 ?? (s.y||0)-40;
      const txt = escapeXml(s.text||'');
      const boxW = Math.max(txt.length * 7 + 16, 80), boxH = 22;
      return `<g data-id="${s.id}">
        <line x1="${x}" y1="${y}" x2="${tx}" y2="${ty+boxH/2}" stroke="${stroke}" stroke-width="${sw}"/>
        <rect x="${tx}" y="${ty}" width="${boxW}" height="${boxH}" rx="3"
          fill="rgba(255,255,255,0.92)" stroke="${stroke}" stroke-width="${sw}"/>
        <text x="${tx+8}" y="${ty+15}" fill="${stroke}" font-size="12" font-family="Arial">${txt}</text>
        <circle cx="${x}" cy="${y}" r="3" fill="${stroke}"/>
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
        return measureLabel((prev.x + p.x) / 2, (prev.y + p.y) / 2 - 8,
          s.segmentLabels?.[i] ?? '', colour, 10);
      }).join('');
      return `<g data-id="${s.id}">
        <path d="${path}" stroke="${colour}" stroke-width="2" fill="none"/>
        ${pts.map(p => measureDot(p, colour)).join('')}
        ${segments}
        ${s.measurement ? measureLabel(last.x + 6, last.y, '∑ ' + s.measurement, colour, 12) : ''}
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
        ${pts.map(p => measureDot(p, MEASURE_COLOUR)).join('')}
        ${s.measurement ? measureLabel(centroidX, centroidY - 5, s.measurement, MEASURE_COLOUR, 13) : ''}
        ${s.measurementDetail ? measureLabel(centroidX, centroidY + 12, 'P: ' + s.measurementDetail, MEASURE_COLOUR_DIM, 10) : ''}
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
        ${measureDot(centre, MEASURE_COLOUR)}
        ${s.measurement ? measureLabel((centre.x + edge.x) / 2, (centre.y + edge.y) / 2 - 8, 'r = ' + s.measurement, MEASURE_COLOUR, 12) : ''}
        ${s.measurementDetail ? measureLabel(centre.x, centre.y + r + 18, 'ø ' + s.measurementDetail, MEASURE_COLOUR_DIM, 11) : ''}
      </g>`;
    }

    default: return '';
  }
}

/**
 * Renders every shape on a page as one SVG overlay.
 *
 * <p>`left:0` is physical on purpose, not `inset-inline-start`. This
 * overlay sits on the document's own coordinate system — every annotation
 * is stored against a point on the page, and the page does not flip when
 * the interface does. Making this logical would move the whole markup layer
 * off its document in a right-to-left locale.
 */
export function shapesToSvgContent(shapes: ShapeData[], width: number, height: number): string {
  const svgShapes = shapes.map(s => shapeToSvg(s)).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"
    style="position:absolute;top:0;left:0;pointer-events:none;overflow:visible">
    ${svgShapes}
  </svg>`;
}


/** Vertex marker on a measurement. */
function measureDot(pt: PointerPoint, colour: string): string {
  return `<circle cx="${pt.x}" cy="${pt.y}" r="4" fill="${colour}" stroke="#fff" stroke-width="1"/>`;
}

/**
 * Readout with an opaque backing plate — a measurement drawn straight onto
 * a busy drawing is frequently unreadable without one.
 */
function measureLabel(x: number, y: number, text: string, colour: string, size: number): string {
  if (!text) return '';
  const safe  = escapeXml(text);
  const width = safe.length * size * 0.58 + 8;
  return `<g>
    <rect x="${x - 2}" y="${y - size}" width="${width}" height="${size + 4}" rx="3" fill="rgba(10,12,20,0.85)"/>
    <text x="${x + 2}" y="${y}" font-size="${size}" fill="${colour}"
          font-family="monospace" font-weight="bold">${safe}</text>
  </g>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
