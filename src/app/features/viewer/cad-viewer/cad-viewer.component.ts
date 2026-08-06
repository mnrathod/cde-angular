import {
  Component, inject, signal, computed, Input, OnChanges,
  SimpleChanges, ChangeDetectionStrategy, ElementRef, ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MarkupEngineService, PointerPoint } from '../../../core/services/viewer/markup-engine.service';
import { ViewerStateService, ShapeData } from '../../../core/services/viewer/viewer-state.service';

export interface CadLayer {
  name:    string;
  color:   string;
  visible: boolean;
  count:   number;
}

@Component({
  selector: 'app-cad-viewer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-1 overflow-hidden min-h-0">

      <!-- SVG canvas -->
      <div #svgContainer
        class="flex-1 overflow-auto flex items-start justify-center p-4 relative"
        style="background:#1a1d27; cursor: grab"
        (wheel)="onWheel($event)">

        <div #svgWrap [style.transform]="transform()"
             style="transform-origin: top left; transition: transform .1s; position: relative; display: inline-block;">
          <div [innerHTML]="processedSvg()" class="cad-svg-host"></div>

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
            (touchstart)="onPointerDown($event); $event.preventDefault()"
            (touchmove)="onPointerMove($event); $event.preventDefault()"
            (touchend)="onPointerUp($event)">

            <!-- Saved / in-progress shapes (CAD/SVG drawings have a single "page") -->
            @for (shape of state.shapes(); track shape.id) {
              @if (shape.pageNumber === 1) {
                <g [innerHTML]="renderShape(shape)"></g>
              }
            }
            @if (activeShape()) {
              <g [innerHTML]="renderShape(activeShape()!)"></g>
            }
          </svg>
        </div>
      </div>

      <!-- Layer panel -->
      <div class="w-56 bg-white border-l border-gray-200 flex flex-col flex-shrink-0">
        <div class="p-3 border-b border-gray-200 flex items-center justify-between">
          <span class="text-xs font-semibold text-gray-600 uppercase tracking-wide">Layers</span>
          <div class="flex gap-1">
            <button (click)="showAll()"   class="text-xs text-blue-600 hover:underline">All</button>
            <span class="text-gray-300">|</span>
            <button (click)="hideAll()"   class="text-xs text-gray-500 hover:underline">None</button>
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
            <div class="text-xs text-gray-400 text-center py-6">No layer data</div>
          }
        </div>

        <!-- Stats -->
        <div class="p-3 border-t border-gray-200 text-xs text-gray-500 space-y-1">
          <div class="flex justify-between">
            <span>Visible layers</span>
            <span class="font-mono">{{ visibleCount() }} / {{ layers().length }}</span>
          </div>
          @if (dxfVersion) {
            <div class="flex justify-between">
              <span>DXF version</span>
              <span class="font-mono">{{ dxfVersion }}</span>
            </div>
          }
          @if (entityCount > 0) {
            <div class="flex justify-between">
              <span>Entities</span>
              <span class="font-mono">{{ entityCount }}</span>
            </div>
          }
        </div>

        <!-- Zoom controls -->
        <div class="p-2 border-t border-gray-200 flex items-center justify-center gap-2">
          <button (click)="zoomOut()" class="h-7 w-7 text-sm rounded border border-gray-300 bg-white hover:bg-gray-50">−</button>
          <span class="text-xs text-gray-500 w-12 text-center">{{ (zoom() * 100).toFixed(0) }}%</span>
          <button (click)="zoomIn()"  class="h-7 w-7 text-sm rounded border border-gray-300 bg-white hover:bg-gray-50">+</button>
          <button (click)="resetZoom()" class="h-7 px-2 text-xs rounded border border-gray-300 bg-white hover:bg-gray-50">Fit</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host ::ng-deep .cad-svg-host svg { display: block; }
    :host ::ng-deep .cad-svg-host svg [data-layer] { transition: opacity .15s; }
  `]
})
export class CadViewerComponent implements OnChanges {
  @Input({ required: true }) svgContent!: string;
  @Input() dxfVersion  = '';
  @Input() entityCount = 0;
  private _dxfV = signal('');
  private _entC = signal(0);
  @ViewChild('svgWrap') svgWrap!: ElementRef<HTMLDivElement>;
  @ViewChild('markupSvg') markupSvg!: ElementRef<SVGSVGElement>;

  private sanitizer = inject(DomSanitizer);
  state  = inject(ViewerStateService);
  markup = inject(MarkupEngineService);

  layers        = signal<CadLayer[]>([]);
  zoom          = signal(1.0);
  panX          = signal(0);
  panY          = signal(0);
  visibleCount  = computed(() => this.layers().filter(l => l.visible).length);

  // ── Markup ───────────────────────────────────────────────────
  contentViewBox = signal('0 0 800 600');
  activeShape    = signal<ShapeData | null>(null);
  private drawing = false;

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

  transform = computed(() =>
    `translate(${this.panX()}px, ${this.panY()}px) scale(${this.zoom()})`
  );

  processedSvg = computed((): SafeHtml => {
    if (!this.svgContent) return '';
    const hiddenLayers = this.layers().filter(l => !l.visible).map(l => l.name);
    if (!hiddenLayers.length) {
      return this.sanitizer.bypassSecurityTrustHtml(this.svgContent);
    }
    // Hide elements on invisible layers via CSS in the SVG
    const styleRules = hiddenLayers
      .map(l => `[data-layer="${CSS.escape(l)}"] { display: none !important; }`)
      .join(' ');
    const injected = this.svgContent.replace(
      '<svg ',
      `<svg><defs><style>${styleRules}</style></defs><svg `.replace('<svg ><defs>', '<svg ').replace('<svg>', '')
    );
    // Simpler: inject a style tag
    const withStyle = this.svgContent.replace(
      '</svg>',
      `<style>${styleRules}</style></svg>`
    );
    return this.sanitizer.bypassSecurityTrustHtml(withStyle);
  });

  ngOnChanges(changes: SimpleChanges) {
    if (changes['svgContent'] && this.svgContent) {
      this.parseLayers();
      this.parseViewBox();
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
      this.zoom.update(z => Math.max(0.1, Math.min(10, z + delta)));
    }
  }

  zoomIn()    { this.zoom.update(z => Math.min(z * 1.25, 10)); }
  zoomOut()   { this.zoom.update(z => Math.max(z / 1.25, 0.1)); }
  resetZoom() { this.zoom.set(1); this.panX.set(0); this.panY.set(0); }

  // ── Markup drawing — mirrors PdfPageComponent's pointer handling,
  //    against this drawing's own viewBox instead of a rendered PDF page ──
  renderShape(s: ShapeData): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(this.markup.shapeToSvg(s));
  }

  onPointerDown(e: MouseEvent | TouchEvent) {
    if (!this.drawingEnabled()) return;
    const tool = this.state.activeTool();
    const pt   = this.markup.getSvgPoint(e, this.markupSvg.nativeElement);
    this.drawing = true;

    if (tool === 'text' || tool === 'stamp') {
      this.handleTextTool(pt, tool);
      return;
    }

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
    if (!this.drawing || !this.activeShape()) return;
    const pt      = this.markup.getSvgPoint(e, this.markupSvg.nativeElement);
    const updated = this.markup.updateShape(this.activeShape()!, pt);
    this.activeShape.set(updated);
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

  private handleTextTool(pt: PointerPoint, tool: 'text' | 'stamp') {
    const text = prompt(tool === 'stamp' ? 'Stamp text:' : 'Enter annotation text:');
    if (text?.trim()) {
      const shape = this.markup.startShape(
        tool, pt, 1, this.state.strokeColor(), this.state.strokeWidth(), 0
      );
      this.state.addShape({ ...shape, text });
    }
    this.drawing = false;
  }
}
