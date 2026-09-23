/**
 * The gesture that draws a markup shape by dragging, and what the session
 * refuses to do before it has a surface.
 *
 * <p>This was two hand-maintained copies before — one in the PDF page, one in
 * the CAD drawing — and neither had a test. The copies carried a comment
 * saying they must not drift apart on which gestures finish a shape, which is
 * precisely the promise a test makes and a comment does not.
 */
import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it } from "vitest";

import { MarkupDrawingSession } from "./markup-drawing-session";
import {
  RecordingSurface,
  pointerAt,
} from "./markup-drawing-session.harness";
import { MarkupTool, ShapeData, ViewerStateService } from "./viewer-state.service";

describe("MarkupDrawingSession", () => {
  let session: MarkupDrawingSession;
  let surface: RecordingSurface;
  let state: ViewerStateService;

  beforeEach(() => {
    // ViewerStateService is deliberately not root-provided — it is scoped
    // per viewer instance — so the session's own scope has to supply it.
    TestBed.configureTestingModule({
      providers: [ViewerStateService, MarkupDrawingSession],
    });
    session = TestBed.inject(MarkupDrawingSession);
    state = TestBed.inject(ViewerStateService);
    surface = new RecordingSurface();
    session.attachTo(surface);
  });

  /** Drags a rectangle from one corner to the other. */
  function dragFrom(fromX: number, fromY: number, toX: number, toY: number) {
    session.pointerDown(pointerAt(fromX, fromY));
    session.pointerMove(pointerAt(toX, toY));
    session.pointerUp();
  }

  describe("a dragged shape", () => {
    beforeEach(() => state.activeTool.set("rect"));

    it("hands the finished shape to the surface", () => {
      dragFrom(10, 10, 200, 150);

      expect(surface.committed).toHaveLength(1);
      expect(surface.committed[0]?.tool).toBe("rect");
    });

    it("files it under the page the surface says it is", () => {
      // A CAD drawing is always page 1; a PDF page is whichever it is. Getting
      // this from the surface is the whole reason the page is not hardcoded.
      surface.pageNumber = 7;

      dragFrom(10, 10, 200, 150);

      expect(surface.committed[0]?.pageNumber).toBe(7);
    });

    it("throws away a drag too small to have been meant", () => {
      // A click that moved a pixel is a click, not a rectangle, and leaving a
      // one-pixel box behind on every mis-click makes a drawing unusable.
      dragFrom(10, 10, 11, 11);

      expect(surface.committed).toEqual([]);
    });

    it("leaves nothing half-drawn once the gesture ends", () => {
      dragFrom(10, 10, 200, 150);

      expect(session.activeShape()).toBeNull();
    });

    it("ignores a press when the surface is not accepting drawing", () => {
      // The pan and select tools; and on a PDF page, the overlay stops
      // capturing pointer events entirely so text underneath is selectable.
      surface.acceptsDrawing = false;

      dragFrom(10, 10, 200, 150);

      expect(surface.committed).toEqual([]);
      expect(session.activeShape()).toBeNull();
    });

    it("does nothing on a release that no press started", () => {
      session.pointerUp();

      expect(surface.committed).toEqual([]);
    });
  });
  it("does nothing at all before it has been given a surface", () => {
    // Attachment happens after the view exists, so a pointer event can arrive
    // first — on a page that renders while the mouse is already down.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [ViewerStateService, MarkupDrawingSession],
    });
    const unattached = TestBed.inject(MarkupDrawingSession);

    expect(() => {
      unattached.pointerDown(pointerAt(10, 10));
      unattached.pointerMove(pointerAt(20, 20));
      unattached.pointerUp();
    }).not.toThrow();
  });
});
