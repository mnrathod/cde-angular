/**
 * Screen pixels to PDF points, and back.
 *
 * <p>The flip is the whole point. A box drawn over the top third of a page
 * has to be stored as the top third, and a mistake here puts a redaction over
 * the half that still has the words on it.
 */
import {
  PdfRect,
  toPdfRect,
  toScreenRect,
} from "./pdf-page-geometry";

/** An A4 page at 100%: 842 points tall, rendered at 842 pixels. */
const A4_HEIGHT = 842;

describe("pdf page geometry", () => {
  describe("storing what was drawn", () => {
    it("measures y up from the bottom, not down from the top", () => {
      // Drawn 100px from the top of an 842px page, 50px tall. Its bottom edge
      // is 150 from the top, so 692 up from the bottom.
      const stored = toPdfRect(
        { x: 20, y: 100, width: 200, height: 50 },
        1,
        A4_HEIGHT,
      );

      expect(stored.y).toBe(692);
      expect(stored.x).toBe(20);
    });

    it("divides out the zoom, so the same box stores the same at any zoom", () => {
      // The single most valuable property here: a redaction drawn at 200%
      // must land in the same place as the same redaction drawn at 100%.
      const atFullSize = toPdfRect(
        { x: 20, y: 100, width: 200, height: 50 },
        1,
        A4_HEIGHT,
      );
      const atDoubleSize = toPdfRect(
        { x: 40, y: 200, width: 400, height: 100 },
        2,
        A4_HEIGHT * 2,
      );

      expect(atDoubleSize).toEqual(atFullSize);
    });

    it("puts a box drawn at the very top at the top of the page", () => {
      const stored = toPdfRect({ x: 0, y: 0, width: 10, height: 10 }, 1, A4_HEIGHT);

      expect(stored.y).toBe(A4_HEIGHT - 10);
    });

    it("puts a box drawn at the very bottom at the bottom of the page", () => {
      const stored = toPdfRect(
        { x: 0, y: A4_HEIGHT - 10, width: 10, height: 10 },
        1,
        A4_HEIGHT,
      );

      expect(stored.y).toBe(0);
    });

    it("treats a box with no size as a box at a point", () => {
      // The markup layer can hand over a shape whose width was never set.
      const stored = toPdfRect({ x: 5, y: 5 }, 1, A4_HEIGHT);

      expect(stored.width).toBe(0);
      expect(stored.height).toBe(0);
    });

    it("renders at natural size rather than collapsing on a zoom of zero", () => {
      // Dividing by it would put NaN into a stored region, and a NaN box is
      // one the server cannot refuse intelligibly.
      const stored = toPdfRect(
        { x: 20, y: 100, width: 200, height: 50 },
        0,
        A4_HEIGHT,
      );

      expect(Number.isFinite(stored.x)).toBe(true);
      expect(Number.isFinite(stored.y)).toBe(true);
    });
  });

  describe("showing what was stored", () => {
    it("is the exact inverse of storing it", () => {
      // Round-tripping is what keeps a committed redaction sitting over the
      // same words it was drawn over.
      const drawn = { x: 20, y: 100, width: 200, height: 50 };

      const stored = toPdfRect(drawn, 1, A4_HEIGHT);
      const back = toScreenRect(stored, 1, A4_HEIGHT);

      expect(back).toEqual({
        screenX: 20,
        screenY: 100,
        screenWidth: 200,
        screenHeight: 50,
      });
    });

    it("round-trips at a zoom as well", () => {
      const drawn = { x: 40, y: 200, width: 400, height: 100 };
      const rendered = A4_HEIGHT * 2;

      const stored = toPdfRect(drawn, 2, rendered);
      const back = toScreenRect(stored, 2, rendered);

      expect(back.screenX).toBeCloseTo(40);
      expect(back.screenY).toBeCloseTo(200);
      expect(back.screenWidth).toBeCloseTo(400);
      expect(back.screenHeight).toBeCloseTo(100);
    });

    it("scales a stored box up with the zoom", () => {
      const stored: PdfRect = { x: 20, y: 692, width: 200, height: 50 };

      const back = toScreenRect(stored, 2, A4_HEIGHT * 2);

      expect(back.screenX).toBe(40);
      expect(back.screenY).toBe(200);
      expect(back.screenWidth).toBe(400);
    });

    it("survives a zoom of zero", () => {
      const stored: PdfRect = { x: 20, y: 692, width: 200, height: 50 };

      expect(Number.isFinite(toScreenRect(stored, 0, A4_HEIGHT).screenY)).toBe(
        true,
      );
    });
  });
});
