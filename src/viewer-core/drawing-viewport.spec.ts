/**
 * Moving around a drawing.
 *
 * <p>The rotation shift is the part worth pinning. The wrapper's
 * transform-origin is its top-left corner, which pan and zoom both rely on,
 * so rotating about it swings the drawing bodily out of the viewport — on a
 * quarter turn the whole thing sits above the top edge with no scrollbar
 * that reaches it. The drawing is still there, correctly rotated, and
 * entirely unreachable.
 */
import { TestBed } from "@angular/core/testing";

import { DrawingViewport } from "./drawing-viewport";
import { ViewerStateService } from "./viewer-state.service";

/** A landscape A1 sheet in its own units. */
const SHEET = "0 0 841 594";

function viewportFor(viewBox = SHEET) {
  TestBed.configureTestingModule({
    providers: [DrawingViewport, ViewerStateService],
  });
  const viewport = TestBed.inject(DrawingViewport);
  const state = TestBed.inject(ViewerStateService);
  viewport.viewBox.set(viewBox);
  return { viewport, state };
}

function boxes() {
  const container = document.createElement("div");
  const wrap = document.createElement("div");
  // jsdom lays nothing out, so the sizes the arithmetic reads are set here.
  Object.defineProperties(container, {
    clientWidth: { value: 800 },
    clientHeight: { value: 600 },
    scrollWidth: { value: 2000 },
  });
  Object.defineProperties(wrap, {
    offsetWidth: { value: 841 },
    offsetHeight: { value: 594 },
  });
  container.appendChild(wrap);
  return { container, wrap };
}

describe("the drawing viewport", () => {
  describe("what the cursor promises", () => {
    it("offers a grab only when the pan tool is chosen", () => {
      const { viewport, state } = viewportFor();
      state.activeTool.set("rect");

      expect(viewport.containerCursor()).toBe("default");
    });

    it("closes the hand while a drag is in progress", () => {
      const { viewport, state } = viewportFor();
      state.activeTool.set("pan");
      const elements = boxes();
      viewport.bindTo(() => elements);

      expect(viewport.containerCursor()).toBe("grab");
      viewport.startPan(new MouseEvent("mousedown", { clientX: 10, clientY: 10 }));
      expect(viewport.containerCursor()).toBe("grabbing");
      viewport.endPan();
      expect(viewport.containerCursor()).toBe("grab");
    });
  });

  describe("dragging the drawing", () => {
    it("moves the drawing the way the pointer went", () => {
      const { viewport, state } = viewportFor();
      state.activeTool.set("pan");
      const elements = boxes();
      elements.container.scrollLeft = 500;
      elements.container.scrollTop = 300;
      viewport.bindTo(() => elements);

      viewport.startPan(new MouseEvent("mousedown", { clientX: 100, clientY: 100 }));
      viewport.continuePan(new MouseEvent("mousemove", { clientX: 140, clientY: 130 }));

      // Dragging right by 40 brings earlier content into view, so the scroll
      // offset falls. Getting this sign wrong makes the drawing run away
      // from the pointer.
      expect(elements.container.scrollLeft).toBe(460);
      expect(elements.container.scrollTop).toBe(270);
    });

    it("ignores a drag when another tool is chosen", () => {
      // Otherwise drawing a rectangle would also pan the sheet under it.
      const { viewport, state } = viewportFor();
      state.activeTool.set("rect");
      const elements = boxes();
      elements.container.scrollLeft = 500;
      viewport.bindTo(() => elements);

      viewport.startPan(new MouseEvent("mousedown", { clientX: 100, clientY: 100 }));
      viewport.continuePan(new MouseEvent("mousemove", { clientX: 140, clientY: 100 }));

      expect(elements.container.scrollLeft).toBe(500);
    });

    it("stops moving once the button is released", () => {
      const { viewport, state } = viewportFor();
      state.activeTool.set("pan");
      const elements = boxes();
      elements.container.scrollLeft = 500;
      viewport.bindTo(() => elements);
      viewport.startPan(new MouseEvent("mousedown", { clientX: 100, clientY: 100 }));

      viewport.endPan();
      viewport.continuePan(new MouseEvent("mousemove", { clientX: 300, clientY: 100 }));

      expect(elements.container.scrollLeft).toBe(500);
    });
  });

  describe("the wheel", () => {
    it("zooms while ctrl is held", () => {
      const { viewport, state } = viewportFor();
      state.zoom.set(1);

      viewport.zoomWithWheel(new WheelEvent("wheel", { deltaY: -100, ctrlKey: true }));

      expect(state.zoom()).toBeCloseTo(1.1);
    });

    it("leaves the zoom alone without ctrl, so scrolling still scrolls", () => {
      const { viewport, state } = viewportFor();
      state.zoom.set(1);

      viewport.zoomWithWheel(new WheelEvent("wheel", { deltaY: -100 }));

      expect(state.zoom()).toBe(1);
    });

    it("will not zoom out past the point of vanishing", () => {
      const { viewport, state } = viewportFor();
      state.zoom.set(0.1);

      viewport.zoomWithWheel(new WheelEvent("wheel", { deltaY: 100, ctrlKey: true }));

      expect(state.zoom()).toBe(0.1);
    });

    it("will not zoom in without limit", () => {
      const { viewport, state } = viewportFor();
      state.zoom.set(10);

      viewport.zoomWithWheel(new WheelEvent("wheel", { deltaY: -100, ctrlKey: true }));

      expect(state.zoom()).toBe(10);
    });
  });

  describe("the transform", () => {
    it("is just the zoom when the sheet is upright", () => {
      const { viewport, state } = viewportFor();
      state.zoom.set(1.5);

      expect(viewport.transform()).toBe("scale(1.5)");
    });

    it("shifts a quarter turn back into the viewport", () => {
      // Without the shift the rotated sheet sits above the top edge, with no
      // scrollbar that reaches it.
      const { viewport, state } = viewportFor();
      state.rotation.set(90);

      expect(viewport.transform()).toContain("translate(594px, 0)");
      expect(viewport.transform()).toContain("rotate(90deg)");
    });

    it("shifts a half turn by both extents", () => {
      const { viewport, state } = viewportFor();
      state.rotation.set(180);

      expect(viewport.transform()).toContain("translate(841px, 594px)");
    });

    it("keeps the zoom in front of the rotation", () => {
      // Order matters: the scale has to apply to the rotated content, or the
      // markup overlay stops lining up with the drawing underneath it.
      const { viewport, state } = viewportFor();
      state.zoom.set(2);
      state.rotation.set(90);

      expect(viewport.transform().indexOf("scale(2)"))
        .toBeLessThan(viewport.transform().indexOf("rotate(90deg)"));
    });
  });

  describe("finding something on the sheet", () => {
    it("centres a search hit rather than putting it at the edge", () => {
      const { viewport, state } = viewportFor();
      state.zoom.set(1);
      const elements = boxes();
      viewport.bindTo(() => elements);

      viewport.scrollTo({ x: 500, y: 400 });

      // 500 * (841/841) - 800/2
      expect(elements.container.scrollLeft).toBe(100);
      expect(elements.container.scrollTop).toBe(100);
    });

    it("does nothing at all before the view exists", () => {
      const { viewport } = viewportFor();

      expect(() => viewport.scrollTo({ x: 10, y: 10 })).not.toThrow();
      expect(() => viewport.recentre()).not.toThrow();
    });

    it("recentres horizontally and returns to the top", () => {
      const { viewport } = viewportFor();
      const elements = boxes();
      elements.container.scrollTop = 400;
      viewport.bindTo(() => elements);

      viewport.recentre();

      expect(elements.container.scrollTop).toBe(0);
      expect(elements.container.scrollLeft).toBe(600);
    });
  });
});
