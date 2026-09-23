/**
 * Measuring on a drawing, and annotating it with words.
 *
 * <p>Both differ from the shape tools in the same way: what they produce
 * carries a value the user reads, so a gesture that draws correctly and
 * computes the wrong number, or loses the text, looks entirely right.
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
        session.pointerDown(pointerAt(50, 50));
      }

      expect(new Set(asked).size).toBe(tools.length);
      expect(asked.every((question) => question.trim().length > 0)).toBe(true);
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
