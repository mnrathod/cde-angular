/**
 * Measuring on a drawing, and annotating it with words.
 *
 * <p>Both differ from the shape tools in the same way: what they produce
 * carries a value the user reads, so a gesture that draws correctly and
 * computes the wrong number, or loses the text, looks entirely right.
 */
import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MarkupEngineService } from "./markup-engine.service";
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

  describe("measurements", () => {
    it("records a dimension rather than handing it to the surface", () => {
      // A measurement is a reading as well as a drawing, and the session owns
      // that so a drawing and a document cannot report differently.
      state.activeTool.set("dimension");

      session.pointerDown(pointerAt(0, 0));
      session.pointerDown(pointerAt(300, 0));
      session.finishFromKeyboard();

      expect(state.measurements()).toHaveLength(1);
      expect(surface.committed).toEqual([]);
    });

    it("files the measurement under the surface's page", () => {
      surface.pageNumber = 9;
      state.activeTool.set("dimension");

      session.pointerDown(pointerAt(0, 0));
      session.pointerDown(pointerAt(300, 0));
      session.finishFromKeyboard();

      expect(state.measurements()[0]?.page).toBe(9);
    });

    it("hands a calibration's length to the toolbar and draws nothing", () => {
      // Calibration defines the scale rather than recording a measurement.
      state.activeTool.set("calibrate");

      session.pointerDown(pointerAt(0, 0));
      session.pointerDown(pointerAt(400, 0));

      expect(state.pendingCalibrationPixels()).toBeCloseTo(400);
      expect(state.measurements()).toEqual([]);
      expect(surface.committed).toEqual([]);
    });

    it("measures in the surface's own pixels, not the magnified ones", () => {
      // Otherwise a scale calibrated at 200% is half what it should be, and
      // every measurement taken afterwards is wrong.
      surface.zoom = 2;
      state.activeTool.set("calibrate");

      session.pointerDown(pointerAt(0, 0));
      session.pointerDown(pointerAt(400, 0));

      expect(state.pendingCalibrationPixels()).toBeCloseTo(200);
    });

    it("survives a surface reporting no zoom at all", () => {
      // Dividing by zero would put Infinity into the scale and every
      // measurement after it would read NaN.
      surface.zoom = 0;
      state.activeTool.set("calibrate");

      session.pointerDown(pointerAt(0, 0));
      session.pointerDown(pointerAt(400, 0));

      expect(state.pendingCalibrationPixels()).toBeCloseTo(400);
    });
  });

  describe("text annotations", () => {
    const tools: MarkupTool[] = ["stamp", "note", "callout", "text"];

    afterEach(() => vi.unstubAllGlobals());

    it("asks for words and commits a shape carrying them", () => {
      vi.stubGlobal("prompt", () => "FOR CONSTRUCTION");
      state.activeTool.set("stamp");

      session.pointerDown(pointerAt(50, 50));

      expect(surface.committed[0]?.text).toBe("FOR CONSTRUCTION");
    });

    it("places nothing when the prompt is dismissed", () => {
      vi.stubGlobal("prompt", () => null);
      state.activeTool.set("note");

      session.pointerDown(pointerAt(50, 50));

      expect(surface.committed).toEqual([]);
    });

    it("places nothing for an answer of only spaces", () => {
      // An empty annotation is invisible on the page and impossible to select,
      // so it can never be removed again.
      vi.stubGlobal("prompt", () => "   ");
      state.activeTool.set("note");

      session.pointerDown(pointerAt(50, 50));

      expect(surface.committed).toEqual([]);
    });

    it("asks a different question for each kind of annotation", () => {
      // These four strings were hardcoded English in both components and
      // invisible to a sweep that only reads templates.
      const asked: string[] = [];
      vi.stubGlobal("prompt", (question: string) => {
        asked.push(question);
        return "";
      });

      for (const tool of tools) {
        state.activeTool.set(tool);
        // `pointerUp` as well as down, because a callout is asked for at the
        // end of its drag rather than at the start — see the callout group
        // below. The other three ask on the click and ignore the release.
        session.pointerDown(pointerAt(50, 50));
        session.pointerUp();
      }

      expect(new Set(asked).size).toBe(tools.length);
      expect(asked.every((question) => question.trim().length > 0)).toBe(true);
    });

    /**
     * A callout is the one text tool with two positions — the anchor on the
     * feature and the label somewhere clear of it — so it is the one placed by
     * dragging rather than by a single click.
     *
     * <p>It used to be routed by `isTextTool`, which answers a different
     * question, and so was placed by a click like the other three. That left
     * every label at the fixed offset `startShape` seeds it with: on a crowded
     * drawing usually on top of the detail being annotated, near a page edge
     * off the page, and no gesture moved it.
     */
    describe("a callout's label", () => {
      beforeEach(() => vi.stubGlobal("prompt", () => "SEE DETAIL B"));

      it("lands where the drag ended", () => {
        state.activeTool.set("callout");

        dragFrom(100, 100, 300, 40);

        const callout = surface.committed[0]!;
        expect(callout.x2).toBe(300);
        expect(callout.y2).toBe(40);
      });

      it("leaves the anchor on the feature the drag started from", () => {
        // The anchor is the point the leader line comes from. If the drag moved
        // it too, the callout would stop pointing at anything.
        state.activeTool.set("callout");

        dragFrom(100, 100, 300, 40);

        const callout = surface.committed[0]!;
        expect(callout.x).toBe(100);
        expect(callout.y).toBe(100);
      });

      it("still falls back to the seeded offset for a click that never moves", () => {
        // Placing a callout with a plain click worked before the drag existed
        // and has to keep working, or the change breaks the gesture it extends.
        state.activeTool.set("callout");

        session.pointerDown(pointerAt(100, 100));
        session.pointerUp();

        const callout = surface.committed[0]!;
        expect(callout.x2).toBe(180);
        expect(callout.y2).toBe(60);
      });

      it("asks for the words after the drag, not before it", () => {
        // The prompt is modal, so asking on pointerDown would block the drag
        // that positions the label — the label could then only ever sit at the
        // seeded offset, which is the defect this replaced. Asserted as an
        // order of events rather than an end state, because a stubbed prompt
        // returns instantly and so leaves the end state identical either way.
        const order: string[] = [];
        const engine = TestBed.inject(MarkupEngineService);
        const realUpdate = engine.updateShape.bind(engine);
        vi.spyOn(engine, "updateShape").mockImplementation((shape, point) => {
          order.push("positioned");
          return realUpdate(shape, point);
        });
        vi.stubGlobal("prompt", () => {
          order.push("asked");
          return "SEE DETAIL B";
        });
        state.activeTool.set("callout");

        dragFrom(100, 100, 300, 40);

        expect(order).toEqual(["positioned", "asked"]);
        expect(surface.committed[0]?.text).toBe("SEE DETAIL B");
      });

      it("places nothing when the prompt is dismissed after the drag", () => {
        state.activeTool.set("callout");
        vi.stubGlobal("prompt", () => null);

        dragFrom(100, 100, 300, 40);

        expect(surface.committed).toEqual([]);
      });
    });

    it("does not leave the drag flag set behind a text tool", () => {
      // It would make the next release commit whatever was last drawn.
      vi.stubGlobal("prompt", () => null);
      state.activeTool.set("note");
      session.pointerDown(pointerAt(50, 50));

      session.pointerUp();

      expect(surface.committed).toEqual([]);
    });
  });
});
