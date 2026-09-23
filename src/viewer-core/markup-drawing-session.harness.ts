/**
 * A surface for the drawing session to draw on, in a test.
 *
 * <p>Shared because the gesture suites — dragging, clicking vertices,
 * measuring, text — all need the same one, and a second copy of a stub that
 * fakes SVG geometry is how two suites come to be measuring against two
 * different coordinate spaces while both looking correct.
 *
 * <p>What the stub proves is that the session asks the surface only for what
 * genuinely varies between a PDF page and a CAD drawing — the page, the zoom,
 * and where a finished shape goes — and decides everything else itself.
 */
import { MarkupSurface } from "./markup-drawing-session";
import { ShapeData } from "./viewer-state.service";

/**
 * An overlay whose coordinate space is 1:1 with the screen, so a click at
 * (x, y) is a point at (x, y) and the arithmetic stays out of the way.
 */
export function overlayElement(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 1000 1000");
  svg.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 1000, height: 1000 }) as DOMRect;
  // A 1:1 screen transform, so the close-the-shape tolerance is ten units.
  svg.getScreenCTM = () => ({ a: 1, b: 0 }) as DOMMatrix;
  return svg;
}

/** A surface that records what it was handed. */
export class RecordingSurface implements MarkupSurface {
  readonly overlay = overlayElement();
  readonly committed: ShapeData[] = [];
  pageNumber = 4;
  zoom = 1;
  acceptsDrawing = true;

  commit(shape: ShapeData): void {
    this.committed.push(shape);
  }
}

/** A press, move or release at a point in the overlay's own coordinates. */
export function pointerAt(x: number, y: number, clickDetail = 1): MouseEvent {
  return new MouseEvent("mousedown", {
    clientX: x,
    clientY: y,
    detail: clickDetail,
  });
}
