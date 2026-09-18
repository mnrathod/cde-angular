import {
  Component, inject, signal, computed, effect, Input, OnChanges,
  SimpleChanges, ChangeDetectionStrategy, ElementRef, ViewChild, HostListener,
  AfterViewInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MarkupEngineService, PointerPoint } from './markup-engine.service';
import { ViewerStateService, ShapeData, MarkupTool } from './viewer-state.service';
import { MeasurementService } from './measurement.service';
import { DrawingSearchService } from './drawing-search.service';
import { MarkupShapesComponent } from './markup-shapes.component';
import { MarkupDrawingSession, MarkupSurface } from './markup-drawing-session';
import { CadLayerPanelComponent } from './cad-layer-panel.component';
import {
  CadLayer, readLayers, readViewBox, sizeOfViewBox, withLayersHidden,
} from './cad-layers';

export type { CadLayer } from './cad-layers';

/**
 * How many layer names the drawing's alternative text lists.
 *
 * <p>A drawing can carry hundreds. Reading all of them aloud is not a
 * description, it is an obstacle — the point is to say what the drawing is.
 */
const MAX_LAYERS_DESCRIBED = 8;


@Component({
  selector: 'app-cad-viewer',
  standalone: true,
  imports: [CommonModule, FormsModule, MarkupShapesComponent, CadLayerPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [MarkupDrawingSession],
  template: `
    <div class="flex flex-1 overflow-hidden min-h-0">

      <!-- SVG canvas -->
      <div #svgContainer
        class="flex-1 overflow-auto flex items-start justify-center p-4 relative"
        style="background:#1a1d27"
        [style.cursor]="containerCursor()"
        (wheel)="onWheel($event)"
        (mousedown)="startPan($event)"
        (mousemove)="continuePan($event)"
        (mouseup)="endPan()"
        (mouseleave)="endPan()">

        <div #svgWrap [style.transform]="transform()"
             style="transform-origin: top left; transition: transform .1s; position: relative; display: inline-block;">
          <!-- An <img>, not injected markup — see the class comment. -->
          @if (drawingUrl(); as url) {
            <img [src]="url" [alt]="drawingDescription()" class="cad-svg-host">
          }

          <!-- Markup overlay — same coordinate space as the drawing, so
               annotations stay pinned to the drawing itself while panning/zooming -->
          <svg #markupSvg
            class="absolute top-0 left-0 w-full h-full"
            [attr.viewBox]="contentViewBox()"
            [style.cursor]="cursorStyle()"
            [style.pointer-events]="drawingEnabled() ? 'auto' : 'none'"
            (mousedown)="session.pointerDown($event)"
            (mousemove)="session.pointerMove($event)"
            (mouseup)="session.pointerUp()"
            (dblclick)="session.doubleClick($event)"
            (touchstart)="session.pointerDown($event); $event.preventDefault()"
            (touchmove)="session.pointerMove($event); $event.preventDefault()"
            (touchend)="session.pointerUp()">

            <!-- Saved / in-progress shapes (CAD/SVG drawings have a single "page") -->
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
        </div>
      </div>

      <app-cad-layer-panel
        [layers]="layers()"
        (toggled)="toggleLayer($event)"
        (allShown)="showAll()"
        (allHidden)="hideAll()"
      />
    </div>
  `,
  styles: [`
    /* The drawing is an <img> of an SVG document, so no rule here reaches
       inside it — that isolation is what makes it safe to render. */
    .cad-svg-host { display: block; max-width: 100%; }
  `]
})
export class CadViewerComponent implements OnChanges, AfterViewInit, MarkupSurface {
  /*
   * The drawing is rendered through `<img>`, never injected as markup.
   *
   * It is our conversion service's rendering of a file a user uploaded, so its
   * text and its layer names come from that file. Putting it on the page as
   * markup means trusting every one of those — which is what CLAUDE.md §5.12
   * bans `bypassSecurityTrustHtml` for, and what this component used to do.
   *
   * An SVG loaded through `<img>` is rendered by the browser in a restricted
   * mode: no scripts, no event handlers, no external references, no reach into
   * this document. That is a guarantee the browser enforces rather than a
   * sanitiser we would have to keep correct, and it adds no dependency.
   * Verified against Chromium; held to by `cad-viewer.isolation.spec.ts`.
   *
   * The cost is that no CSS here reaches inside the drawing, so hiding a layer
   * puts its rule into the SVG itself (see drawingSvg).
   */
  @Input({ required: true }) svgContent!: string;
  @Input() dxfVersion  = '';
  @Input() entityCount = 0;
  private _dxfV = signal('');
  private _entC = signal(0);
  @ViewChild('svgContainer') svgContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('svgWrap') svgWrap!: ElementRef<HTMLDivElement>;
  @ViewChild('markupSvg') markupSvg!: ElementRef<SVGSVGElement>;

  state  = inject(ViewerStateService);
  markup = inject(MarkupEngineService);
  measure = inject(MeasurementService);
  private drawingSearch = inject(DrawingSearchService);
  session = inject(MarkupDrawingSession);

  layers        = signal<CadLayer[]>([]);
  /** `svgContent` as a signal; see ngOnChanges. */
  private readonly content = signal('');
  // Zoom lives on ViewerStateService (shared with the top toolbar's − / + / Fit
  // controls) — NOT a local signal, otherwise the toolbar's zoom buttons
  // silently have no effect on this viewer (the bug this fixes).
  constructor() {
    /*
     * Publish the drawing as an object URL, and revoke the previous one.
     *
     * Without the cleanup every layer toggle and every document open would
     * leave a copy of the drawing alive for the life of the tab, which on CAD
     * files is megabytes at a time.
     */
    effect((onCleanup) => {
      const svg = this.drawingSvg();
      if (!svg) {
        this.drawingUrl.set(null);
        return;
      }
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      this.drawingUrl.set(url);
      onCleanup(() => URL.revokeObjectURL(url));
    });

    // "Fit to window" lives only in the command bar now, so this viewer has to
    // hear about it: zoom alone leaves a drawing that has been scrolled away
    // from still off screen.
    effect(() => {
      this.state.fitRequests();
      this.recentreView();
    });

    // Bring a search hit into view. Marking it is not enough on a drawing
    // wider than the window — the mark can easily be off screen.
    effect(() => {
      const hit = this.state.searchFocus();
      if (hit) this.scrollTo(hit);
    });
  }

  /**
   * Centre a point of the drawing in the viewport.
   *
   * The drawing is laid out at its natural size and then scaled by a CSS
   * transform, which does not change the layout box — so the scroll offset a
   * drawing coordinate corresponds to has to be worked out from the viewBox
   * and the zoom rather than read off the element.
   */
  private scrollTo(target: { x: number; y: number }) {
    const container = this.svgContainer?.nativeElement;
    const wrap = this.svgWrap?.nativeElement;
    if (!container || !wrap) return;

    const [viewBoxWidth, viewBoxHeight] = this.contentSize();
    const zoom = this.state.zoom();
    const scaleX = (wrap.offsetWidth  / viewBoxWidth)  * zoom;
    const scaleY = (wrap.offsetHeight / viewBoxHeight) * zoom;

    container.scrollLeft = target.x * scaleX - container.clientWidth  / 2;
    container.scrollTop  = target.y * scaleY - container.clientHeight / 2;
  }

  // ── Panning ──────────────────────────────────────────────────
  // The drawing is positioned by the scroll offset of its container rather
  // than by a translate of its own, so the scrollbars, the wheel and a drag
  // all move the same thing and cannot disagree. An earlier pair of panX/panY
  // signals fed the transform but were never assigned by anything, so the
  // grab cursor promised a drag that did nothing at all.
  private panOrigin: { x: number; y: number; left: number; top: number } | null = null;

  /**
   * A signal rather than a check on panOrigin: the cursor is a computed, and a
   * computed cannot see a plain field change, so the grab/grabbing swap would
   * never render.
   */
  private readonly panning = signal(false);

  containerCursor = computed(() =>
    this.state.activeTool() !== 'pan' ? 'default'
      : this.panning() ? 'grabbing' : 'grab');

  startPan(event: MouseEvent) {
    if (this.state.activeTool() !== 'pan') return;
    const container = this.svgContainer.nativeElement;
    this.panOrigin = {
      x: event.clientX, y: event.clientY,
      left: container.scrollLeft, top: container.scrollTop
    };
    this.panning.set(true);
    event.preventDefault();
  }

  continuePan(event: MouseEvent) {
    if (!this.panOrigin) return;
    const container = this.svgContainer.nativeElement;
    container.scrollLeft = this.panOrigin.left - (event.clientX - this.panOrigin.x);
    container.scrollTop  = this.panOrigin.top  - (event.clientY - this.panOrigin.y);
  }

  endPan() {
    this.panOrigin = null;
    this.panning.set(false);
  }

  /** Centres the drawing horizontally and returns to the top. */
  private recentreView() {
    const container = this.svgContainer?.nativeElement;
    if (!container) return;
    container.scrollTop  = 0;
    container.scrollLeft = (container.scrollWidth - container.clientWidth) / 2;
  }
  visibleCount = computed(() => this.layers().filter((l) => l.visible).length);

  // ── Markup ───────────────────────────────────────────────────
  contentViewBox = signal('0 0 800 600');
  // Live cursor position while a polygon/polyline is mid-click-sequence —
  // mirrors PdfPageComponent's identical rubber-band handling.

  drawingEnabled = computed(() => {
    const tool = this.state.activeTool();
    return tool !== 'pan' && tool !== 'select';
  });

  cursorStyle = computed(() => {
    switch (this.state.activeTool()) {
      case 'pan':    return 'grab';
      case 'select': return 'default';
      case 'text':   return 'text';
      default:       return this.drawingEnabled() ? 'crosshair' : 'default';
    }
  });

  transform = computed(() => {
    const rotation = this.state.rotation();
    const base = `scale(${this.state.zoom()})`;
    if (!rotation) return base;

    // The wrapper's transform-origin is top-left (which pan/zoom rely on),
    // so rotating about it swings the drawing outside the viewport. Shifting
    // by the rotated content's own extent brings it back to the origin.
    const [width, height] = this.contentSize();
    const shift = rotation === 90  ? `translate(${height}px, 0)`
                : rotation === 180 ? `translate(${width}px, ${height}px)`
                :                    `translate(0, ${width}px)`;
    // Rotation is composed with pan/zoom so it applies to the drawing and
    // its markup overlay together, keeping annotations pinned.
    return `${base} ${shift} rotate(${rotation}deg)`;
  });

  /** Width and height of the drawing's own coordinate space. */
  private contentSize = computed<[number, number]>(() =>
    sizeOfViewBox(this.contentViewBox()));

  /**
   * The drawing with hidden layers styled out, as a string.
   *
   * The rules go *inside* the SVG rather than in this component's stylesheet,
   * because an SVG rendered through `<img>` is its own document and no CSS
   * from this page reaches into it. That isolation is the point; it costs the
   * hover transition the stylesheet used to apply, and nothing else.
   */
  private readonly drawingSvg = computed(() =>
    withLayersHidden(this.content(), this.layers()));

  /** What a screen reader is told the image is (§1A.4). */
  readonly drawingDescription = computed(() => {
    const named = this.layers().map((layer) => layer.name).filter(Boolean);
    if (!named.length) {
      return $localize`:Alternative text for a drawing whose layers could not be read, so there is nothing to name@@cadViewer.drawingAlone:Drawing`;
    }
    // A whole sentence with the count and the names as placeholders, rather
    // than three fragments joined with commas: the word order, the plural
    // agreement and the list separator are all different in other languages,
    // and none of them survives concatenation.
    const shown = named.slice(0, MAX_LAYERS_DESCRIBED).join(', ');
    return $localize`:Alternative text for a drawing, naming its layers. The first placeholder is how many layers there are in total, the second is the names of the first few@@cadViewer.drawingWithLayers:Drawing with ${named.length}:count: layers: ${shown}:names:`;
  });

  /** The drawing as an object URL, revoked when it is replaced. */
  readonly drawingUrl = signal<string | null>(null);

  ngAfterViewInit(): void {
    // After the view exists, because the session measures against the overlay
    // element and reads it through the getter below.
    this.session.attachTo(this);
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['svgContent'] && this.svgContent) {
      // Mirrored into a signal because drawingSvg() is computed and an @Input
      // is not reactive. Set after the reads below would leave one render
      // against the previous drawing's layers.
      this.content.set(this.svgContent);
      this.layers.set(readLayers(this.svgContent));
      this.contentViewBox.set(readViewBox(this.svgContent));
      // Index the drawing's own text so it can be searched. Without this the
      // search panel had nothing to look at for a drawing and answered every
      // query with "No matches found".
      this.state.drawingText.set(this.drawingSearch.extractText(this.svgContent));
      this.state.searchFocus.set(null);
    }
  }

  toggleLayer(layer: CadLayer) {
    this.layers.update(ls =>
      ls.map(l => l.name === layer.name ? { ...l, visible: !l.visible } : l)
    );
  }

  showAll() { this.layers.update(ls => ls.map(l => ({ ...l, visible: true }))); }
  hideAll() { this.layers.update(ls => ls.map(l => ({ ...l, visible: false }))); }

  onWheel(e: WheelEvent) {
    e.preventDefault();
    if (e.ctrlKey) {
      // Zoom
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      this.state.zoom.update(z => Math.max(0.1, Math.min(10, z + delta)));
    }
  }

  zoomIn()    { this.state.zoomIn(); }
  zoomOut()   { this.state.zoomOut(); }

  /**
   * The shape being drawn, and the gesture that draws it, both live in the
   * session — shared with the PDF page so the two cannot disagree about which
   * gestures finish a shape.
   */
  get overlay(): SVGSVGElement {
    return this.markupSvg.nativeElement;
  }
  /** A CAD drawing is a single page, so everything belongs to page 1. */
  readonly pageNumber = 1;
  get zoom(): number {
    return this.state.zoom();
  }
  get acceptsDrawing(): boolean {
    return this.drawingEnabled();
  }
  commit(shape: ShapeData): void {
    this.state.addShape(shape);
  }

  /** Everything on page 1 — which, on a drawing, is everything. */
  readonly shapesOnDrawing = computed(() =>
    this.state.shapes().filter((shape) => shape.pageNumber === 1));

  @HostListener('document:keydown.enter')
  finishFromKeyboard() { this.session.finishFromKeyboard(); }

  @HostListener('document:keydown.escape')
  cancelVertexShape() { this.session.cancel(); }
}
