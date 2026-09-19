/**
 * Screen pixels to PDF points, and back.
 *
 * <p>The flip is the whole point. A box drawn over the top third of a page
 * has to be stored as the top third, and a mistake here puts a redaction over
 * the half that still has the words on it.
 */
import {
  PdfRect,
  formFieldDraftFrom,
  onScreenBoxes,
  redactionFrom,
  rotatedFootprint,
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

  describe("turning a drawn box into something the server stores", () => {
    const onPageThree = { page: 3, zoom: 1, renderedHeightPx: A4_HEIGHT };
    const drawn = { x: 20, y: 100, width: 200, height: 50 };

    it("tags a redaction with the page it was drawn on", () => {
      const region = redactionFrom("r1", drawn, onPageThree);

      expect(region.id).toBe("r1");
      expect(region.page).toBe(3);
      expect(region.y).toBe(692);
    });

    it("converts a field draft with the same arithmetic as a redaction", () => {
      // The two differ in what they carry, never in where they sit. A box
      // drawn once must not land in two places depending on the tool.
      const region = redactionFrom("r1", drawn, onPageThree);
      const draft = formFieldDraftFrom("f1", drawn, onPageThree);

      expect({ x: draft.x, y: draft.y, width: draft.width, height: draft.height })
        .toEqual({ x: region.x, y: region.y, width: region.width, height: region.height });
    });

    it("leaves a field draft unnamed for the Form panel to name", () => {
      const draft = formFieldDraftFrom("f1", drawn, onPageThree);

      expect(draft.name).toBe("");
      expect(draft.required).toBe(false);
    });
  });

  describe("picking the boxes that belong on a page", () => {
    const stored = [
      { id: "a", page: 1, x: 10, y: 700, width: 30, height: 40 },
      { id: "b", page: 2, x: 10, y: 700, width: 30, height: 40 },
      { id: "c", page: 1, x: 50, y: 600, width: 30, height: 40 },
    ];

    it("leaves out the boxes drawn on another page", () => {
      const onPageOne = onScreenBoxes(stored, {
        page: 1,
        zoom: 1,
        renderedHeightPx: A4_HEIGHT,
      });

      expect(onPageOne.map((box) => box.id)).toEqual(["a", "c"]);
    });

    it("gives each box its position in the pixels on screen now", () => {
      const [first] = onScreenBoxes(stored, {
        page: 1,
        zoom: 2,
        renderedHeightPx: A4_HEIGHT * 2,
      });

      expect(first?.screenY).toBe((A4_HEIGHT - 700 - 40) * 2);
      expect(first?.screenWidth).toBe(60);
    });

    it("keeps whatever else a box was carrying", () => {
      // A field draft's name is drawn beside it, so dropping the rest of the
      // record while converting would label every field with nothing.
      const drafts = [{ id: "f1", page: 1, name: "Signature", x: 0, y: 0, width: 1, height: 1 }];

      const [converted] = onScreenBoxes(drafts, {
        page: 1,
        zoom: 1,
        renderedHeightPx: A4_HEIGHT,
      });

      expect(converted?.name).toBe("Signature");
    });
  });

  describe("the space a rotated page needs", () => {
    it("swaps width and height on a quarter turn", () => {
      // Without the swap the pages either side of a landscape one overlap it.
      expect(rotatedFootprint(true, 595, A4_HEIGHT)).toEqual({
        width: A4_HEIGHT,
        height: 595,
      });
    });

    it("leaves an upright page alone", () => {
      expect(rotatedFootprint(false, 595, A4_HEIGHT)).toEqual({
        width: 595,
        height: A4_HEIGHT,
      });
    });
  });
});
