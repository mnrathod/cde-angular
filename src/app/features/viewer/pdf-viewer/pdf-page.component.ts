import {
  Component, Input, Output, EventEmitter, signal, computed, inject,
  OnInit, AfterViewInit, OnDestroy, OnChanges, SimpleChanges,
  ElementRef, ViewChild, ChangeDetectionStrategy, HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { PdfEngineService } from '../../../core/services/viewer/pdf-engine.service';
import { MarkupEngineService, PointerPoint } from '../../../core/services/viewer/markup-engine.service';
import { ViewerStateService, ShapeData, MarkupTool } from '../../../core/services/viewer/viewer-state.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'app-pdf-page',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative select-none pdf-page-wrap"
         [style.width.px]="pageWidth()"
         [style.height.px]="pageHeight()">

      <!-- PDF canvas -->
      <canvas #pageCanvas
        class="block shadow-lg"
        [style.width.px]="pageWidth()"
        [style.height.px]="pageHeight()">
      </canvas>

      <!-- Text layer (for text selection + search highlight) -->
      <div #textLayer
        class="absolute top-0 left-0 text-layer overflow-hidden"
        [style.width.px]="pageWidth()"
        [style.height.px]="pageHeight()">
      </div>

      <!-- Annotation SVG overlay — BOUND to this page's coordinate system -->
      <svg #markupSvg
        class="absolute top-0 left-0"
        [attr.width]="pageWidth()"
        [attr.height]="pageHeight()"
        [attr.viewBox]="'0 0 ' + pageWidth() + ' ' + pageHeight()"
        [style.cursor]="cursorStyle()"
        (mousedown)="onPointerDown($event)"
        (mousemove)="onPointerMove($event)"
        (mouseup)="onPointerUp($event)"
        (dblclick)="onDoubleClick($event)"
        (touchstart)="onPointerDown($event); $event.preventDefault()"
        (touchmove)="onPointerMove($event); $event.preventDefault()"
        (touchend)="onPointerUp($event)">

        <!-- Saved / persisted shapes -->
        @for (shape of state.shapes(); track shape.id) {
          @if (shape.pageNumber === pageNumber) {
            <g [innerHTML]="renderShape(shape)"></g>
          }
        }

        <!-- Committed redaction regions (stored in PDF-point space, converted
             back to this page's current screen pixels — stays correctly
             positioned across zoom changes, unlike ShapeData) -->
        @for (region of redactionRegionsOnPage(); track region.id) {
          <rect [attr.x]="region.screenX" [attr.y]="region.screenY"
                [attr.width]="region.screenWidth" [attr.height]="region.screenHeight"
                fill="#000000" stroke="#000000"/>
        }

        <!-- In-progress shape being drawn (polygon/polyline rubber-band
             to the cursor between clicks via previewShape()) -->
        @if (activeShape()) {
          <g [innerHTML]="renderShape(previewShape())"></g>
        }
      </svg>

      <!-- Page number label -->
      <div class="absolute bottom-1 right-2 text-xs text-white/50 select-none pointer-events-none">
        {{ pageNumber }}
      </div>
    </div>
  `,
  styles: [`
    .text-layer { pointer-events: none; }
    .text-layer span {
      position: absolute;
      white-space: pre;
      transform-origin: 0% 0%;
      color: transparent;
      pointer-events: auto;
      cursor: text;
    }
    .text-layer .highlight { background: rgba(255,255,0,0.4); }
  `]
})
export class PdfPageComponent implements OnInit, AfterViewInit, OnChanges, OnDestroy {
  @Input({ required: true }) pdfDoc!:    any;
  @Input({ required: true }) pageNumber!: number;
  @Input()                   zoom        = 1.0;
  @Input()                   searchQuery = '';

  @ViewChild('pageCanvas')  canvas!:    ElementRef<HTMLCanvasElement>;
  @ViewChild('markupSvg')   svg!:       ElementRef<SVGSVGElement>;
  @ViewChild('textLayer')   textLayer!: ElementRef<HTMLDivElement>;

  state   = inject(ViewerStateService);
  engine  = inject(PdfEngineService);
  markup  = inject(MarkupEngineService);
  sanitizer = inject(DomSanitizer);

  pageWidth  = signal(0);
  pageHeight = signal(0);
  activeShape = signal<ShapeData | null>(null);
  private drawing = false;
  private viewport: any = null;
  // Live cursor position while a polygon/polyline is mid-click-sequence,
  // so the in-progress shape rubber-bands to the pointer between vertices.
  private polyHover: PointerPoint | null = null;

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
    this.render();
  }

  ngOnChanges(changes: SimpleChanges) {
    // Skip the very first call — the view (and @ViewChild canvas) isn't
    // ready yet; ngAfterViewInit handles the initial render instead.
    const isFirstChange = Object.values(changes).some(c => c.isFirstChange());
    if (!isFirstChange && (changes['zoom'] || changes['pdfDoc'] || changes['pageNumber'])) {
      this.render();
    }
    if (changes['searchQuery']) {
      this.highlightSearch();
    }
  }

  ngOnDestroy() { /* cleanup */ }

  async render() {
    if (!this.pdfDoc || !this.canvas) return;
    const result = await this.engine.renderPage(
      this.pdfDoc, this.pageNumber, this.canvas.nativeElement, this.zoom
    );
    this.pageWidth.set(result.width);
    this.pageHeight.set(result.height);
    this.viewport = result.viewport;
    if (this.searchQuery) this.highlightSearch();
  }

  renderShape(s: ShapeData): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(this.markup.shapeToSvg(s));
  }

  // ── Committed redaction regions for this page, converted from the
  //    canonical PDF-point storage back into this page's current screen
  //    pixels. Recomputes whenever pageWidth/pageHeight change (i.e. on
  //    zoom), so — unlike ShapeData — redaction boxes stay correctly
  //    positioned across zoom changes instead of drifting. ─────────────
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

  // ── Unified pointer handling (mouse + touch) ─────────────────
  onPointerDown(e: MouseEvent | TouchEvent) {
    const tool = this.state.activeTool();
    if (tool === 'pan' || tool === 'select') return;

    const pt = this.markup.getSvgPoint(e, this.svg.nativeElement);

    if (tool === 'text' || tool === 'stamp' || tool === 'note') {
      this.drawing = true;
      this.handleTextTool(pt, tool);
      return;
    }

    if (tool === 'polygon' || tool === 'polyline') {
      this.handlePolyClick(pt, tool);
      return;   // click-driven — never sets `drawing`, mouseup is a no-op
    }

    this.drawing = true;
    const shape = this.markup.startShape(
      tool, pt, this.pageNumber,
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
    const pt = this.markup.getSvgPoint(e, this.svg.nativeElement);
    if (active.tool === 'polygon' || active.tool === 'polyline') {
      this.polyHover = pt;   // rubber-band only; vertices are click-committed
      return;
    }
    if (!this.drawing) return;
    this.activeShape.set(this.markup.updateShape(active, pt));
  }

  onPointerUp(e: MouseEvent | TouchEvent) {
    if (!this.drawing || !this.activeShape()) return;
    this.drawing = false;
    const shape  = this.activeShape()!;
    // Only commit if the shape has meaningful size
    if (this.markup.hasMinimumSize(shape)) {
      if (shape.tool === 'redact') {
        this.commitRedactionRegion(shape);
      } else {
        this.state.addShape(shape);
      }
    }
    this.activeShape.set(null);
  }

  // ── Polygon / polyline: click to add a vertex, double-click to finish ──
  private handlePolyClick(pt: PointerPoint, tool: MarkupTool) {
    const current = this.activeShape();
    if (current && current.tool === tool) {
      this.activeShape.set(this.markup.addVertex(current, pt));
    } else {
      this.activeShape.set(this.markup.startShape(
        tool, pt, this.pageNumber,
        this.state.strokeColor(), this.state.strokeWidth(), this.state.fillOpacity(),
        'current-user'
      ));
    }
  }

  onDoubleClick(e: MouseEvent) {
    const shape = this.activeShape();
    if (!shape || (shape.tool !== 'polygon' && shape.tool !== 'polyline')) return;
    e.preventDefault();
    // The dblclick's second click already added a spurious vertex — drop it.
    const finished = this.markup.removeLastVertex(shape);
    this.polyHover = null;
    if (this.markup.hasMinimumSize(finished)) {
      this.state.addShape(finished);
    }
    this.activeShape.set(null);
  }

  @HostListener('document:keydown.escape')
  cancelPolyInProgress() {
    const shape = this.activeShape();
    if (shape && (shape.tool === 'polygon' || shape.tool === 'polyline')) {
      this.activeShape.set(null);
      this.polyHover = null;
    }
  }

  // ── Live shape used for rendering only — appends the un-committed
  //    cursor position to polygon/polyline so they rubber-band to the
  //    pointer between clicks; every other tool renders unchanged. ──────
  previewShape(): ShapeData {
    const shape = this.activeShape()!;
    return this.markup.withPreviewPoint(shape, this.polyHover);
  }

  // Convert a drawn rect (screen pixels, top-left origin, current zoom)
  // into the backend's coordinate system (PDF points, origin bottom-left).
  private commitRedactionRegion(shape: ShapeData) {
    const zoom         = this.zoom;
    const nativeHeight = this.pageHeight() / zoom;
    const pdfWidth      = (shape.width  || 0) / zoom;
    const pdfHeight     = (shape.height || 0) / zoom;
    const pdfX          = (shape.x || 0) / zoom;
    const topNative      = (shape.y || 0) / zoom;
    const pdfY           = nativeHeight - topNative - pdfHeight;

    this.state.addRedactionRegion({
      id: this.markup.newId(),
      page: this.pageNumber,
      x: pdfX, y: pdfY, width: pdfWidth, height: pdfHeight
    });
  }

  // ── Text tool — show input prompt ───────────────────────────
  private handleTextTool(pt: PointerPoint, tool: MarkupTool) {
    const promptText = tool === 'stamp' ? 'Stamp text:'
      : tool === 'note' ? 'Sticky note:' : 'Enter annotation text:';
    const text = prompt(promptText);
    if (text?.trim()) {
      const shape = this.markup.startShape(
        tool, pt, this.pageNumber,
        this.state.strokeColor(), this.state.strokeWidth(), 0
      );
      this.state.addShape({ ...shape, text });
    }
    this.drawing = false;
  }

  // ── Highlight search matches on the text layer ───────────────
  private async highlightSearch() {
    if (!this.textLayer || !this.pdfDoc || !this.searchQuery) return;
    const items = await this.engine.getTextLayerItems(
      this.pdfDoc, this.pageNumber, this.viewport
    );
    const el    = this.textLayer.nativeElement;
    el.innerHTML = '';
    const q = this.searchQuery.toLowerCase();
    items.forEach((item: any) => {
      const span = document.createElement('span');
      span.textContent = item.str;
      if (item.str.toLowerCase().includes(q)) {
        span.classList.add('highlight');
      }
      // Position using PDF.js transform matrix
      if (item.transform) {
        const [a,b,c,d,e,f] = item.transform;
        span.style.transform = `matrix(${a},${b},${c},${d},${e},${f})`;
        span.style.fontSize  = `${Math.sqrt(a*a+b*b)}px`;
        span.style.left      = `${e}px`;
        span.style.top       = `${this.pageHeight() - f}px`;
      }
      el.appendChild(span);
    });
  }

  // ── Export this page's markup as SVG string (for print) ─────
  getSvgForPrint(): string {
    const shapes = this.state.shapes().filter(s => s.pageNumber === this.pageNumber);
    return this.markup.shapesToSvgContent(shapes, this.pageWidth(), this.pageHeight());
  }
}
