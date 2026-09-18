import {
  Component, inject, signal, computed, effect, Input, OnChanges,
  SimpleChanges, ChangeDetectionStrategy, ElementRef, ViewChild, HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MarkupEngineService, PointerPoint } from './markup-engine.service';
import { ViewerStateService, ShapeData, MarkupTool } from './viewer-state.service';
import { MeasurementService } from './measurement.service';
import { DrawingSearchService } from './drawing-search.service';
import { MarkupShapesComponent } from './markup-shapes.component';

export interface CadLayer {
  name:    string;
  color:   string;
  visible: boolean;
  count:   number;
}

@Component({
  selector: 'app-cad-viewer',
  standalone: true,
  imports: [CommonModule, FormsModule, MarkupShapesComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
            (mousedown)="onPointerDown($event)"
            (mousemove)="onPointerMove($event)"
            (mouseup)="onPointerUp($event)"
            (dblclick)="onDoubleClick($event)"
            (touchstart)="onPointerDown($event); $event.preventDefault()"
            (touchmove)="onPointerMove($event); $event.preventDefault()"
            (touchend)="onPointerUp($event)">

            <!-- Saved / in-progress shapes (CAD/SVG drawings have a single "page") -->
            <g markupShapes [shapes]="shapesOnDrawing()"></g>
            @if (activeShape()) {
              <g markupShapes [shapes]="[previewShape()]"></g>
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

      <!-- Layer panel -->
      <div class="w-56 bg-white border-s border-gray-200 flex flex-col flex-shrink-0">
        <div class="p-3 border-b border-gray-200 flex items-center justify-between">
          <span i18n="Heading of the CAD drawing's layer panel@@cadViewer.layersHeading"
                class="text-xs font-semibold text-gray-600 uppercase tracking-wide">Layers</span>
          <div class="flex gap-1">
            <button (click)="showAll()"
              i18n="Shows every layer. Very short — it shares a row with another control.@@cadViewer.showAllLayers"
              class="text-xs text-blue-600 hover:underline">All</button>
            <span class="text-gray-300" aria-hidden="true">|</span>
            <button (click)="hideAll()"
              i18n="Hides every layer. Very short — it shares a row with another control.@@cadViewer.hideAllLayers"
              class="text-xs text-gray-500 hover:underline">None</button>
          </div>
        </div>
        <div class="flex-1 overflow-y-auto p-2">
          @for (layer of layers(); track layer.name) {
            <div class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer"
                 (click)="toggleLayer(layer)">
              <!-- Visibility checkbox -->
              <div class="w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors"
                   [style.border-color]="layer.color"
                   [style.background]="layer.visible ? layer.color : 'transparent'">
                @if (layer.visible) {
                  <svg viewBox="0 0 10 8" class="w-2.5 h-2 text-white fill-current">
                    <path d="M1 4L4 7L9 1" stroke="white" stroke-width="1.5" fill="none"/>
                  </svg>
                }
              </div>
              <!-- Layer swatch -->
              <div class="w-3 h-3 rounded-sm flex-shrink-0" [style.background]="layer.color"></div>
              <!-- Layer name -->
              <span class="text-xs truncate flex-1" [class.text-gray-400]="!layer.visible"
                    [class.text-gray-700]="layer.visible">
                {{ layer.name }}
              </span>
              <!-- Entity count -->
              <span class="text-xs text-gray-400 flex-shrink-0">{{ layer.count }}</span>
            </div>
          }

          @if (layers().length === 0) {
            <div i18n="Empty state for the layer panel of a drawing with no layers@@cadViewer.noLayers"
                 class="text-xs text-gray-400 text-center py-6">No layer data</div>
          }
        </div>

        <!-- Stats -->
        <div class="p-3 border-t border-gray-200 text-xs text-gray-500 space-y-1">
          <div class="flex justify-between">
            <span i18n="How many layers are shown, out of how many exist@@cadViewer.visibleLayers">Visible layers</span>
            <span class="font-mono">{{ visibleCount() }} / {{ layers().length }}</span>
          </div>
          @if (dxfVersion) {
            <div class="flex justify-between">
              <span i18n="Which revision of the DXF format the drawing uses. DXF is a format name and stays as it is.@@cadViewer.dxfVersion">DXF version</span>
              <span class="font-mono">{{ dxfVersion }}</span>
            </div>
          }
          @if (entityCount > 0) {
            <div class="flex justify-between">
              <span i18n="How many drawable objects the CAD file contains@@cadViewer.entityCount">Entities</span>
              <span class="font-mono">{{ entityCount }}</span>
            </div>
          }
        </div>

      </div>
    </div>
  `,
  styles: [`
    /* The drawing is an <img> of an SVG document, so no rule here reaches
       inside it — that isolation is what makes it safe to render. */
    .cad-svg-host { display: block; max-width: 100%; }
  `]
})
export class CadViewerComponent implements OnChanges {
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
  visibleCount  = computed(() => this.layers().filter(l => l.visible).length);

  // ── Markup ───────────────────────────────────────────────────
  contentViewBox = signal('0 0 800 600');
  activeShape    = signal<ShapeData | null>(null);
  private drawing = false;
  // Live cursor position while a polygon/polyline is mid-click-sequence —
  // mirrors PdfPageComponent's identical rubber-band handling.
  private polyHover: PointerPoint | null = null;

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
  private contentSize = computed<[number, number]>(() => {
    const parts = this.contentViewBox().split(/\s+/).map(Number);
    const [, , width, height] = parts;
    // The viewBox comes from a converted drawing, so a malformed one is an
    // input problem rather than an impossible state. Falling back to a
    // sensible page size renders something a user can see, which beats an
    // exception in a computed signal.
    return parts.length === 4 && width !== undefined && height !== undefined
        && !isNaN(width) && !isNaN(height)
      ? [width, height]
      : [800, 600];
  });

  /**
   * The drawing with hidden layers styled out, as a string.
   *
   * The rules go *inside* the SVG rather than in this component's stylesheet,
   * because an SVG rendered through `<img>` is its own document and no CSS
   * from this page reaches into it. That isolation is the point; it costs the
   * hover transition the stylesheet used to apply, and nothing else.
   */
  private readonly drawingSvg = computed(() => {
    const svg = this.content();
    if (!svg) return '';
    const hidden = this.layers().filter((layer) => !layer.visible).map((layer) => layer.name);
    if (!hidden.length) return svg;

    const rules = hidden
      .map((name) => `[data-layer="${CSS.escape(name)}"] { display: none !important; }`)
      .join(' ');
    return svg.replace('</svg>', `<style>${rules}</style></svg>`);
  });

  /** What a screen reader is told the image is (§1A.4). */
  readonly drawingDescription = computed(() => {
    const named = this.layers().map((layer) => layer.name).filter(Boolean);
    return named.length
      ? `Drawing, ${named.length} layers: ${named.slice(0, 8).join(', ')}`
      : 'Drawing';
  });

  /** The drawing as an object URL, revoked when it is replaced. */
  readonly drawingUrl = signal<string | null>(null);

  ngOnChanges(changes: SimpleChanges) {
    if (changes['svgContent'] && this.svgContent) {
      // Mirrored into a signal because drawingSvg() is computed and an @Input
      // is not reactive. Set after the parses below would leave one render
      // against the previous drawing's layers.
      this.content.set(this.svgContent);
      this.parseLayers();
      this.parseViewBox();
      // Index the drawing's own text so it can be searched. Without this the
      // search panel had nothing to look at for a drawing and answered every
      // query with "No matches found".
      this.state.drawingText.set(this.drawingSearch.extractText(this.svgContent));
      this.state.searchFocus.set(null);
    }
  }

  // ── Read the embedded drawing's own coordinate space so the markup
  //    overlay lines up with it exactly, at any zoom/pan level ──────
  private parseViewBox() {
    const parser = new DOMParser();
    const doc    = parser.parseFromString(this.svgContent, 'image/svg+xml');
    const svgEl  = doc.querySelector('svg');
    if (!svgEl) return;

    const viewBox = svgEl.getAttribute('viewBox');
    if (viewBox) {
      this.contentViewBox.set(viewBox);
      return;
    }
    const width  = parseFloat(svgEl.getAttribute('width')  || '') || 800;
    const height = parseFloat(svgEl.getAttribute('height') || '') || 600;
    this.contentViewBox.set(`0 0 ${width} ${height}`);
  }

  private parseLayers() {
    // Parse SVG to extract layer names from group IDs and data-layer attributes
    const parser = new DOMParser();
    const doc    = parser.parseFromString(this.svgContent, 'image/svg+xml');

    const layerMap = new Map<string, { color: string; count: number }>();

    // Method 1: Look for groups with data-layer or id="layer:NAME"
    doc.querySelectorAll('g[id^="layer:"], g[data-layer]').forEach(g => {
      const name  = g.getAttribute('data-layer') || g.id.replace('layer:', '');
      const color = this.extractColor(g) || this.layerColor(name);
      if (!layerMap.has(name)) {
        layerMap.set(name, { color, count: 0 });
      }
      layerMap.get(name)!.count += g.querySelectorAll('*').length;
    });

    // Method 2: ezdxf SVG uses class="layer-NAME" on elements
    doc.querySelectorAll('[class*="layer-"]').forEach(el => {
      const match = (el as SVGElement).className?.baseVal?.match(/layer-([^\s]+)/);
      if (match) {
        const name  = match[1];
        const color = this.extractColor(el) || this.layerColor(name);
        if (!layerMap.has(name)) {
          layerMap.set(name, { color, count: 0 });
        }
        layerMap.get(name)!.count += 1;
      }
    });

    // Method 3: Look for <g> with title children (common DXF SVG pattern)
    if (layerMap.size === 0) {
      doc.querySelectorAll('g').forEach(g => {
        const title = g.querySelector('title');
        if (title?.textContent) {
          const name  = title.textContent.trim();
          const color = this.extractColor(g) || this.layerColor(name);
          if (!layerMap.has(name)) {
            layerMap.set(name, { color, count: 0 });
          }
          layerMap.get(name)!.count += g.children.length;
        }
      });
    }

    this.layers.set(
      Array.from(layerMap.entries()).map(([name, info]) => ({
        name, color: info.color, visible: true, count: info.count
      })).sort((a, b) => a.name.localeCompare(b.name))
    );
  }

  private extractColor(el: Element): string {
    const stroke = el.getAttribute('stroke');
    if (stroke && stroke !== 'none' && stroke !== 'currentColor') return stroke;
    const fill = el.getAttribute('fill');
    if (fill && fill !== 'none' && fill !== 'currentColor') return fill;
    return '';
  }

  private layerColor(name: string): string {
    // Generate consistent color from layer name
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = ((hash << 5) - hash) + name.charCodeAt(i);
      hash |= 0;
    }
    const h = Math.abs(hash) % 360;
    return `hsl(${h}, 65%, 55%)`;
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

  // ── Markup drawing — mirrors PdfPageComponent's pointer handling,
  //    against this drawing's own viewBox instead of a rendered PDF page ──
  /** A CAD drawing is a single page, so everything on page 1 belongs here. */
  readonly shapesOnDrawing = computed(() =>
    this.state.shapes().filter((shape) => shape.pageNumber === 1));

  onPointerDown(e: MouseEvent | TouchEvent) {
    if (!this.drawingEnabled()) return;
    const tool = this.state.activeTool();
    const pt   = this.markup.getSvgPoint(e, this.markupSvg.nativeElement);

    if (this.markup.isTextTool(tool)) {
      this.drawing = true;
      this.handleTextTool(pt, tool);
      return;
    }

    if (this.markup.isVertexTool(tool)) {
      this.handlePolyClick(pt, tool, (e as MouseEvent).detail ?? 1);
      return;   // click-driven — never sets `drawing`, mouseup is a no-op
    }

    this.drawing = true;
    const shape = this.markup.startShape(
      tool, pt, 1,
      this.state.strokeColor(),
      this.state.strokeWidth(),
      this.state.fillOpacity(),
      'current-user'
    );
    this.activeShape.set(shape);
  }

  onPointerMove(e: MouseEvent | TouchEvent) {
    const active = this.activeShape();
    if (!active) return;
    const pt = this.markup.getSvgPoint(e, this.markupSvg.nativeElement);
    if (this.markup.isVertexTool(active.tool)) {
      this.polyHover = pt;
      return;
    }
    if (!this.drawing) return;
    this.activeShape.set(this.markup.updateShape(active, pt));
  }

  onPointerUp(e: MouseEvent | TouchEvent) {
    if (!this.drawing || !this.activeShape()) return;
    this.drawing = false;
    const shape = this.activeShape()!;
    if (this.markup.hasMinimumSize(shape)) {
      this.state.addShape(shape);
    }
    this.activeShape.set(null);
  }

  // ── Polygon / polyline: click to add a vertex, double-click to finish ──
  private handlePolyClick(pt: PointerPoint, tool: MarkupTool, clickDetail = 1) {
    const current = this.activeShape();

    // One decision covers every way of ending the shape, so the PDF page and
    // the CAD drawing cannot drift apart on which gestures work.
    if (current && current.tool === tool
        && this.markup.finishesShape(current, pt, this.closeTolerance(), clickDetail)) {
      this.finishVertexShape(current);
      return;
    }

    const shape = current && current.tool === tool
      ? this.markup.addVertex(current, pt)
      : this.markup.startShape(
          tool, pt, 1,
          this.state.strokeColor(), this.state.strokeWidth(), this.state.fillOpacity(),
          'current-user');

    // Radius and calibration take exactly two clicks and complete themselves.
    const required = this.markup.requiredVertices(tool);
    if (required !== null && (shape.points?.length ?? 0) >= required) {
      this.finishVertexShape(shape);
      return;
    }
    this.activeShape.set(shape);
  }

  onDoubleClick(e: MouseEvent) {
    const shape = this.activeShape();
    if (!shape || !this.markup.isVertexTool(shape.tool)) return;
    e.preventDefault();
    this.finishVertexShape(this.markup.removeLastVertex(shape));
  }

  /**
   * Finish the shape from the keyboard. Enter is the primary way out: unlike
   * a double-click it does not depend on two presses landing close enough
   * together in time and space to be recognised as one gesture.
   */
  @HostListener('document:keydown.enter')
  finishFromKeyboard() {
    const shape = this.activeShape();
    if (!this.markup.canFinish(shape)) return;
    this.finishVertexShape(shape!);
  }

  /** Abandon a half-drawn shape. Without this it could not be got rid of. */
  @HostListener('document:keydown.escape')
  cancelVertexShape() {
    const shape = this.activeShape();
    if (!shape || !this.markup.isVertexTool(shape.tool)) return;
    this.activeShape.set(null);
    this.polyHover = null;
  }

  /**
   * How near a vertex a click has to land to end the shape, expressed in this
   * overlay's own coordinates. Taken from the element's screen transform so it
   * is always the same distance to the eye, whatever the viewBox scale or the
   * zoom level.
   */
  private closeTolerance(): number {
    return this.markup.toleranceInUserUnits(this.markupSvg.nativeElement);
  }

  private finishVertexShape(shape: ShapeData) {
    this.polyHover = null;
    this.activeShape.set(null);
    if (!this.markup.hasMinimumSize(shape)) return;

    if (shape.tool === 'calibrate') {
      // Calibration defines the scale rather than recording a measurement,
      // so it hands its drawn length to the toolbar and draws nothing.
      this.state.pendingCalibrationPixels.set(
        this.measure.pathLength(shape.points ?? []) / this.state.zoom());
      return;
    }
    if (shape.tool === 'dimension' || shape.tool === 'area' || shape.tool === 'radius') {
      const { shape: described, entry } =
        this.measure.describe(shape, this.state.measurementScale(), this.state.zoom());
      this.state.addShape(described);
      this.state.addMeasurement({ ...entry, id: shape.id, page: 1 });
      return;
    }
    this.state.addShape(shape);
  }

  @HostListener('document:keydown.escape')
  cancelPolyInProgress() {
    const shape = this.activeShape();
    if (shape && this.markup.isVertexTool(shape.tool)) {
      this.activeShape.set(null);
      this.polyHover = null;
    }
  }

  previewShape(): ShapeData {
    const shape = this.activeShape()!;
    return this.markup.withPreviewPoint(shape, this.polyHover);
  }

  private handleTextTool(pt: PointerPoint, tool: MarkupTool) {
    const promptText = tool === 'stamp' ? 'Stamp text:'
      : tool === 'note' ? 'Sticky note:'
      : tool === 'callout' ? 'Callout text:' : 'Enter annotation text:';
    const text = prompt(promptText);
    if (text?.trim()) {
      const shape = this.markup.startShape(
        tool, pt, 1, this.state.strokeColor(), this.state.strokeWidth(), 0
      );
      this.state.addShape({ ...shape, text });
    }
    this.drawing = false;
  }
}
