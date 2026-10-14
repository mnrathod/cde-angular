/**
 * What kind of thing a markup tool is, and when a shape built by clicking is
 * done.
 *
 * <p>Split out of `markup-engine.service.ts`, which had grown past §3.3's
 * 400-line limit, along the seam the file already used for rendering:
 * `svg-primitives.ts` and `markup-svg.ts` are implemented away from the
 * service and reached through it. The service still exposes every one of these
 * as a method, so no caller changed.
 *
 * <p>These answer questions about a *tool*, not about a shape's geometry,
 * which is why they group: each list below exists because the same question
 * was once answered in two places and the two disagreed. Keeping them in one
 * small module is what makes a disagreement visible rather than silent.
 */
import { MarkupTool, ShapeData } from './viewer-state.service';
import { PointerPoint } from './markup-palette';

/** Tools built by clicking vertices rather than dragging. */
const VERTEX_TOOLS: readonly MarkupTool[] = [
  'polygon', 'polyline', 'dimension', 'area', 'radius', 'calibrate',
];

export function isVertexTool(tool: MarkupTool): boolean {
  return VERTEX_TOOLS.includes(tool);
}

/**
 * Tools whose shape carries a `text` field, and which therefore have to ask
 * the user for that text before the shape is worth adding.
 *
 * <p>This lives apart from the viewers because both of them need the same
 * answer, and when the list was written out in each of them they disagreed:
 * `callout` was in `startShape` and in `shapeToSvg` but in neither viewer's
 * copy, so placing one produced an empty box that could not be typed into and
 * could not be removed except by undo. A tool added to one list and not the
 * other fails exactly that way — silently, and only when someone reaches for
 * it.
 */
const TEXT_TOOLS: readonly MarkupTool[] = ['text', 'stamp', 'note', 'callout'];

export function isTextTool(tool: MarkupTool): boolean {
  return TEXT_TOOLS.includes(tool);
}

/**
 * Text tools placed by a single click, which is all of them except `callout`.
 *
 * <p>{@link isTextTool} answers "does this shape carry words", which is what
 * asking for them needs. Placing them needs a different question — "is this
 * put down by a click or by a drag" — and `isTextTool` was standing in for it.
 * That put `callout` on the click path, where `updateShape` is never reached,
 * so every callout's label stayed at `startShape`'s fixed offset of eighty
 * right and forty up. On a crowded drawing that is usually on top of the
 * detail being annotated, near a page edge it is off the page, and no gesture
 * moved it.
 *
 * <p>Two predicates rather than one because the two answers genuinely differ
 * for one tool, and a single list cannot hold both without lying about one of
 * them.
 */
const CLICK_PLACED_TEXT_TOOLS: readonly MarkupTool[] = ['text', 'stamp', 'note'];

export function isClickPlacedTextTool(tool: MarkupTool): boolean {
  return CLICK_PLACED_TEXT_TOOLS.includes(tool);
}

/** Vertex tools that end on a fixed click count rather than a double-click. */
export function requiredVertices(tool: MarkupTool): number | null {
  return tool === 'radius' ? 2 : tool === 'calibrate' ? 2 : null;
}

/**
 * The fewest vertices a shape needs before it can be closed. Below this the
 * shape has no area or no length, so finishing it would commit nothing.
 */
export function minimumVertices(tool: MarkupTool): number {
  return tool === 'area' || tool === 'polygon' ? 3 : 2;
}

/**
 * How a tool is completed, for the toolbar to show.
 *
 * <p>Lives with the tool rather than with the toolbar because it is a property
 * of how the tool is drawn, not of how it is presented. The toolbar previously
 * carried its own list naming only polygon and polyline, which left Area,
 * Length and Radius with no indication that a shape has to be closed at all —
 * and an unfinished shape simply never produces a reading, so the tool looks
 * broken rather than unfinished.
 *
 * @returns an empty string for tools that are drawn by dragging.
 */
export function completionHint(tool: MarkupTool): string {
  if (!isVertexTool(tool)) return '';

  // Returned as a finished sentence rather than a fragment the caller
  // capitalises. Upper-casing the first character in the caller works in
  // English and is wrong wherever casing rules differ, and it leaves the
  // translator a fragment with no way to know how it will be presented.
  const fixed = requiredVertices(tool);
  return fixed
    ? $localize`:Tells the user how to finish a shape that ends after a set number of clicks@@markupHint.fixedVertices:Click ${fixed}:count: points`
    : $localize`:Tells the user how to finish a shape with any number of points. Enter is the keyboard key.@@markupHint.anyVertices:Click each point — press Enter, or click the first point again, to finish`;
}

/** True when a click-built shape holds enough vertices to be committed. */
export function canFinish(shape: ShapeData | null): boolean {
  if (!shape || !isVertexTool(shape.tool)) return false;
  return (shape.points?.length ?? 0) >= minimumVertices(shape.tool);
}

/**
 * Whether a click ends the shape rather than adding another vertex to it.
 *
 * <p>Double-click alone was the only way to finish, and it is not a gesture
 * software can rely on. The browser reports one only when two presses fall
 * inside its own window of roughly half a second and a few pixels; outside
 * that they arrive as two ordinary clicks with nothing marking them as a pair.
 * Someone placing a point deliberately — the normal way to work on a drawing —
 * falls outside it constantly, so the shape gained vertices instead of closing
 * and could not be finished however many times it was tried.
 *
 * <p>A click therefore ends the shape when any of these hold, none of which
 * depend on that window:
 *
 *  - the browser did recognise a double-click (`clickDetail >= 2`);
 *  - the click lands on the first vertex, the standard gesture for closing an
 *    outline;
 *  - the click lands on the vertex just placed, which is what a slow
 *    double-click amounts to — and a repeated vertex in the same spot was never
 *    worth anything anyway.
 *
 * <p>Tools with a fixed click count complete themselves and are left alone.
 *
 * @param tolerance radius in the shape's own coordinate space, so the target
 *                  stays the same apparent size at any zoom level.
 * @param clickDetail `MouseEvent.detail` — 1 for a single press, 2 or more for
 *                    the later presses of a rapid sequence.
 */
export function finishesShape(
  shape: ShapeData | null,
  pt: PointerPoint,
  tolerance: number,
  clickDetail = 1,
): boolean {
  if (!canFinish(shape)) return false;
  if (requiredVertices(shape!.tool) !== null) return false;

  const points = shape!.points ?? [];
  const near = (vertex: PointerPoint | undefined) =>
    vertex !== undefined && Math.hypot(pt.x - vertex.x, pt.y - vertex.y) <= tolerance;

  // A shape with no vertices is not near anything, which `near` now says
  // rather than throwing.
  return clickDetail >= 2 || near(points[0]) || near(points[points.length - 1]);
}
