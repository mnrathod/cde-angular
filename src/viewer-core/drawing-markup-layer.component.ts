/**
 * The layer a person draws on, over a converted drawing.
 *
 * <p>Sits in the drawing's own coordinate space, so annotations stay pinned
 * to the drawing itself while it is panned, zoomed and rotated.
 *
 * <p>Separate from the viewer for the same reason the PDF's overlay is
 * separate from its page: one owns a gesture and where a finished shape
 * goes, the other owns what is underneath. A drawing is a single page, so
 * everything here belongs to page 1 — which is the whole of the difference
 * between this and the PDF's version.
 */
import {
  AfterViewInit, ChangeDetectionStrategy, Component, ElementRef,
  HostListener, Input, ViewChild, computed, inject,
} from "@angular/core";

import { MarkupShapesComponent } from "./markup-shapes.component";
import {
  MarkupDrawingSession, MarkupSurface,
} from "./markup-drawing-session";
import { ShapeData, ViewerStateService } from "./viewer-state.service";

/** A drawing is a single page, so everything belongs to page 1. */
const DRAWING_PAGE = 1;

@Component({
  selector: "app-drawing-markup-layer",
  standalone: true,
  imports: [MarkupShapesComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [MarkupDrawingSession],
  styles: [`:host { display: contents; }`],
  template: `
    <svg #markupSvg
      class="absolute top-0 left-0 w-full h-full"
      [attr.viewBox]="viewBox"
      [style.cursor]="cursorStyle()"
      [style.pointer-events]="acceptsDrawing ? 'auto' : 'none'"
      (mousedown)="session.pointerDown($event)"
      (mousemove)="session.pointerMove($event)"
      (mouseup)="session.pointerUp()"
      (dblclick)="session.doubleClick($event)"
      (touchstart)="session.pointerDown($event); $event.preventDefault()"
      (touchmove)="session.pointerMove($event); $event.preventDefault()"
      (touchend)="session.pointerUp()">

      <!-- Saved and in-progress shapes -->
      <g markupShapes [shapes]="shapesOnDrawing()"></g>
      @if (session.activeShape()) {
        <g markupShapes [shapes]="[session.previewShape()]"></g>
      }

      <!--
        The search hit. A result list that only names the text leaves the
        reader to find it by eye on a drawing that may hold hundreds of
        labels, so the match is marked where it sits.
      -->
      @if (state.searchFocus(); as hit) {
        <rect [attr.x]="hit.x - 2" [attr.y]="hit.y - hit.height"
              [attr.width]="hit.width + 4" [attr.height]="hit.height + 4"
              fill="#facc1566" stroke="#f59e0b" stroke-width="1.5"
              rx="2" pointer-events="none"/>
      }
    </svg>
  `,
})
export class DrawingMarkupLayerComponent implements AfterViewInit, MarkupSurface {
  /** The drawing's own coordinate space, taken from its viewBox. */
  @Input() viewBox = "0 0 800 600";

  @ViewChild("markupSvg") svg!: ElementRef<SVGSVGElement>;

  state = inject(ViewerStateService);
  session = inject(MarkupDrawingSession);

  readonly pageNumber = DRAWING_PAGE;

  readonly cursorStyle = computed(() => {
    switch (this.state.activeTool()) {
      case "pan": return "grab";
      case "select": return "default";
      case "text": return "text";
      default: return "crosshair";
    }
  });

  /** Everything on page 1 — which, on a drawing, is everything. */
  readonly shapesOnDrawing = computed(() =>
    this.state.shapes().filter((shape) => shape.pageNumber === DRAWING_PAGE),
  );

  ngAfterViewInit(): void {
    // After the view exists, because the session measures against the overlay
    // element and reads it through the getter below.
    this.session.attachTo(this);
  }

  get overlay(): SVGSVGElement {
    return this.svg.nativeElement;
  }

  get zoom(): number {
    return this.state.zoom();
  }

  get acceptsDrawing(): boolean {
    const tool = this.state.activeTool();
    return tool !== "pan" && tool !== "select";
  }

  commit(shape: ShapeData): void {
    this.state.addShape(shape);
  }

  @HostListener("document:keydown.enter")
  finishFromKeyboard() {
    this.session.finishFromKeyboard();
  }

  @HostListener("document:keydown.escape")
  cancelVertexShape() {
    this.session.cancel();
  }
}
