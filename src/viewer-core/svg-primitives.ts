/**
 * Shapes as drawable SVG elements, described rather than serialised.
 *
 * Its own file because `markup-engine.service.ts` is already over §3.3's
 * 400-line limit and adding a second renderer to it made that considerably
 * worse. `MarkupEngineService.shapeToPrimitives` delegates here, so callers
 * are unaffected.
 *
 * Pure functions: no Angular, no state, nothing injected. That is what lets
 * `markup-primitives.spec.ts` drive every tool through both renderers and
 * compare them.
 */
import { ShapeData } from './viewer-state.service';
import { PointerPoint, MEASURE_COLOUR, MEASURE_COLOUR_DIM, MEASURE_FILL, CALIBRATION_COLOUR }
  from './markup-palette';

/** Attributes every drawable primitive carries. */
interface SvgPrimitiveBase {
  stroke: string;
  strokeWidth: number;
  fill: string;
  dashArray?: string;
  linecap?: string;
  linejoin?: string;
}

/**
 * One SVG element, as data rather than as markup.
 *
 * A discriminated union so a template can switch on `kind` and bind each
 * attribute — see {@link MarkupEngineService.shapeToPrimitives} for why a
 * string of SVG is not an option anywhere it reaches the DOM.
 */
export type SvgPrimitive =
  | (SvgPrimitiveBase & { kind: 'rect'; x: number; y: number;
                          width: number; height: number; rx?: number })
  | (SvgPrimitiveBase & { kind: 'circle'; cx: number; cy: number; r: number })
  | (SvgPrimitiveBase & { kind: 'ellipse'; cx: number; cy: number;
                          rx: number; ry: number })
  | (SvgPrimitiveBase & { kind: 'path'; d: string })
  | (SvgPrimitiveBase & { kind: 'line'; x1: number; y1: number;
                          x2: number; y2: number })
  | (SvgPrimitiveBase & { kind: 'polygon'; points: string })
  | (SvgPrimitiveBase & { kind: 'text'; x: number; y: number; content: string;
                          fontSize: number; fontFamily?: string;
                          fontWeight?: string; textAnchor?: string })
  /**
   * An accessible name for the group a shape is drawn in — what a browser
   * shows as a tooltip and a screen reader announces. Only `content` is used;
   * the inherited paint attributes are ignored.
   */
  | (SvgPrimitiveBase & { kind: 'title'; content: string });

/**
 * A shape as drawable SVG primitives, rather than as a string of markup.
 *
 * {@link shapeToSvg} returns a string, which a component can only put on the
 * page through `[innerHTML]` — banned by CLAUDE.md §5.12 without DOMPurify,
 * and for good reason here. Shape fields are not all ours: `text` is typed
 * by a user, `color` is whatever the state holds, and in an embed the whole
 * shape arrives from the *host* via `host.loadMarkup`. A string built from
 * those and injected runs whatever was put in them, on the viewer's origin.
 *
 * These reach the page through ordinary attribute bindings instead, which
 * Angular escapes, so there is nothing to sanitise and nothing to bypass.
 * `shapeToSvg` survives for the one job that genuinely wants a string:
 * exporting an SVG file (see {@link shapesToSvgContent}).
 *
 * <p>The two must draw the same thing. `markup-primitives.spec.ts` parses
 * `shapeToSvg`'s output for every tool and asserts the element names match
 * the primitive kinds here, so the pair cannot drift apart silently.
 */
export function shapeToPrimitives(shape: ShapeData): SvgPrimitive[] {
  const stroke = shape.color;
  const strokeWidth = shape.strokeWidth;
  const fill = `${shape.color}${Math.round((shape.opacity || 0) * 255)
    .toString(16).padStart(2, '0')}`;
  const paint = { stroke, strokeWidth, fill };
  const x = shape.x ?? 0;
  const y = shape.y ?? 0;
  const width = shape.width ?? 0;
  const height = shape.height ?? 0;
  const points = shape.points ?? [];
  const pathThrough = (vertices: PointerPoint[]) => vertices
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ');

  switch (shape.tool) {
    case 'line':
      return [{
        ...paint, kind: 'line', fill: 'none', linecap: 'round',
        x1: shape.x1 ?? 0, y1: shape.y1 ?? 0, x2: shape.x2 ?? 0, y2: shape.y2 ?? 0,
      }];

    case 'arrow': {
      const [x1, y1, x2, y2] =
        [shape.x1 ?? 0, shape.y1 ?? 0, shape.x2 ?? 0, shape.y2 ?? 0];
      const deltaX = x2 - x1;
      const deltaY = y2 - y1;
      const length = Math.sqrt(deltaX * deltaX + deltaY * deltaY) || 1;
      const unitX = deltaX / length;
      const unitY = deltaY / length;
      const head = strokeWidth * 4;
      const baseX = x2 - unitX * head;
      const baseY = y2 - unitY * head;
      const acrossX = -unitY * head * 0.5;
      const acrossY = unitX * head * 0.5;
      return [
        { ...paint, kind: 'line', fill: 'none', linecap: 'round', x1, y1, x2, y2 },
        {
          ...paint, kind: 'polygon', fill: stroke,
          points: `${x2},${y2} ${baseX + acrossX},${baseY + acrossY} `
            + `${baseX - acrossX},${baseY - acrossY}`,
        },
      ];
    }

    case 'rect':
      return [{ ...paint, kind: 'rect', x, y, width, height, rx: 2 }];

    case 'highlight':
      return [{
        kind: 'rect', x, y, width, height: shape.height ?? 2,
        fill: '#FFFF0066', stroke: 'none', strokeWidth: 0,
      }];

    // Live drag preview only for these two — what is committed renders in
    // PDF-point space from ViewerStateService, not from a ShapeData.
    case 'redact':
      return [{
        kind: 'rect', x, y, width, height,
        fill: '#000000', stroke: '#000000', strokeWidth,
      }];

    case 'formfield':
      return [{
        kind: 'rect', x, y, width, height, rx: 2,
        fill: '#3b82f622', stroke: '#3b82f6', strokeWidth: 1.5, dashArray: '4 3',
      }];

    case 'circle':
      return [{
        ...paint, kind: 'circle',
        cx: shape.cx ?? 0, cy: shape.cy ?? 0, r: shape.r ?? 0,
      }];

    case 'ellipse': {
      const rx = width / 2;
      const ry = height / 2;
      return [{ ...paint, kind: 'ellipse', cx: x + rx, cy: y + ry, rx, ry }];
    }

    // Text-markup tools: a box is dragged over the target text region, and
    // the rule is drawn along one edge of it.
    case 'underline':
      return [{
        ...paint, kind: 'line', fill: 'none', strokeWidth: Math.max(strokeWidth, 2),
        x1: x, y1: y + height, x2: x + width, y2: y + height,
      }];

    case 'strikeout':
      return [{
        ...paint, kind: 'line', fill: 'none', strokeWidth: Math.max(strokeWidth, 2),
        x1: x, y1: y + height / 2, x2: x + width, y2: y + height / 2,
      }];

    case 'squiggly': {
      const period = 6;
      const amplitude = 2;
      const baseline = y + height;
      let d = `M${x},${baseline}`;
      for (let along = 0; along <= width; along += period) {
        const peak = baseline
          + (Math.floor(along / period) % 2 === 0 ? -amplitude : amplitude);
        d += ` Q${x + along + period / 2},${peak} ${x + along + period},${baseline}`;
      }
      return [{
        ...paint, kind: 'path', d, fill: 'none',
        strokeWidth: Math.max(strokeWidth, 1.5),
      }];
    }

    case 'note':
      return [
        {
          kind: 'rect', x: x - 9, y: y - 9, width: 18, height: 18, rx: 3,
          fill: '#FFD54A', stroke, strokeWidth: 1.5,
        },
        {
          ...paint, kind: 'text', x, y: y + 4, content: '📝',
          fontSize: 12, textAnchor: 'middle',
        },
        // The note's body, as the group's accessible name: a sticky note is
        // a marker for text that is not otherwise on the page at all.
        { ...paint, kind: 'title', content: shape.text ?? '' },
      ];

    case 'polygon':
      if (points.length < 2) return [];
      return [{
        ...paint, kind: 'path', d: `${pathThrough(points)} Z`, linejoin: 'round',
      }];

    case 'polyline':
    case 'freehand':
      if (points.length < 2) return [];
      return [{
        ...paint, kind: 'path', d: pathThrough(points), fill: 'none',
        linecap: 'round', linejoin: 'round',
      }];

    case 'cloud':
      if (points.length < 2) return [];
      return [{
        ...paint, kind: 'path', d: `${pathThrough(points)}Z`, dashArray: '8 4',
      }];

    case 'text':
    case 'stamp': {
      const content = shape.text ?? '';
      return [
        {
          kind: 'rect', x: x - 2, y: y - 14,
          width: content.length * 7 + 10 || 60, height: 18, rx: 2,
          fill: 'rgba(255,255,255,0.85)', stroke: 'none', strokeWidth: 0,
        },
        {
          ...paint, kind: 'text', x, y, content, fill: stroke,
          fontSize: 13, fontFamily: 'Arial,sans-serif',
          fontWeight: shape.tool === 'stamp' ? 'bold' : 'normal',
        },
      ];
    }

    case 'callout': {
      const boxX = shape.x2 ?? x + 80;
      const boxY = shape.y2 ?? y - 40;
      const content = shape.text ?? '';
      const boxWidth = Math.max(content.length * 7 + 16, 80);
      const boxHeight = 22;
      return [
        {
          ...paint, kind: 'line', fill: 'none',
          x1: x, y1: y, x2: boxX, y2: boxY + boxHeight / 2,
        },
        {
          ...paint, kind: 'rect', x: boxX, y: boxY,
          width: boxWidth, height: boxHeight, rx: 3,
          fill: 'rgba(255,255,255,0.92)',
        },
        {
          ...paint, kind: 'text', x: boxX + 8, y: boxY + 15, content,
          fill: stroke, fontSize: 12, fontFamily: 'Arial',
        },
        { ...paint, kind: 'circle', cx: x, cy: y, r: 3, fill: stroke },
      ];
    }

    // ── Measurement tools ────────────────────────────────────
    // Drawn in their own palette rather than the markup stroke colour: a
    // measurement is a readout, not an annotation, and has to stay legible
    // over whatever markup is already on the drawing.
    case 'dimension':
    case 'calibrate': {
      if (points.length < 2) return [];
      const colour = shape.tool === 'calibrate' ? CALIBRATION_COLOUR : MEASURE_COLOUR;
      const last = points[points.length - 1];
      if (!last) return [];
      const segments = points.slice(1).flatMap((point, index) => {
        const previous = points[index];
        if (!previous) return [];
        return measureLabelPrimitives(
          (previous.x + point.x) / 2, (previous.y + point.y) / 2 - 8,
          shape.segmentLabels?.[index] ?? '', colour, 10);
      });
      return [
        {
          kind: 'path', d: pathThrough(points),
          stroke: colour, strokeWidth: 2, fill: 'none',
        },
        ...points.map((point) => measureDotPrimitive(point, colour)),
        ...segments,
        ...measureLabelPrimitives(
          last.x + 6, last.y,
          shape.measurement ? `∑ ${shape.measurement}` : '', colour, 12),
      ];
    }

    case 'area': {
      if (points.length < 2) return [];
      const centroidX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
      const centroidY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
      return [
        {
          kind: 'polygon', points: points.map((p) => `${p.x},${p.y}`).join(' '),
          stroke: MEASURE_COLOUR, strokeWidth: 2, fill: MEASURE_FILL,
        },
        ...points.map((point) => measureDotPrimitive(point, MEASURE_COLOUR)),
        ...measureLabelPrimitives(centroidX, centroidY - 5,
          shape.measurement ?? '', MEASURE_COLOUR, 13),
        ...measureLabelPrimitives(centroidX, centroidY + 12,
          shape.measurementDetail ? `P: ${shape.measurementDetail}` : '',
          MEASURE_COLOUR_DIM, 10),
      ];
    }

    case 'radius': {
      if (points.length < 2) return [];
      const [centre, edge] = points;
      if (!centre || !edge) return [];
      const radius = Math.hypot(edge.x - centre.x, edge.y - centre.y);
      return [
        {
          kind: 'circle', cx: centre.x, cy: centre.y, r: radius,
          stroke: MEASURE_COLOUR, strokeWidth: 2, fill: MEASURE_FILL,
        },
        {
          kind: 'line', x1: centre.x, y1: centre.y, x2: edge.x, y2: edge.y,
          stroke: MEASURE_COLOUR, strokeWidth: 1.5, fill: 'none', dashArray: '4,3',
        },
        measureDotPrimitive(centre, MEASURE_COLOUR),
        ...measureLabelPrimitives(
          (centre.x + edge.x) / 2, (centre.y + edge.y) / 2 - 8,
          shape.measurement ? `r = ${shape.measurement}` : '', MEASURE_COLOUR, 12),
        ...measureLabelPrimitives(centre.x, centre.y + radius + 18,
          shape.measurementDetail ? `ø ${shape.measurementDetail}` : '',
          MEASURE_COLOUR_DIM, 11),
      ];
    }

    default:
      return [];
  }
}

/** The vertex marker on a measurement, as {@link measureDot} draws it. */
function measureDotPrimitive(point: PointerPoint, colour: string): SvgPrimitive {
  return {
    kind: 'circle', cx: point.x, cy: point.y, r: 4,
    fill: colour, stroke: '#fff', strokeWidth: 1,
  };
}

/**
 * A readout and its backing plate, as {@link measureLabel} draws them.
 *
 * Empty text yields nothing, matching the string renderer — an empty label
 * would otherwise put a bare plate on the drawing.
 */
function measureLabelPrimitives(
  x: number, y: number, text: string, colour: string, size: number,
): SvgPrimitive[] {
  if (!text) return [];
  return [
    {
      kind: 'rect', x: x - 2, y: y - size,
      width: text.length * size * 0.58 + 8, height: size + 4, rx: 3,
      fill: 'rgba(10,12,20,0.85)', stroke: 'none', strokeWidth: 0,
    },
    {
      kind: 'text', x: x + 2, y, content: text, fontSize: size,
      fill: colour, stroke: 'none', strokeWidth: 0,
      fontFamily: 'monospace', fontWeight: 'bold',
    },
  ];
}
