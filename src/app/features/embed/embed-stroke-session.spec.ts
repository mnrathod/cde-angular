/**
 * One stroke on an embedded page.
 *
 * <p>The edges are what matter here, because the host is on the other side
 * of them: a tap that never moved must not become an invisible zero-size
 * markup in someone's document store, and a finished shape must carry no
 * author — §6.2 puts that stamp on the host, and a name written here would
 * be the browser's claim about its own user.
 */
import { TestBed } from "@angular/core/testing";

import { ViewerStateService } from "../../../viewer-core/viewer-state.service";
import { EmbedStrokeSession, EmbedStrokeSurface } from "./embed-stroke-session";

function surfaceOn(pageNumber = 1): EmbedStrokeSurface {
  const overlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  // jsdom has no pointer capture and no SVG geometry; both are stubbed to
  // what the session actually asks of them.
  overlay.setPointerCapture = () => undefined;
  (overlay as unknown as { createSVGPoint: () => unknown }).createSVGPoint = () => ({
    x: 0, y: 0,
    matrixTransform: () => ({ x: 10, y: 20 }),
  });
  (overlay as unknown as { getScreenCTM: () => unknown }).getScreenCTM = () => ({
    inverse: () => ({}),
  });
  return { overlay, pageNumber };
}

function press(x = 0, y = 0): PointerEvent {
  return new PointerEvent("pointerdown", { clientX: x, clientY: y, pointerId: 1 });
}

describe("drawing one stroke in an embed", () => {
  let strokes: EmbedStrokeSession;
  let state: ViewerStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ViewerStateService, EmbedStrokeSession],
    });
    strokes = TestBed.inject(EmbedStrokeSession);
    state = TestBed.inject(ViewerStateService);
    state.activeTool.set("rect");
  });

  it("does not start a stroke while the pan tool is in hand", () => {
    state.activeTool.set("pan");

    strokes.begin(press(), surfaceOn());

    expect(strokes.inProgress()).toBeNull();
  });

  it("does not start a stroke while the select tool is in hand", () => {
    state.activeTool.set("select");

    strokes.begin(press(), surfaceOn());

    expect(strokes.inProgress()).toBeNull();
  });

  it("starts one with a drawing tool in hand", () => {
    strokes.begin(press(), surfaceOn());

    expect(strokes.inProgress()).not.toBeNull();
  });

  it("puts the shape on the page it was drawn on", () => {
    strokes.begin(press(), surfaceOn(4));

    expect(strokes.inProgress()?.pageNumber).toBe(4);
  });

  it("gives a finished shape no author", () => {
    // §6.2: the host stamps that from its own session.
    const surface = surfaceOn();
    strokes.begin(press(), surface);
    strokes.extend(new PointerEvent("pointermove", { clientX: 80, clientY: 90 }), surface);

    const finished = strokes.end();

    expect(finished?.author).toBeUndefined();
  });

  it("reports nothing for a tap that never moved", () => {
    // Emitting it would put an invisible zero-size markup in the host's
    // store for every stray tap.
    strokes.begin(press(), surfaceOn());

    expect(strokes.end()).toBeNull();
  });

  it("does not add a tap that never moved to the document either", () => {
    const before = state.shapes().length;
    strokes.begin(press(), surfaceOn());

    strokes.end();

    expect(state.shapes()).toHaveLength(before);
  });

  it("clears the half-drawn shape once the gesture ends", () => {
    strokes.begin(press(), surfaceOn());

    strokes.end();

    expect(strokes.inProgress()).toBeNull();
  });

  it("ignores a move with no gesture under way", () => {
    const surface = surfaceOn();

    strokes.extend(new PointerEvent("pointermove"), surface);

    expect(strokes.inProgress()).toBeNull();
  });
});
