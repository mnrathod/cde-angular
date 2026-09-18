import {
  Component, Input, Output, EventEmitter, signal, computed, inject,
  OnInit, AfterViewInit, OnDestroy, OnChanges, SimpleChanges,
  ElementRef, ViewChild, ChangeDetectionStrategy, HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { PdfEngineService } from '../../../../viewer-core/pdf-engine.service';
import { MarkupEngineService, PointerPoint } from '../../../../viewer-core/markup-engine.service';
import { ViewerStateService, ShapeData, MarkupTool } from '../../../../viewer-core/viewer-state.service';
import { MeasurementService } from '../../../../viewer-core/measurement.service';
import { CollaborationService } from '../../../core/services/collaboration.service';
import { RemoteCursorsComponent } from '../markup/remote-cursors.component';
import { PageLinksComponent } from '../../../../viewer-core/page-links.component';
import { MarkupShapesComponent } from '../../../../viewer-core/markup-shapes.component';
import { MarkupDrawingSession, MarkupSurface } from '../../../../viewer-core/markup-drawing-session';
import { pageLabel } from '../../../../viewer-core/page-labels';

@Component({
  selector: 'app-pdf-page',
  standalone: true,
  imports: [CommonModule, RemoteCursorsComponent, PageLinksComponent, MarkupShapesComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [MarkupDrawingSession],
  template: `
    <!-- Outer box takes the rotated footprint so the scroll container
         reserves the right space; the inner box is what actually turns. -->
    <div class="relative select-none"
         [style.width.px]="outerWidth()"
         [style.height.px]="outerHeight()">
    <div class="relative select-none pdf-page-wrap"
         (mousemove)="reportCursor($event)"
         [style.width.px]="pageWidth()"
         [style.height.px]="pageHeight()"
         [style.transform]="rotationTransform()"
         style="transform-origin: center center">

      <!-- Placeholder shown while this page is outside the render window -->
      @if (!rendered()) {
        <div class="absolute inset-0 bg-white shadow-lg flex items-center justify-center">
          <span class="text-xs text-gray-400 select-none">{{ pageLabel(pageNumber) }}</span>
        </div>
      }

      <!-- PDF canvas -->
      <canvas #pageCanvas
        class="block shadow-lg"
        [style.width.px]="pageWidth()"
        [style.height.px]="pageHeight()">
      </canvas>

      <!-- Text layer (for text selection + search highlight).
           Populated by pdf.js's TextLayer — see PdfEngineService. -->
      <div #textLayer
        class="textLayer"
        [style.--total-scale-factor]="zoom"
        [style.width.px]="pageWidth()"
        [style.height.px]="pageHeight()">
      </div>

      <!-- Annotation SVG overlay — BOUND to this page's coordinate system -->
      <svg #markupSvg
        class="absolute top-0 left-0"
        style="z-index:2"
        [attr.width]="pageWidth()"
        [attr.height]="pageHeight()"
        [attr.viewBox]="'0 0 ' + pageWidth() + ' ' + pageHeight()"
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

        <!-- Committed redaction regions (stored in PDF-point space, converted
             back to this page's current screen pixels — stays correctly
             positioned across zoom changes, unlike ShapeData) -->
        @for (region of redactionRegionsOnPage(); track region.id) {
          <rect [attr.x]="region.screenX" [attr.y]="region.screenY"
                [attr.width]="region.screenWidth" [attr.height]="region.screenHeight"
                fill="#000000" stroke="#000000"/>
        }

        <!-- Placed but not yet added form fields, converted from PDF points
             so they stay put across zoom changes -->
        @for (draft of formFieldDraftsOnPage(); track draft.id) {
          <g>
            <rect [attr.x]="draft.screenX" [attr.y]="draft.screenY"
                  [attr.width]="draft.screenWidth" [attr.height]="draft.screenHeight"
                  fill="#3b82f622" stroke="#3b82f6" stroke-width="1.5"
                  stroke-dasharray="4 3" rx="2"/>
            <text [attr.x]="draft.screenX + 3" [attr.y]="draft.screenY - 3"
                  font-size="10" fill="#2563eb">{{ draft.name || 'unnamed' }}</text>
          </g>
        }

        <!-- In-progress shape being drawn (polygon/polyline rubber-band
             to the cursor between clicks via the session) -->
        @if (session.activeShape()) {
          <g markupShapes [shapes]="[session.previewShape()]"></g>
        }
      </svg>

      <!-- Link annotations, below the cursors so a remote pointer is never
           swallowed by a link's hit area -->
      <app-page-links [pageNumber]="pageNumber" [zoom]="zoom"
                      [pageHeight]="pageHeight() / zoom"></app-page-links>

      <!-- Other people's pointers -->
      <app-remote-cursors [pageNumber]="pageNumber" [zoom]="zoom"></app-remote-cursors>

      <!-- Page number label -->
      <div class="absolute bottom-1 right-2 text-xs text-white/50 select-none pointer-events-none">
        {{ pageNumber }}
      </div>
    </div>
    </div>
  `,
  // ::ng-deep is required throughout: pdf.js builds the text-layer spans
  // itself via the DOM API, so they never receive Angular's _ngcontent
  // attribute and ordinary emulated-encapsulation rules cannot match them.
  // (That was the bug — the spans rendered as visible, statically
  // positioned black text on top of the page.) Rules below are the minimum
  // subset of pdfjs-dist/web/pdf_viewer.css that TextLayer output needs.
  styles: [`
    :host ::ng-deep .textLayer {
      position: absolute; inset: 0;
      text-align: initial;
      overflow: clip;
      line-height: 1;
      transform-origin: 0 0;
      forced-color-adjust: none;
      /* Must sit below the markup overlay (z-index 2) so drawing still
         receives pointer events once a text layer exists. */
      z-index: 1;
      /* The page wrapper sets Tailwind's select-none to stop drag-select
         while drawing; re-enable it here or the text layer is unselectable. */
      -webkit-user-select: text;
      user-select: text;
      --total-scale-factor: 1;
      --min-font-size: 1;
      --text-scale-factor: calc(var(--total-scale-factor) * var(--min-font-size));
      --min-font-size-inv: calc(1 / var(--min-font-size));
    }
    :host ::ng-deep .textLayer :is(span, br) {
      color: transparent;
      position: absolute;
      white-space: pre;
      cursor: text;
      transform-origin: 0% 0%;
      -webkit-user-select: text;
      user-select: text;
    }
    :host ::ng-deep .textLayer > :not(.markedContent),
    :host ::ng-deep .textLayer .markedContent span:not(.markedContent) {
      z-index: 1;
      --font-height: 0;
      font-size: calc(var(--text-scale-factor) * var(--font-height));
      --scale-x: 1;
      --rotate: 0deg;
      transform: rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv));
    }
    :host ::ng-deep .textLayer .markedContent { display: contents; }
    :host ::ng-deep .textLayer .cde-search-match {
      background: rgba(255, 214, 0, 0.45);
      border-radius: 2px;
    }
  `]
})
export class PdfPageComponent
  implements OnInit, AfterViewInit, OnChanges, OnDestroy, MarkupSurface {
  pageLabel = pageLabel;

  @Input({ required: true }) pdfDoc!:    any;
  @Input({ required: true }) pageNumber!: number;
  @Input()                   zoom        = 1.0;
  @Input()                   searchQuery = '';
  /**
   * Whether this page is close enough to the viewport to be worth painting.
   * When false the page keeps its correct size (so scroll height and page
   * anchors stay right) but releases its canvas backing store — at ~1.9 MB
   * per page a long document otherwise pins hundreds of MB of GPU memory.
   */
  @Input()                   active      = true;

  @ViewChild('pageCanvas')  canvas!:    ElementRef<HTMLCanvasElement>;
  @ViewChild('markupSvg')   svg!:       ElementRef<SVGSVGElement>;
  @ViewChild('textLayer')   textLayer!: ElementRef<HTMLDivElement>;

  state   = inject(ViewerStateService);
  engine  = inject(PdfEngineService);
  markup  = inject(MarkupEngineService);
  session = inject(MarkupDrawingSession);
  measure = inject(MeasurementService);
  private collaboration = inject(CollaborationService);

  pageWidth  = signal(0);
  pageHeight = signal(0);
  rendered   = signal(false);
  private viewport: any = null;

  /**
   * With the pan tool the markup overlay stops capturing pointer events, so
   * they reach the text layer underneath and the user can select text —
   * mirrors CadViewerComponent's existing drawingEnabled() behaviour.
   */
  drawingEnabled = computed(() => this.state.activeTool() !== 'pan');

  cursorStyle = () => {
    switch (this.state.activeTool()) {
      case 'pan':    return 'grab';
      case 'select': return 'default';
      case 'text':   return 'text';
      default:       return 'crosshair';
    }
  };

  ngOnInit() { /* first render happens in ngAfterViewInit — see below */ }

  // @ViewChild('pageCanvas') isn't populated until after the view is
  // initialized, so the *first* render has to happen here, not in
  // ngOnInit/ngOnChanges — calling render() before this silently no-ops
  // on its `!this.canvas` guard, which is why pages never painted.
  ngAfterViewInit() {
    // After the view exists, because the session measures against the markup
    // overlay and reads it through the getter above.
    this.session.attachTo(this);
    this.render();
  }

  ngOnChanges(changes: SimpleChanges) {
    // Skip the very first call — the view (and @ViewChild canvas) isn't
    // ready yet; ngAfterViewInit handles the initial render instead.
    const isFirstChange = Object.values(changes).some(c => c.isFirstChange());
    if (isFirstChange) return;

    if (changes['zoom'] || changes['pdfDoc'] || changes['pageNumber'] || changes['active']) {
      this.render();
      return;   // render() re-applies the search highlight itself
    }
    if (changes['searchQuery']) {
      this.highlightSearch();
    }
  }

  ngOnDestroy() { this.releaseCanvas(); }

  async render() {
    if (!this.pdfDoc || !this.canvas) return;

    // Size the page even when it isn't being painted, so its placeholder
    // occupies the right scroll height and annotation geometry stays valid.
    const size = await this.engine.getPageSize(this.pdfDoc, this.pageNumber, this.zoom);
    this.pageWidth.set(size.width);
    this.pageHeight.set(size.height);
    this.viewport = size.viewport;

    if (!this.active) { this.releaseCanvas(); return; }

    await this.engine.renderPage(
      this.pdfDoc, this.pageNumber, this.canvas.nativeElement, this.zoom
    );
    this.rendered.set(true);
    await this.highlightSearch();
  }

  /**
   * Drop the canvas backing store for an off-screen page. Setting the
   * dimensions to zero is what actually frees the memory — merely clearing
   * the 2D context keeps the full buffer allocated.
   */
  private releaseCanvas() {
    const el = this.canvas?.nativeElement;
    if (el) { el.width = 0; el.height = 0; }
    this.textLayer?.nativeElement.replaceChildren();
    this.rendered.set(false);
  }

  /**
   * The shapes belonging to this page.
   *
   * Filtered in a computed rather than with an `@if` inside the loop: the
   * drawing component takes a list, and a per-shape guard in the template
   * would put an empty group on the page for every shape on every other page.
   */
  readonly shapesOnPage = computed(() =>
    this.state.shapes().filter((shape) => shape.pageNumber === this.pageNumber));

  // ── Committed redaction regions for this page, converted from the
  //    canonical PDF-point storage back into this page's current screen
  //    pixels. Recomputes whenever pageWidth/pageHeight change (i.e. on
  //    zoom), so — unlike ShapeData — redaction boxes stay correctly
  //    positioned across zoom changes instead of drifting. ─────────────
  // ── View rotation ────────────────────────────────────────────
  rotationTransform = computed(() => {
    const degrees = this.state.rotation();
    return degrees ? `rotate(${degrees}deg)` : '';
  });

  /**
   * A quarter turn swaps the page's footprint. The rotation itself is a
   * transform, which does not affect layout, so the outer box has to carry
   * the swapped size or neighbouring pages overlap.
   */
  outerWidth  = computed(() => this.state.isQuarterTurned() ? this.pageHeight() : this.pageWidth());
  outerHeight = computed(() => this.state.isQuarterTurned() ? this.pageWidth()  : this.pageHeight());

  redactionRegionsOnPage = computed(() => {
    const zoom         = this.zoom;
    const nativeHeight = this.pageHeight() / zoom;
    return this.state.redactionRegions()
      .filter(r => r.page === this.pageNumber)
      .map(r => ({
        id:           r.id,
        screenX:      r.x * zoom,
        screenY:      (nativeHeight - r.y - r.height) * zoom,
        screenWidth:  r.width  * zoom,
        screenHeight: r.height * zoom
      }));
  });

  /**
   * The gesture that draws a shape lives in the session, shared with the CAD
   * drawing so the two cannot disagree about which gestures finish a shape.
   * What stays here is what is genuinely this page's: its number, its zoom,
   * and the fact that a redaction or a form field goes somewhere other than
   * the shape list.
   */
  get overlay(): SVGSVGElement {
    return this.svg.nativeElement;
  }
  get acceptsDrawing(): boolean {
    const tool = this.state.activeTool();
    return tool !== 'pan' && tool !== 'select';
  }
  commit(shape: ShapeData): void {
    if (shape.tool === 'redact') {
      this.commitRedactionRegion(shape);
    } else if (shape.tool === 'formfield') {
      this.commitFormFieldDraft(shape);
    } else {
      this.state.addShape(shape);
    }
  }

  @HostListener('document:keydown.enter')
  finishFromKeyboard() { this.session.finishFromKeyboard(); }

  @HostListener('document:keydown.escape')
  cancelPolyInProgress() { this.session.cancel(); }

  /**
   * Tells other viewers where this pointer is.
   *
   * <p>Bound to the page wrapper rather than the markup overlay, which turns
   * off pointer events unless a drawing tool is active — a pointer that only
   * broadcast while drawing would be no use for following along.
   *
   * <p>Coordinates are divided by the zoom so they describe a place on the
   * page rather than a place on this screen; the service throttles the rate.
   */
  reportCursor(e: MouseEvent) {
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const scale = this.zoom || 1;
    this.collaboration.reportCursor({
      page: this.pageNumber,
      x: (e.clientX - box.left) / scale,
      y: (e.clientY - box.top) / scale
    });
  }

  // Convert a drawn rect (screen pixels, top-left origin, current zoom)
  // into the backend's coordinate system (PDF points, origin bottom-left).
  private commitRedactionRegion(shape: ShapeData) {
    this.state.addRedactionRegion({
      id: this.markup.newId(),
      page: this.pageNumber,
      ...this.toPdfRect(shape)
    });
  }

  /**
   * Screen pixels at the current zoom, top-left origin, converted to PDF
   * points with a bottom-left origin — the space the server works in, and
   * the reason these stay correct when the zoom changes.
   */
  private toPdfRect(shape: ShapeData): { x: number; y: number; width: number; height: number } {
    const zoom         = this.zoom;
    const nativeHeight = this.pageHeight() / zoom;
    const width        = (shape.width  || 0) / zoom;
    const height       = (shape.height || 0) / zoom;
    return {
      x:      (shape.x || 0) / zoom,
      y:      nativeHeight - ((shape.y || 0) / zoom) - height,
      width,
      height
    };
  }

  /**
   * Turns a drawn rectangle into an unnamed field draft.
   *
   * <p>Named in the Form panel rather than here: a prompt for every box would
   * make laying out a form of twenty fields twenty interruptions.
   */
  private commitFormFieldDraft(shape: ShapeData) {
    const box = this.toPdfRect(shape);
    this.state.addFormFieldDraft({
      id: this.markup.newId(),
      page: this.pageNumber,
      ...box,
      name: '',
      kind: 'TEXT',
      required: false,
      options: ''
    });
  }

  /** Field drafts on this page, in current screen pixels. */
  formFieldDraftsOnPage = computed(() => {
    const zoom         = this.zoom;
    const nativeHeight = this.pageHeight() / zoom;
    return this.state.formFieldDrafts()
      .filter(draft => draft.page === this.pageNumber)
      .map(draft => ({
        ...draft,
        screenX:      draft.x * zoom,
        screenY:      (nativeHeight - draft.y - draft.height) * zoom,
        screenWidth:  draft.width * zoom,
        screenHeight: draft.height * zoom
      }));
  });

  // ── Build the text layer and mark search matches ─────────────
  private async highlightSearch() {
    if (!this.textLayer || !this.pdfDoc || !this.viewport || !this.active) return;

    const el    = this.textLayer.nativeElement;
    const divs  = await this.engine.renderTextLayer(
      this.pdfDoc, this.pageNumber, el, this.viewport
    );

    const query = this.searchQuery.trim().toLowerCase();
    if (!query) return;
    for (const div of divs) {
      if ((div.textContent ?? '').toLowerCase().includes(query)) {
        div.classList.add('cde-search-match');
      }
    }
  }

  // ── Export this page's markup as SVG string (for print) ─────
  getSvgForPrint(): string {
    const shapes = this.state.shapes().filter(s => s.pageNumber === this.pageNumber);
    return this.markup.shapesToSvgContent(shapes, this.pageWidth(), this.pageHeight());
  }
}
