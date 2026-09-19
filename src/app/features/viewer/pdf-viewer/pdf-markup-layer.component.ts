/**
 * The layer a person draws on, over a rendered PDF page.
 *
 * <p>Separate from the page itself because the two answer different
 * questions. The page is what pdf.js painted; this is what someone put on
 * top of it, and the two only need to agree on a size and a zoom.
 *
 * <p>It is also the half that owns a gesture: the drawing session, the keys
 * that finish or abandon a shape, and the decision about where a finished
 * shape goes — which for a redaction or a form field is not the shape list
 * at all.
 */
import {
  AfterViewInit, ChangeDetectionStrategy, Component, ElementRef,
  HostListener, Input, ViewChild, computed, inject,
} from "@angular/core";

import { MarkupEngineService } from "../../../../viewer-core/markup-engine.service";
import { MarkupShapesComponent } from "../../../../viewer-core/markup-shapes.component";
import {
  MarkupDrawingSession, MarkupSurface,
} from "../../../../viewer-core/markup-drawing-session";
import {
  MarkupTool, ShapeData, ViewerStateService,
} from "../../../../viewer-core/viewer-state.service";
import {
  PageGeometry, formFieldDraftFrom, onScreenBoxes, redactionFrom,
} from "./pdf-page-geometry";

/** Tools that say something about themselves through the cursor. */
const CURSOR_FOR_TOOL: Partial<Record<MarkupTool, string>> = {
  pan: "grab",
  select: "default",
  text: "text",
};

@Component({
  selector: "app-pdf-markup-layer",
  standalone: true,
  imports: [MarkupShapesComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [MarkupDrawingSession],
  // display:contents so the host box itself takes part in no layout: the
  // overlay is absolutely positioned against the page wrapper, exactly as it
  // was when it sat directly inside it.
  styles: [`:host { display: contents; }`],
  template: `
    <svg #markupSvg
      class="absolute top-0 left-0"
      style="z-index:2"
      [attr.width]="pageWidth" [attr.height]="pageHeight"
      [attr.viewBox]="'0 0 ' + pageWidth + ' ' + pageHeight"
      [style.cursor]="cursorStyle()"
      [style.pointer-events]="drawingEnabled() ? 'auto' : 'none'"
      (mousedown)="session.pointerDown($event)"
      (mousemove)="session.pointerMove($event)"
      (mouseup)="session.pointerUp()"
      (dblclick)="session.doubleClick($event)"
      (touchstart)="session.pointerDown($event); $event.preventDefault()"
      (touchmove)="session.pointerMove($event); $event.preventDefault()"
      (touchend)="session.pointerUp()">

      <!-- Saved / persisted shapes -->
      <g markupShapes [shapes]="shapesOnPage()"></g>

      <!-- Committed redaction regions, stored in PDF points and converted
           back to this page's current screen pixels so they stay put across
           zoom changes, unlike ShapeData. -->
      @for (region of redactionRegionsOnPage(); track region.id) {
        <rect [attr.x]="region.screenX" [attr.y]="region.screenY"
              [attr.width]="region.screenWidth" [attr.height]="region.screenHeight"
              fill="#000000" stroke="#000000"/>
      }

      <!-- Placed but not yet added form fields, converted for the same
           reason. -->
      @for (draft of formFieldDraftsOnPage(); track draft.id) {
        <g>
          <rect [attr.x]="draft.screenX" [attr.y]="draft.screenY"
                [attr.width]="draft.screenWidth" [attr.height]="draft.screenHeight"
                fill="#3b82f622" stroke="#3b82f6" stroke-width="1.5"
                stroke-dasharray="4 3" rx="2"/>
          <text [attr.x]="draft.screenX + 3" [attr.y]="draft.screenY - 3"
                font-size="10" fill="#2563eb">{{ draft.name || unnamedFieldLabel }}</text>
        </g>
      }

      <!-- The shape being drawn, rubber-banding to the cursor between
           clicks via the session. -->
      @if (session.activeShape()) {
        <g markupShapes [shapes]="[session.previewShape()]"></g>
      }
    </svg>
  `,
})
export class PdfMarkupLayerComponent implements AfterViewInit, MarkupSurface {
  /** Which page a shape drawn here belongs to. */
  @Input({ required: true }) pageNumber!: number;
  @Input() zoom = 1;
  @Input() pageWidth = 0;
  @Input() pageHeight = 0;

  @ViewChild("markupSvg") svg!: ElementRef<SVGSVGElement>;

  private state = inject(ViewerStateService);
  private markup = inject(MarkupEngineService);
  session = inject(MarkupDrawingSession);

  /** Stands in for a field's name until the Form panel gives it one. */
  readonly unnamedFieldLabel = $localize`:Placeholder on a form field that has been drawn but not yet named@@pdfForm.unnamedField:unnamed`;

  /**
   * With the pan tool the overlay stops capturing pointer events, so they
   * reach the text layer underneath and text can be selected — the same
   * behaviour the CAD drawing has.
   */
  readonly drawingEnabled = computed(() => this.state.activeTool() !== "pan");

  readonly cursorStyle = computed(
    () => CURSOR_FOR_TOOL[this.state.activeTool()] ?? "crosshair",
  );

  /**
   * The shapes belonging to this page.
   *
   * <p>Filtered in a computed rather than with an `@if` inside the loop: the
   * drawing component takes a list, and a per-shape guard in the template
   * would put an empty group on the page for every shape on every other one.
   */
  readonly shapesOnPage = computed(() =>
    this.state.shapes().filter((shape) => shape.pageNumber === this.pageNumber),
  );

  readonly redactionRegionsOnPage = computed(() =>
    onScreenBoxes(this.state.redactionRegions(), this.geometry),
  );

  /** Field drafts on this page, in current screen pixels. */
  readonly formFieldDraftsOnPage = computed(() =>
    onScreenBoxes(this.state.formFieldDrafts(), this.geometry),
  );

  /** This page as every conversion here needs to see it. */
  private get geometry(): PageGeometry {
    const { pageNumber: page, zoom, pageHeight: renderedHeightPx } = this;
    return { page, zoom, renderedHeightPx };
  }

  // The session measures against the overlay through the getter below, so it
  // cannot be told about this surface until the view exists.
  ngAfterViewInit() {
    this.session.attachTo(this);
  }

  get overlay(): SVGSVGElement {
    return this.svg.nativeElement;
  }

  get acceptsDrawing(): boolean {
    const tool = this.state.activeTool();
    return tool !== "pan" && tool !== "select";
  }

  /** Where a finished shape goes. Most are shapes; two are not. */
  commit(shape: ShapeData): void {
    const id = this.markup.newId();
    if (shape.tool === "redact") {
      this.state.addRedactionRegion(redactionFrom(id, shape, this.geometry));
    } else if (shape.tool === "formfield") {
      this.state.addFormFieldDraft(
        formFieldDraftFrom(id, shape, this.geometry),
      );
    } else {
      this.state.addShape(shape);
    }
  }

  @HostListener("document:keydown.enter")
  finishFromKeyboard() {
    this.session.finishFromKeyboard();
  }

  @HostListener("document:keydown.escape")
  cancelPolyInProgress() {
    this.session.cancel();
  }
}
