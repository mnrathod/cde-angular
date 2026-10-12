/**
 * Drawing a markup shape without a pointer.
 *
 * <p>§1A.2 wants every interaction available from the keyboard and SC 2.5.7
 * wants a single-pointer alternative to every drag. Drawing had neither: no
 * shape could be created at all without a pointer, which made the markup
 * layer — the product's main reason for existing — unusable for a reader who
 * does not use one. Two issues of the architecture document called it the
 * largest accessibility item outstanding.
 *
 * <p>The claim these tests exist to hold is not "the keys do something". It is
 * that **the keyboard drives the same state machine the pointer does**, so the
 * two cannot come to disagree about which tools work — the drift this session
 * was extracted to prevent in the first place, and which happened once already
 * between the PDF page and the CAD drawing.
 */
import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MarkupDrawingSession } from "./markup-drawing-session";
import { RecordingSurface, pointerAt } from "./markup-drawing-session.harness";
import { ShapeData, ViewerStateService } from "./viewer-state.service";

/** The middle of the harness overlay, whose viewBox is 0 0 1000 1000. */
const CENTRE = { x: 500, y: 500 };

/** The fine and coarse arrow steps the engine reports. */
const FINE = 2;
const COARSE = 20;

describe("MarkupDrawingSession, from the keyboard", () => {
  let session: MarkupDrawingSession;
  let surface: RecordingSurface;
  let state: ViewerStateService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [ViewerStateService, MarkupDrawingSession],
    });
    session = TestBed.inject(MarkupDrawingSession);
    state = TestBed.inject(ViewerStateService);
    surface = new RecordingSurface();
    session.attachTo(surface);
    state.activeTool.set("rect");
  });

  /** A key press on the surface. Returns whether the session used it. */
  function press(key: string, shiftKey = false): boolean {
    return session.handleKey(new KeyboardEvent("keydown", { key, shiftKey }));
  }

  /** The geometry of a shape, without the fields that differ every run. */
  function geometryOf(shape: ShapeData) {
    const { id, createdAt, ...rest } = shape;
    return rest;
  }

  describe("the crosshair", () => {
    it("starts in the middle of the surface, not at its corner", () => {
      // A shape placed at the origin is half off the page on a drawing whose
      // viewBox does not start at zero, and the middle is where a reader is
      // most likely to be looking.
      press("ArrowRight");

      expect(session.keyboardCursor()).toEqual({
        x: CENTRE.x + FINE,
        y: CENTRE.y,
      });
    });

    it("moves in all four directions", () => {
      press("ArrowRight");
      press("ArrowDown");
      press("ArrowLeft");
      press("ArrowLeft");
      press("ArrowUp");

      expect(session.keyboardCursor()).toEqual({
        x: CENTRE.x - FINE,
        y: CENTRE.y,
      });
    });

    it("takes a larger step with Shift", () => {
      // One step size cannot both cross a sheet and place anything precisely.
      press("ArrowRight", true);

      expect(session.keyboardCursor()?.x).toBe(CENTRE.x + COARSE);
    });

    it("is not offered when the tool draws nothing", () => {
      // Pan and select accept no shapes. Swallowing arrow keys there would
      // stop the reader scrolling the document.
      surface.acceptsDrawing = false;

      expect(press("ArrowRight")).toBe(false);
      expect(session.keyboardCursor()).toBeNull();
    });

    it("leaves keys it does not use alone", () => {
      // The surface only calls preventDefault when this returns true, so a
      // false here is what keeps Tab, PageDown and typing working.
      expect(press("PageDown")).toBe(false);
      expect(press("a")).toBe(false);
      expect(press("Tab")).toBe(false);
    });
  });

  describe("drawing a shape", () => {
    it("starts one where the crosshair is", () => {
      press(" ");

      expect(session.activeShape()).toMatchObject({ x: CENTRE.x, y: CENTRE.y });
    });

    it("sizes it as the crosshair moves, which is what replaces the drag", () => {
      press(" ");
      press("ArrowRight", true);
      press("ArrowDown", true);

      expect(session.activeShape()).toMatchObject({
        width: COARSE,
        height: COARSE,
      });
    });

    it("commits it on Enter", () => {
      press(" ");
      press("ArrowRight", true);
      press("ArrowDown", true);

      expect(press("Enter")).toBe(true);

      expect(surface.committed).toHaveLength(1);
      expect(surface.committed[0]).toMatchObject({
        width: COARSE,
        height: COARSE,
      });
      expect(session.activeShape()).toBeNull();
    });

    it("discards it on Escape", () => {
      press(" ");
      press("ArrowRight", true);

      expect(press("Escape")).toBe(true);

      expect(surface.committed).toEqual([]);
      expect(session.activeShape()).toBeNull();
    });

    it("refuses to commit one too small to see", () => {
      // Space then Enter with no movement is a zero-sized rectangle, which is
      // invisible on the page and impossible to select, so it could never be
      // removed again.
      press(" ");

      press("Enter");

      expect(surface.committed).toEqual([]);
    });

    it("puts the crosshair away on Escape once no shape is in progress", () => {
      press("ArrowRight");

      expect(press("Escape")).toBe(true);

      expect(session.keyboardCursor()).toBeNull();
    });
  });

  describe("the same state machine as the pointer", () => {
    it("draws the shape a pointer drawing the same rectangle would", () => {
      // The claim worth holding. A separate keyboard path would pass its own
      // tests and still disagree with the pointer about which tools work, what
      // a shape's defaults are, or where a finished one goes.
      press(" ");
      press("ArrowRight", true);
      press("ArrowDown", true);
      press("Enter");
      const byKeyboard = surface.committed[0]!;

      surface.committed.length = 0;
      session.pointerDown(pointerAt(CENTRE.x, CENTRE.y));
      session.pointerMove(pointerAt(CENTRE.x + COARSE, CENTRE.y + COARSE));
      session.pointerUp();
      const byPointer = surface.committed[0]!;

      expect(geometryOf(byKeyboard)).toEqual(geometryOf(byPointer));
    });

    it("routes a click-placed text tool through the same prompt", () => {
      vi.stubGlobal("prompt", () => "FOR REVIEW");
      state.activeTool.set("note");

      press(" ");

      expect(surface.committed[0]).toMatchObject({
        text: "FOR REVIEW",
        x: CENTRE.x,
        y: CENTRE.y,
      });
      vi.unstubAllGlobals();
    });

    it("drops a vertex for a vertex tool, as a click does", () => {
      state.activeTool.set("polygon");

      press(" ");
      press("ArrowRight", true);
      press(" ");

      expect(session.activeShape()?.points).toEqual([
        { x: CENTRE.x, y: CENTRE.y },
        { x: CENTRE.x + COARSE, y: CENTRE.y },
      ]);
    });
  });
});
