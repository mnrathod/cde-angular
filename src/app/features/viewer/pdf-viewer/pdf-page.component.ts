import {
  Component, Input, Output, EventEmitter, signal, inject,
  OnInit, OnDestroy, OnChanges, SimpleChanges,
  ElementRef, ViewChild, ChangeDetectionStrategy
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
        (touchstart)="onPointerDown($event); $event.preventDefault()"
        (touchmove)="onPointerMove($event); $event.preventDefault()"
        (touchend)="onPointerUp($event)">

        <!-- Saved / persisted shapes -->
        @for (shape of state.shapes(); track shape.id) {
          @if (shape.pageNumber === pageNumber) {
            <g [innerHTML]="renderShape(shape)"></g>
          }
        }

        <!-- In-progress shape being drawn -->
        @if (activeShape()) {
          <g [innerHTML]="renderShape(activeShape()!)"></g>
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
export class PdfPageComponent implements OnInit, OnChanges, OnDestroy {
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

  cursorStyle = () => {
    switch (this.state.activeTool()) {
      case 'pan':    return 'grab';
      case 'select': return 'default';
      case 'text':   return 'text';
      default:       return 'crosshair';
    }
  };

  ngOnInit() {
    this.render();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['zoom'] || changes['pdfDoc'] || changes['pageNumber']) {
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

  // ── Unified pointer handling (mouse + touch) ─────────────────
  onPointerDown(e: MouseEvent | TouchEvent) {
    const tool = this.state.activeTool();
    if (tool === 'pan' || tool === 'select') return;

    const pt = this.markup.getSvgPoint(e, this.svg.nativeElement);
    this.drawing = true;

    if (tool === 'text' || tool === 'stamp') {
      this.handleTextTool(pt, tool);
      return;
    }

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
    if (!this.drawing || !this.activeShape()) return;
    const pt      = this.markup.getSvgPoint(e, this.svg.nativeElement);
    const updated = this.markup.updateShape(this.activeShape()!, pt);
    this.activeShape.set(updated);
  }

  onPointerUp(e: MouseEvent | TouchEvent) {
    if (!this.drawing || !this.activeShape()) return;
    this.drawing = false;
    const shape  = this.activeShape()!;
    // Only commit if the shape has meaningful size
    if (this.markup.hasMinimumSize(shape)) {
      this.state.addShape(shape);
    }
    this.activeShape.set(null);
  }

  // ── Text tool — show input prompt ───────────────────────────
  private handleTextTool(pt: PointerPoint, tool: MarkupTool) {
    const text = prompt(tool === 'stamp' ? 'Stamp text:' : 'Enter annotation text:');
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
