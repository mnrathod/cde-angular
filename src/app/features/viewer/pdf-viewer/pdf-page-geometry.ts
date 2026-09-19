/**
 * Converting between what is on screen and what the server stores.
 *
 * <p>Two coordinate systems that disagree about almost everything. A drawn
 * rectangle is in screen pixels at whatever the current zoom is, measured
 * down from the top-left. A PDF is in points at no zoom at all, measured
 * **up from the bottom-left**. Getting the flip wrong puts a redaction over
 * the wrong half of the page, and it is the half that still has the words on
 * it — so this is the arithmetic in the application that most deserves a
 * test, and it had none while it sat inside a 460-line component.
 */

/** A box in the page's own coordinate space, as the server stores it. */
export interface PdfRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The same box in the pixels currently on screen. */
export interface ScreenRect {
  screenX: number;
  screenY: number;
  screenWidth: number;
  screenHeight: number;
}

/** A box drawn on screen, as the markup layer produces it. */
export interface DrawnBox {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

/**
 * How tall the page is in its own points, given its rendered height.
 *
 * <p>A zoom of zero would divide the page out of existence, so it is treated
 * as no magnification — the page still renders, at its natural size, rather
 * than collapsing to NaN.
 */
function nativeHeightOf(renderedHeightPx: number, zoom: number): number {
  return renderedHeightPx / (zoom || 1);
}

/**
 * A drawn rectangle in the page's own points, ready to be stored.
 *
 * <p>Note the `y`: the box's *bottom* edge measured up from the page's
 * bottom, which is why the height is subtracted as well as the offset.
 */
export function toPdfRect(
  drawn: DrawnBox,
  zoom: number,
  renderedHeightPx: number,
): PdfRect {
  const scale = zoom || 1;
  const nativeHeight = nativeHeightOf(renderedHeightPx, zoom);
  const width = (drawn.width || 0) / scale;
  const height = (drawn.height || 0) / scale;
  return {
    x: (drawn.x || 0) / scale,
    y: nativeHeight - (drawn.y || 0) / scale - height,
    width,
    height,
  };
}

/**
 * A stored rectangle back in the pixels currently on screen.
 *
 * <p>Recomputed from the stored points on every zoom rather than scaled from
 * the last screen position, so a box cannot drift as the zoom changes.
 */
export function toScreenRect(
  stored: PdfRect,
  zoom: number,
  renderedHeightPx: number,
): ScreenRect {
  const scale = zoom || 1;
  const nativeHeight = nativeHeightOf(renderedHeightPx, zoom);
  return {
    screenX: stored.x * scale,
    screenY: (nativeHeight - stored.y - stored.height) * scale,
    screenWidth: stored.width * scale,
    screenHeight: stored.height * scale,
  };
}

/**
 * Which page is being drawn on and how it is currently displayed.
 *
 * <p>The three travel together everywhere: no conversion here means anything
 * without all of them. Passing them as one also keeps the conversions inside
 * §3.3's four-parameter limit, which taking them separately did not.
 */
export interface PageGeometry {
  page: number;
  zoom: number;
  renderedHeightPx: number;
}

/** A box the server stores, tagged with the page it is on. */
interface PageBox extends PdfRect {
  page: number;
}

/** A redaction region as the server stores it. */
export interface RedactionRegion extends PageBox {
  id: string;
}

/** An unnamed form field, as drawn and before the Form panel names it. */
export interface FormFieldDraft extends PageBox {
  id: string;
  name: string;
  kind: "TEXT";
  required: boolean;
  options: string;
}

/** A drawn box turned into a redaction the server can act on. */
export function redactionFrom(
  id: string,
  drawn: DrawnBox,
  geometry: PageGeometry,
): RedactionRegion {
  return {
    id,
    page: geometry.page,
    ...toPdfRect(drawn, geometry.zoom, geometry.renderedHeightPx),
  };
}

/**
 * A drawn box turned into an unnamed field draft.
 *
 * <p>Named in the Form panel rather than here: a prompt for every box would
 * make laying out a form of twenty fields twenty interruptions.
 */
export function formFieldDraftFrom(
  id: string,
  drawn: DrawnBox,
  geometry: PageGeometry,
): FormFieldDraft {
  return {
    id,
    page: geometry.page,
    ...toPdfRect(drawn, geometry.zoom, geometry.renderedHeightPx),
    name: "",
    kind: "TEXT",
    required: false,
    options: "",
  };
}

/**
 * The stored boxes that belong on this page, in the pixels it occupies now.
 *
 * <p>Here rather than in the overlay component because it is arithmetic, and
 * because the overlay draws two lists that differ in nothing but what they
 * are drawn as — a redaction is filled black, a field draft is outlined and
 * labelled, and neither difference is in the conversion.
 */
export function onScreenBoxes<BoxOnPage extends PageBox>(
  boxes: readonly BoxOnPage[],
  geometry: PageGeometry,
): (BoxOnPage & ScreenRect)[] {
  return boxes
    .filter((box) => box.page === geometry.page)
    .map((box) => ({
      ...box,
      ...toScreenRect(box, geometry.zoom, geometry.renderedHeightPx),
    }));
}

/**
 * The space a page needs once the view rotation is applied.
 *
 * <p>A quarter turn swaps a page's footprint, and the rotation itself is a
 * CSS transform, which does not affect layout. Something has to carry the
 * swapped size or neighbouring pages overlap.
 */
export function rotatedFootprint(
  quarterTurned: boolean,
  width: number,
  height: number,
): { width: number; height: number } {
  return quarterTurned
    ? { width: height, height: width }
    : { width, height };
}
