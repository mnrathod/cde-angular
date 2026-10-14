/**
 * Which committed shape is under a point.
 *
 * <p>Split out of `markup-engine.service.ts` to bring it under §3.3's 400-line
 * limit, along the seam that file already used for rendering. The service still
 * exposes `hitTest` as a method, so no caller changed.
 *
 * <p>Pure geometry, which is why it groups apart from the tool questions in
 * `markup-tool-kinds.ts`: nothing here asks what a tool is for, only where its
 * shape lies.
 */
import { ShapeData } from './viewer-state.service';
import { PointerPoint } from './markup-palette';

/** Distance from a point to a line segment, which is what hitting a line means. */
function distanceToSegment(
  point: PointerPoint,
  from: PointerPoint,
  to: PointerPoint,
): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - from.x, point.y - from.y);

  const along = Math.max(
    0,
    Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared),
  );
  return Math.hypot(point.x - (from.x + along * dx), point.y - (from.y + along * dy));
}

/**
 * Whether one shape covers the point, within a tolerance.
 *
 * <p>Shapes this does not know how to test report false, which means they
 * cannot be picked. That is a real gap rather than a safe default — see the
 * architecture document's list of what the markup layer still cannot do — and
 * it is written out here so the next reader does not mistake the `default` arm
 * for completeness.
 */
function shapeCovers(shape: ShapeData, point: PointerPoint, tolerance: number): boolean {
  switch (shape.tool) {
    case 'rect': case 'highlight': case 'formfield': case 'ellipse':
    case 'underline': case 'strikeout': case 'squiggly':
      return point.x >= (shape.x || 0) - tolerance &&
             point.x <= (shape.x || 0) + (shape.width || 0) + tolerance &&
             point.y >= (shape.y || 0) - tolerance &&
             point.y <= (shape.y || 0) + (shape.height || 0) + tolerance;
    case 'circle':
      return Math.hypot(point.x - (shape.cx || 0), point.y - (shape.cy || 0))
        <= (shape.r || 0) + tolerance;
    case 'line': case 'arrow':
      return distanceToSegment(
        point,
        { x: shape.x1 || 0, y: shape.y1 || 0 },
        { x: shape.x2 || 0, y: shape.y2 || 0 },
      ) <= tolerance;
    default:
      return false;
  }
}

/**
 * The topmost shape under a point, or null.
 *
 * <p>Searched last-first because the last shape in the list is the one drawn on
 * top, and picking the one underneath it is not what anyone means by clicking
 * on something.
 */
export function hitTest(
  shapes: ShapeData[],
  point: PointerPoint,
  tolerance = 8,
): ShapeData | null {
  for (let index = shapes.length - 1; index >= 0; index--) {
    // Bound once rather than indexed twice: it removes the second access the
    // compiler cannot prove safe, and it reads better.
    const shape = shapes[index];
    if (shape && shapeCovers(shape, point, tolerance)) return shape;
  }
  return null;
}
