/**
 * Shapes built by clicking one vertex at a time, and the tools that finish
 * themselves.
 *
 * <p>The awkward cases are the endings: a polygon closed by clicking its
 * first point again, a polyline ended by a double click, and a tool that
 * completes on the first press. Getting an ending wrong leaves a shape the
 * user cannot finish, which is the failure worth guarding.
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

  describe("a shape built by clicking vertices", () => {
    beforeEach(() => state.activeTool.set("polygon"));

    it("adds a vertex per click without committing anything", () => {
      session.pointerDown(pointerAt(10, 10));
      session.pointerDown(pointerAt(200, 10));

      expect(session.activeShape()?.points).toHaveLength(2);
      expect(surface.committed).toEqual([]);
    });

    it("is not ended by releasing the pointer", () => {
      // Vertex tools are click-driven, so mouseup must be a no-op — otherwise
      // the first click both starts and finishes the shape.
      session.pointerDown(pointerAt(10, 10));
      session.pointerUp();

      expect(session.activeShape()).not.toBeNull();
      expect(surface.committed).toEqual([]);
    });

    it("finishes when a click lands back on the first vertex", () => {
      session.pointerDown(pointerAt(10, 10));
      session.pointerDown(pointerAt(200, 10));
      session.pointerDown(pointerAt(200, 200));

      session.pointerDown(pointerAt(12, 12));

      expect(surface.committed).toHaveLength(1);
      expect(session.activeShape()).toBeNull();
    });

    it("finishes on a double click without keeping its second click", () => {
      // What a browser actually sends: the second press of the gesture
      // arrives as a mousedown carrying detail 2, and the dblclick follows
      // it. Both reach the session, and between them they must add three
      // vertices rather than four.
      session.pointerDown(pointerAt(10, 10));
      session.pointerDown(pointerAt(200, 10));
      session.pointerDown(pointerAt(200, 200));

      session.pointerDown(pointerAt(200, 200, 2));
      session.doubleClick(pointerAt(200, 200, 2));

      expect(surface.committed).toHaveLength(1);
      expect(surface.committed[0]?.points).toHaveLength(3);
    });

    it("drops the spurious vertex when only the dblclick reaches it", () => {
      // The press that precedes a dblclick can add a vertex rather than
      // finishing — a second click far enough from the first not to count as
      // closing the shape. Keeping it would put a point where the user was
      // trying to stop, not draw.
      session.pointerDown(pointerAt(10, 10));
      session.pointerDown(pointerAt(200, 10));
      session.pointerDown(pointerAt(200, 200));
      session.pointerDown(pointerAt(400, 400));

      session.doubleClick(pointerAt(400, 400, 2));

      expect(surface.committed[0]?.points).toHaveLength(3);
    });

    it("finishes on Enter", () => {
      // The primary way out: unlike a double click it does not depend on two
      // presses landing close enough together in time and space.
      session.pointerDown(pointerAt(10, 10));
      session.pointerDown(pointerAt(200, 10));
      session.pointerDown(pointerAt(200, 200));

      session.finishFromKeyboard();

      expect(surface.committed).toHaveLength(1);
    });

    it("ignores Enter before there are enough vertices to mean anything", () => {
      session.pointerDown(pointerAt(10, 10));

      session.finishFromKeyboard();

      expect(surface.committed).toEqual([]);
      expect(session.activeShape()).not.toBeNull();
    });

    it("abandons a half-drawn shape on Escape", () => {
      // Without this a shape begun by accident could not be got rid of.
      session.pointerDown(pointerAt(10, 10));
      session.pointerDown(pointerAt(200, 10));

      session.cancel();

      expect(session.activeShape()).toBeNull();
      expect(surface.committed).toEqual([]);
    });

    it("rubber-bands to the pointer between clicks", () => {
      session.pointerDown(pointerAt(10, 10));
      session.pointerDown(pointerAt(200, 10));

      session.pointerMove(pointerAt(300, 300));

      const preview = session.previewShape();
      expect(preview.points).toHaveLength(3);
      expect(preview.points?.[2]).toEqual({ x: 300, y: 300 });
    });

    it("does not keep the hovered point once the shape is finished", () => {
      // It is not a vertex — committing it would add a point the user never
      // clicked.
      session.pointerDown(pointerAt(10, 10));
      session.pointerDown(pointerAt(200, 10));
      session.pointerDown(pointerAt(200, 200));
      session.pointerMove(pointerAt(900, 900));

      session.finishFromKeyboard();

      expect(surface.committed[0]?.points).toHaveLength(3);
    });
  });

  describe("a tool that completes itself", () => {
    it("commits a radius on its second click without being told to", () => {
      // Radius and calibration take exactly two clicks. Waiting for Enter
      // after the second would be asking for a vertex that cannot exist.
      state.activeTool.set("radius");

      session.pointerDown(pointerAt(100, 100));
      session.pointerDown(pointerAt(200, 100));

      expect(session.activeShape()).toBeNull();
      expect(state.measurements()).toHaveLength(1);
    });
  });
});
