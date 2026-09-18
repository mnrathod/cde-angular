/**
 * Drawing a markup shape with a pointer: the gesture, from first press to
 * finished shape.
 *
 * <p>This was written twice, once in the PDF page and once in the CAD
 * drawing, and the copy in each carried a comment saying the two must not
 * drift apart on which gestures work. Two hand-maintained copies of a state
 * machine is not a way to keep that promise — a fix applied to one is a
 * difference in behaviour between a drawing and a document, which is exactly
 * the kind of thing nobody reports and everybody works around.
 *
 * <p>What stays with the surface is what genuinely differs: which element the
 * pointer is measured against, which page a shape belongs to, what the zoom
 * is, and where a finished shape goes — a PDF page has redactions and form
 * fields to route, a CAD drawing has neither.
 *
 * <p>Provided per component rather than once for the application: a session
 * holds the half-drawn shape, and two surfaces sharing one would each see the
 * other's.
 */
import { Injectable, inject, signal } from "@angular/core";

import { MarkupEngineService, PointerPoint } from "./markup-engine.service";
import { MeasurementService } from "./measurement.service";
import { MarkupTool, ShapeData, ViewerStateService } from "./viewer-state.service";

/** The thing being drawn on. */
export interface MarkupSurface {
  /** The overlay a pointer position is measured against. */
  readonly overlay: SVGSVGElement;
  /** Which page a shape drawn here belongs to. A CAD drawing is always 1. */
  readonly pageNumber: number;
  /** Current magnification, which measurements are divided by. */
  readonly zoom: number;
  /** Whether a drawing tool is active here right now. */
  readonly acceptsDrawing: boolean;
  /**
   * Takes a finished shape. The surface decides where it goes — most are
   * simply added, but a PDF page routes redactions and form fields elsewhere.
   */
  commit(shape: ShapeData): void;
}

/** Tools that produce a reading rather than a drawing. */
const MEASUREMENT_TOOLS: readonly MarkupTool[] = [
  "dimension",
  "area",
  "radius",
  "calibrate",
];

@Injectable()
export class MarkupDrawingSession {
  private markup = inject(MarkupEngineService);
  private measure = inject(MeasurementService);
  private state = inject(ViewerStateService);

  /** The shape being drawn, or null between gestures. */
  readonly activeShape = signal<ShapeData | null>(null);

  private surface: MarkupSurface | null = null;
  private dragging = false;
  /** Where the pointer is between vertex clicks, for the rubber band. */
  private hover: PointerPoint | null = null;

  /** Told once, by the component that owns this session. */
  attachTo(surface: MarkupSurface): void {
    this.surface = surface;
  }

  pointerDown(event: MouseEvent | TouchEvent): void {
    const surface = this.surface;
    if (!surface?.acceptsDrawing) return;

    const tool = this.state.activeTool();
    const point = this.markup.getSvgPoint(event, surface.overlay);

    if (this.markup.isTextTool(tool)) {
      this.drawTextShape(point, tool, surface);
      return;
    }
    if (this.markup.isVertexTool(tool)) {
      // Click-driven: never sets `dragging`, so pointerUp is a no-op.
      this.addOrFinishVertex(point, tool, (event as MouseEvent).detail ?? 1);
      return;
    }

    this.dragging = true;
    this.activeShape.set(this.startShape(tool, point, surface));
  }

  pointerMove(event: MouseEvent | TouchEvent): void {
    const active = this.activeShape();
    const surface = this.surface;
    if (!active || !surface) return;

    const point = this.markup.getSvgPoint(event, surface.overlay);
    if (this.markup.isVertexTool(active.tool)) {
      // Rubber band only; vertices are committed by clicking.
      this.hover = point;
      return;
    }
    if (!this.dragging) return;
    this.activeShape.set(this.markup.updateShape(active, point));
  }

  pointerUp(): void {
    const shape = this.activeShape();
    if (!this.dragging || !shape) return;

    this.dragging = false;
    this.activeShape.set(null);
    if (this.markup.hasMinimumSize(shape)) this.surface?.commit(shape);
  }

  doubleClick(event: MouseEvent): void {
    const shape = this.activeShape();
    if (!shape || !this.markup.isVertexTool(shape.tool)) return;
    event.preventDefault();
    // The second click of the gesture already added a vertex — drop it.
    this.finish(this.markup.removeLastVertex(shape));
  }

  /**
   * Finish from the keyboard. Enter is the primary way out: unlike a
   * double-click it does not depend on two presses landing close enough
   * together in time and space to be recognised as one gesture.
   */
  finishFromKeyboard(): void {
    const shape = this.activeShape();
    if (!this.markup.canFinish(shape)) return;
    this.finish(shape!);
  }

  /** Abandon a half-drawn shape. Without this it could not be got rid of. */
  cancel(): void {
    const shape = this.activeShape();
    if (!shape || !this.markup.isVertexTool(shape.tool)) return;
    this.activeShape.set(null);
    this.hover = null;
  }

  /**
   * What to render while drawing: the shape with the pointer's current
   * position appended, so a polygon rubber-bands between clicks.
   */
  previewShape(): ShapeData {
    return this.markup.withPreviewPoint(this.activeShape()!, this.hover);
  }

  private startShape(
    tool: MarkupTool,
    point: PointerPoint,
    surface: MarkupSurface,
  ): ShapeData {
    return this.markup.startShape(
      tool,
      point,
      surface.pageNumber,
      this.state.strokeColor(),
      this.state.strokeWidth(),
      this.state.fillOpacity(),
      "current-user",
    );
  }

  private addOrFinishVertex(
    point: PointerPoint,
    tool: MarkupTool,
    clickDetail: number,
  ): void {
    const surface = this.surface!;
    const current = this.activeShape();
    const tolerance = this.markup.toleranceInUserUnits(surface.overlay);

    // One decision covers every way of ending the shape, so no two surfaces
    // can disagree about which gestures work.
    if (
      current?.tool === tool &&
      this.markup.finishesShape(current, point, tolerance, clickDetail)
    ) {
      this.finish(current);
      return;
    }

    const shape =
      current?.tool === tool
        ? this.markup.addVertex(current, point)
        : this.startShape(tool, point, surface);

    // Radius and calibration take exactly two clicks and complete themselves.
    const required = this.markup.requiredVertices(tool);
    if (required !== null && (shape.points?.length ?? 0) >= required) {
      this.finish(shape);
      return;
    }
    this.activeShape.set(shape);
  }

  private finish(shape: ShapeData): void {
    this.hover = null;
    this.activeShape.set(null);
    if (!this.markup.hasMinimumSize(shape)) return;

    if (MEASUREMENT_TOOLS.includes(shape.tool)) {
      this.recordMeasurement(shape);
      return;
    }
    this.surface?.commit(shape);
  }

  /**
   * Turns a drawn measurement into its readouts.
   *
   * <p>Lengths are computed in surface pixels first and then scaled, so a
   * calibration applied later cannot change what was already measured.
   */
  private recordMeasurement(shape: ShapeData): void {
    const surface = this.surface!;
    const zoom = surface.zoom || 1;

    if (shape.tool === "calibrate") {
      // Calibration is not a measurement — it defines the scale, so it hands
      // its drawn length to the toolbar and draws nothing.
      this.state.pendingCalibrationPixels.set(
        this.measure.pathLength(shape.points ?? []) / zoom,
      );
      return;
    }

    const { shape: described, entry } = this.measure.describe(
      shape,
      this.state.measurementScale(),
      zoom,
    );
    this.state.addShape(described);
    this.state.addMeasurement({
      ...entry,
      id: shape.id,
      page: surface.pageNumber,
    });
  }

  private drawTextShape(
    point: PointerPoint,
    tool: MarkupTool,
    surface: MarkupSurface,
  ): void {
    this.dragging = false;
    const text = this.askForText(tool);
    if (!text?.trim()) return;

    const shape = this.markup.startShape(
      tool,
      point,
      surface.pageNumber,
      this.state.strokeColor(),
      this.state.strokeWidth(),
      0,
    );
    surface.commit({ ...shape, text });
  }

  /**
   * Asks for the words that go in a text shape.
   *
   * <p>A native prompt, which is what both surfaces used before this, and
   * what they still use: replacing it is a change to the drawing experience
   * rather than to where this code lives. It is at least translated now —
   * these four strings were hardcoded English in both components, invisible
   * to a sweep that only reads templates.
   */
  private askForText(tool: MarkupTool): string | null {
    return prompt(textPromptFor(tool));
  }
}

/** What to ask for, named for the kind of annotation being placed. */
function textPromptFor(tool: MarkupTool): string {
  switch (tool) {
    case "stamp":
      return $localize`:Asks for the words to put in a stamp — a short mark such as APPROVED placed on a drawing@@markupPrompt.stamp:Stamp text:`;
    case "note":
      return $localize`:Asks for the words to put in a sticky note attached to a drawing@@markupPrompt.note:Sticky note:`;
    case "callout":
      return $localize`:Asks for the words to put in a callout — a label with a leader line pointing at something@@markupPrompt.callout:Callout text:`;
    default:
      return $localize`:Asks for the words to put in a text annotation@@markupPrompt.annotation:Enter annotation text:`;
  }
}
