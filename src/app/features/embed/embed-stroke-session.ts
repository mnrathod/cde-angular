/**
 * Drawing one markup stroke on an embedded page, from press to finish.
 *
 * <p>`viewer-core/markup-drawing-session.ts` is the same gesture for the
 * full viewer's two surfaces, and is where this belongs eventually. It is
 * not adopted here yet for one concrete reason: its text tools ask for their
 * words with `prompt()`, and a host may frame the viewer in a sandbox
 * without `allow-modals`, where `prompt` returns null or throws. Swapping it
 * in is a behaviour change that needs testing against a real host frame, and
 * the embed has never run inside one on an installed deployment.
 *
 * <p>So: the narrower session, with the reason written down rather than a
 * silent second copy. What is shared already — the shape maths — is shared;
 * what differs is the gesture's edges.
 */
import { Injectable, inject, signal } from "@angular/core";

import { MarkupEngineService } from "../../../viewer-core/markup-engine.service";
import { ShapeData, ViewerStateService } from "../../../viewer-core/viewer-state.service";

/** The page a stroke is being drawn on. */
export interface EmbedStrokeSurface {
  readonly overlay: SVGSVGElement;
  readonly pageNumber: number;
}

@Injectable()
export class EmbedStrokeSession {
  private markup = inject(MarkupEngineService);
  private state = inject(ViewerStateService);

  /** The shape being drawn, or null between gestures. */
  readonly inProgress = signal<ShapeData | null>(null);

  /** Whether the tool in hand draws, as opposed to panning or selecting. */
  acceptsDrawing(): boolean {
    const tool = this.state.activeTool();
    return tool !== "pan" && tool !== "select";
  }

  begin(event: PointerEvent, surface: EmbedStrokeSurface): void {
    if (!this.acceptsDrawing()) return;

    surface.overlay.setPointerCapture(event.pointerId);
    const point = this.markup.getSvgPoint(event as unknown as MouseEvent, surface.overlay);

    this.inProgress.set(this.markup.startShape(
      this.state.activeTool(),
      point,
      surface.pageNumber,
      this.state.strokeColor(),
      this.state.strokeWidth(),
      this.state.fillOpacity(),
      // No author. §6.2: the host stamps that from its own session, and a
      // name put here would be the browser's claim about its own user.
    ));
  }

  extend(event: PointerEvent, surface: EmbedStrokeSurface): void {
    const drawing = this.inProgress();
    if (!drawing) return;

    const point = this.markup.getSvgPoint(event as unknown as MouseEvent, surface.overlay);
    this.inProgress.set(this.markup.updateShape(drawing, point));
  }

  /**
   * Finishes the gesture.
   *
   * @returns the shape to tell the host about, or null when there is none.
   *   A click that never moved is not a shape: emitting it would put an
   *   invisible zero-size markup in the host's store for every stray tap.
   */
  end(): ShapeData | null {
    const finished = this.inProgress();
    this.inProgress.set(null);
    if (!finished || !this.markup.hasMinimumSize(finished)) return null;

    this.state.addShape(finished);
    return finished;
  }
}
