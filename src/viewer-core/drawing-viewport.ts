/**
 * Moving around a drawing: panning, zooming, rotating and finding a hit.
 *
 * <p>Out of the viewer component because it is arithmetic against two
 * elements and a zoom, and none of it is about rendering a drawing.
 *
 * <p>The drawing is positioned by the scroll offset of its container rather
 * than by a translate of its own, so the scrollbars, the wheel and a drag all
 * move the same thing and cannot disagree. An earlier pair of panX/panY
 * signals fed the transform but were never assigned by anything, so the grab
 * cursor promised a drag that did nothing at all.
 */
import { Injectable, computed, inject, signal } from "@angular/core";

import { ViewerStateService } from "./viewer-state.service";
import { sizeOfViewBox } from "./cad-layers";

/** The two elements the viewport moves. Absent until the view exists. */
export interface ViewportElements {
  /** The scrolling box the drawing sits in. */
  container?: HTMLElement;
  /** The transformed box holding the drawing and its markup. */
  wrap?: HTMLElement;
}

/** The furthest in and out a wheel gesture may take the drawing. */
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 10;
const WHEEL_ZOOM_STEP = 0.1;

@Injectable()
export class DrawingViewport {
  private state = inject(ViewerStateService);

  /** The drawing's own coordinate space, as its viewBox declares it. */
  readonly viewBox = signal("0 0 800 600");

  private elements: () => ViewportElements = () => ({});
  private panOrigin: { x: number; y: number; left: number; top: number } | null =
    null;

  /**
   * A signal rather than a check on panOrigin: the cursor is a computed, and
   * a computed cannot see a plain field change, so the grab/grabbing swap
   * would never render.
   */
  private readonly panning = signal(false);

  /** Told once, by the component that owns this viewport. */
  bindTo(elements: () => ViewportElements): void {
    this.elements = elements;
  }

  readonly containerCursor = computed(() =>
    this.state.activeTool() !== "pan"
      ? "default"
      : this.panning()
        ? "grabbing"
        : "grab",
  );

  /** Width and height of the drawing's own coordinate space. */
  private readonly contentSize = computed<[number, number]>(() =>
    sizeOfViewBox(this.viewBox()),
  );

  readonly transform = computed(() => {
    const rotation = this.state.rotation();
    const base = `scale(${this.state.zoom()})`;
    if (!rotation) return base;

    // The wrapper's transform-origin is top-left (which pan/zoom rely on), so
    // rotating about it swings the drawing outside the viewport. Shifting by
    // the rotated content's own extent brings it back to the origin.
    const [width, height] = this.contentSize();
    const shift =
      rotation === 90
        ? `translate(${height}px, 0)`
        : rotation === 180
          ? `translate(${width}px, ${height}px)`
          : `translate(0, ${width}px)`;
    // Composed with pan/zoom so rotation applies to the drawing and its
    // markup overlay together, keeping annotations pinned.
    return `${base} ${shift} rotate(${rotation}deg)`;
  });

  startPan(event: MouseEvent): void {
    if (this.state.activeTool() !== "pan") return;
    const container = this.elements().container;
    if (!container) return;

    this.panOrigin = {
      x: event.clientX,
      y: event.clientY,
      left: container.scrollLeft,
      top: container.scrollTop,
    };
    this.panning.set(true);
    event.preventDefault();
  }

  continuePan(event: MouseEvent): void {
    const container = this.elements().container;
    if (!this.panOrigin || !container) return;
    container.scrollLeft =
      this.panOrigin.left - (event.clientX - this.panOrigin.x);
    container.scrollTop = this.panOrigin.top - (event.clientY - this.panOrigin.y);
  }

  endPan(): void {
    this.panOrigin = null;
    this.panning.set(false);
  }

  /** Ctrl and the wheel zooms; the wheel alone scrolls, as it should. */
  zoomWithWheel(event: WheelEvent): void {
    event.preventDefault();
    if (!event.ctrlKey) return;
    const delta = event.deltaY > 0 ? -WHEEL_ZOOM_STEP : WHEEL_ZOOM_STEP;
    this.state.zoom.update((zoom) =>
      Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom + delta)),
    );
  }

  /** Centres the drawing horizontally and returns to the top. */
  recentre(): void {
    const container = this.elements().container;
    if (!container) return;
    container.scrollTop = 0;
    container.scrollLeft = (container.scrollWidth - container.clientWidth) / 2;
  }

  /**
   * Centres a point of the drawing in the viewport.
   *
   * <p>The drawing is laid out at its natural size and then scaled by a CSS
   * transform, which does not change the layout box — so the scroll offset a
   * drawing coordinate corresponds to has to be worked out from the viewBox
   * and the zoom rather than read off the element.
   */
  scrollTo(target: { x: number; y: number }): void {
    const { container, wrap } = this.elements();
    if (!container || !wrap) return;

    const [viewBoxWidth, viewBoxHeight] = this.contentSize();
    const zoom = this.state.zoom();
    const scaleX = (wrap.offsetWidth / viewBoxWidth) * zoom;
    const scaleY = (wrap.offsetHeight / viewBoxHeight) * zoom;

    container.scrollLeft = target.x * scaleX - container.clientWidth / 2;
    container.scrollTop = target.y * scaleY - container.clientHeight / 2;
  }
}
