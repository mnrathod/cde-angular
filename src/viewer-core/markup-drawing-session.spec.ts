/**
 * The gesture that draws a markup shape.
 *
 * <p>This was two hand-maintained copies before — one in the PDF page, one in
 * the CAD drawing — and neither had a test. The copies carried a comment
 * saying they must not drift apart on which gestures finish a shape, which is
 * precisely the promise a test makes and a comment does not.
 *
 * <p>The surface here is a stand-in for both. What it proves is that the
 * session asks the surface for what genuinely varies (page, zoom, where a
 * finished shape goes) and decides everything else itself.
 */
import { TestBed } from "@angular/core/testing";

import {
  MarkupDrawingSession,
  MarkupSurface,
} from "./markup-drawing-session";
import { MarkupTool, ShapeData, ViewerStateService } from "./viewer-state.service";

/**
 * An overlay whose coordinate space is 1:1 with the screen, so a click at
 * (x, y) is a point at (x, y) and the arithmetic stays out of the way.
 */
function overlayElement(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 1000 1000");
  svg.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 1000, height: 1000 }) as DOMRect;
  // A 1:1 screen transform, so the close-the-shape tolerance is ten units.
  svg.getScreenCTM = () => ({ a: 1, b: 0 }) as DOMMatrix;
  return svg;
}

/** A surface that records what it was handed. */
class RecordingSurface implements MarkupSurface {
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
function pointerAt(x: number, y: number, clickDetail = 1): MouseEvent {
  return new MouseEvent("mousedown", {
    clientX: x,
    clientY: y,
    detail: clickDetail,
  });
}

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
