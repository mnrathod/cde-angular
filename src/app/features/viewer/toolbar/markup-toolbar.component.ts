import { Component, inject, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ViewerStateService, MarkupTool } from '../../../core/services/viewer/viewer-state.service';
import { FlattenService } from '../../../core/services/viewer/flatten.service';
import { AnnotationService } from '../../../core/services/viewer/annotation.service';
import { PdfEngineService } from '../../../core/services/viewer/pdf-engine.service';
import { RedactionService } from '../../../core/services/redaction.service';

interface Tool { id: MarkupTool; icon: string; label: string; key: string; }

@Component({
  selector: 'app-markup-toolbar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKey($event)' },
  template: `
    <div class="flex items-center px-3 py-1.5 gap-1 flex-shrink-0 flex-wrap border-b"
         style="background:#f8fafc;border-color:#dde1e7">

      <!-- Tool buttons -->
      @for (t of tools; track t.id) {
        <button
          (click)="setTool(t.id)"
          [disabled]="t.id === 'redact' && !isPdf()"
          [title]="t.id === 'redact' && !isPdf() ? 'Redaction is only available for PDF documents'
            : (t.id === 'polygon' || t.id === 'polyline') ? t.label + ' (' + t.key + ') — click to add points, double-click to finish'
            : t.label + ' (' + t.key + ')'"
          class="h-7 px-2.5 text-xs rounded border transition-all flex items-center gap-1 font-medium disabled:opacity-30 disabled:cursor-not-allowed"
          [class]="state.activeTool() === t.id
            ? 'bg-accent text-white border-accent shadow-sm'
            : 'bg-white text-gray-600 border-gray-300 hover:bg-blue-50 hover:text-accent hover:border-blue-300'">
          <span>{{ t.icon }}</span>
          <span class="hidden sm:inline">{{ t.label }}</span>
        </button>
      }

      <!-- Divider -->
      <div class="w-px h-5 bg-gray-300 mx-1 flex-shrink-0"></div>

      <!-- Stroke color -->
      <label class="flex items-center gap-1 cursor-pointer" title="Stroke color">
        <span class="text-xs text-gray-500">Color</span>
        <input type="color" [ngModel]="state.strokeColor()"
          (ngModelChange)="state.strokeColor.set($event)"
          class="h-6 w-8 rounded border border-gray-300 cursor-pointer p-0.5" />
      </label>

      <!-- Stroke width -->
      <label class="flex items-center gap-1" title="Line width">
        <span class="text-xs text-gray-500">Width</span>
        <select [ngModel]="state.strokeWidth()"
          (ngModelChange)="state.strokeWidth.set(+$event)"
          class="h-6 text-xs border border-gray-300 rounded px-1">
          <option [value]="1">1px</option>
          <option [value]="2">2px</option>
          <option [value]="3">3px</option>
          <option [value]="5">5px</option>
        </select>
      </label>

      <!-- Divider -->
      <div class="w-px h-5 bg-gray-300 mx-1 flex-shrink-0"></div>

      <!-- Undo / Redo / Clear -->
      <button (click)="state.undo()" [disabled]="!state.canUndo()"
        title="Undo (Ctrl+Z)"
        class="h-7 px-2.5 text-xs rounded border bg-white border-gray-300 hover:bg-gray-50 disabled:opacity-40">
        ↩ Undo
      </button>
      <button (click)="state.clearAll()"
        title="Clear all markup"
        class="h-7 px-2.5 text-xs rounded border bg-white border-gray-300 hover:bg-gray-50 text-red-500">
        🗑 Clear
      </button>

      <!-- Divider -->
      <div class="w-px h-5 bg-gray-300 mx-1 flex-shrink-0"></div>

      <!-- Save -->
      <button (click)="saveMarkup()"
        [class.ring-2]="state.dirty()"
        title="Save annotations"
        class="h-7 px-2.5 text-xs rounded border bg-white border-gray-300 hover:bg-gray-50 ring-accent">
        💾 {{ saving ? 'Saving...' : state.dirty() ? 'Save *' : 'Saved' }}
      </button>

      <!-- XFDF Export -->
      <button (click)="exportXfdf()" title="Export XFDF (Bluebeam/Acrobat/Procore compatible)"
        class="h-7 px-2.5 text-xs rounded border bg-white border-gray-300 hover:bg-gray-50">
        📤 XFDF
      </button>

      <!-- XFDF Import -->
      <label title="Import XFDF annotations"
        class="h-7 px-2.5 text-xs rounded border bg-white border-gray-300 hover:bg-gray-50 flex items-center cursor-pointer">
        📥 Import
        <input type="file" accept=".xfdf" class="hidden" (change)="importXfdf($event)" />
      </label>

      <!-- Flatten to PDF -->
      <button (click)="flattenPdf()" title="Flatten annotations into PDF"
        class="h-7 px-2.5 text-xs rounded border bg-white border-gray-300 hover:bg-gray-50">
        ⬇ Flatten PDF
      </button>

      <!-- Print -->
      <button (click)="print()" title="Print with annotations"
        class="h-7 px-2.5 text-xs rounded border bg-white border-gray-300 hover:bg-gray-50">
        🖨 Print
      </button>

      <!-- Apply redaction (PDF only) -->
      @if (state.redactionRegions().length > 0) {
        <button (click)="applyRedaction()" [disabled]="redacting"
          title="Permanently burn these regions into a new PDF and download it"
          class="h-7 px-2.5 text-xs rounded border bg-red-50 border-red-300 text-red-700 hover:bg-red-100 disabled:opacity-40">
          ⬛ {{ redacting ? 'Redacting...' : 'Apply Redaction (' + state.redactionRegions().length + ')' }}
        </button>
      }

      <!-- Zoom controls -->
      <div class="ml-auto flex items-center gap-1">
        <button (click)="state.zoomOut()" class="h-7 w-7 text-xs rounded border bg-white border-gray-300 hover:bg-gray-50">−</button>
        <span class="text-xs text-gray-600 w-12 text-center">{{ (state.zoom() * 100).toFixed(0) }}%</span>
        <button (click)="state.zoomIn()"  class="h-7 w-7 text-xs rounded border bg-white border-gray-300 hover:bg-gray-50">+</button>
        <button (click)="state.zoomFit()" class="h-7 px-2 text-xs rounded border bg-white border-gray-300 hover:bg-gray-50">Fit</button>
      </div>
    </div>
  `
})
export class MarkupToolbarComponent {
  state      = inject(ViewerStateService);
  annService    = inject(AnnotationService);
  pdfEngine     = inject(PdfEngineService);
  flattenService = inject(FlattenService);
  redactionService = inject(RedactionService);

  saving = false;
  redacting = false;

  @Output() saveRequested  = new EventEmitter<void>();
  @Output() printRequested = new EventEmitter<void>();

  readonly tools: Tool[] = [
    { id: 'pan',       icon: '✋', label: 'Pan',       key: 'V' },
    { id: 'select',    icon: '↖',  label: 'Select',    key: 'S' },
    { id: 'line',      icon: '╱',  label: 'Line',      key: 'L' },
    { id: 'arrow',     icon: '→',  label: 'Arrow',     key: 'A' },
    { id: 'rect',      icon: '□',  label: 'Rect',      key: 'R' },
    { id: 'circle',    icon: '○',  label: 'Circle',    key: 'C' },
    { id: 'ellipse',   icon: '⬭',  label: 'Ellipse',   key: 'E' },
    { id: 'polygon',   icon: '⬠',  label: 'Polygon',   key: 'G' },
    { id: 'polyline',  icon: '⌁',  label: 'Polyline',  key: 'Y' },
    { id: 'freehand',  icon: '✏',  label: 'Freehand',  key: 'F' },
    { id: 'cloud',     icon: '☁',  label: 'Cloud',     key: 'K' },
    { id: 'text',      icon: 'T',  label: 'Text',      key: 'T' },
    { id: 'highlight', icon: '▌',  label: 'Highlight', key: 'H' },
    { id: 'underline', icon: 'U',  label: 'Underline', key: 'U' },
    { id: 'strikeout', icon: 'S̶',  label: 'Strikeout', key: 'D' },
    { id: 'squiggly',  icon: '〜', label: 'Squiggly',  key: 'Q' },
    { id: 'stamp',     icon: '🔴', label: 'Stamp',     key: 'P' },
    { id: 'note',      icon: '🗒',  label: 'Note',      key: 'N' },
    { id: 'dimension', icon: '↔',  label: 'Measure',   key: 'M' },
    { id: 'callout',   icon: '💬', label: 'Callout',   key: 'O' },
    { id: 'redact',    icon: '⬛', label: 'Redact',    key: 'X' },
  ];

  setTool(t: MarkupTool) {
    if (t === 'redact' && !this.isPdf()) return;   // matches the button's disabled state
    this.state.activeTool.set(t);
  }

  isPdf(): boolean {
    return this.state.viewerData()?.type === 'pdf';
  }

  applyRedaction() {
    const docId   = this.state.documentId();
    const regions = this.state.redactionRegions();
    if (!regions.length) return;

    this.redacting = true;
    this.redactionService.redact(docId, regions).subscribe({
      next: blob => {
        this.redacting = false;
        const docName = this.state.viewerData()?.name || 'document';
        const url = URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href = url; a.download = `${docName}_redacted.pdf`; a.click();
        URL.revokeObjectURL(url);
        this.state.clearRedactionRegions();
      },
      error: () => {
        this.redacting = false;
        alert('Redaction failed — check that the document converter service is running.');
      }
    });
  }

  onKey(e: KeyboardEvent) {
    if (e.ctrlKey && e.key === 'z')  { e.preventDefault(); this.state.undo(); return; }
    if (e.ctrlKey && e.key === 's')  { e.preventDefault(); this.saveMarkup();  return; }
    if (e.ctrlKey && e.key === 'p')  { e.preventDefault(); this.print();        return; }
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    // Single-key shortcuts
    const match = this.tools.find(t => t.key.toLowerCase() === e.key.toLowerCase());
    if (match) this.setTool(match.id);
  }

  saveMarkup() { this.saveRequested.emit(); }
  print()      { this.printRequested.emit(); }

  async flattenPdf() {
    const pdfDoc = this.state.pdfDoc();
    const shapes = this.state.shapes();
    if (!pdfDoc || !shapes.length) {
      alert('No annotations to flatten, or no PDF loaded');
      return;
    }
    const { MarkupEngineService } = await import('../../../core/services/viewer/markup-engine.service');
    const markupEngine = new MarkupEngineService();
    const docName = this.state.viewerData()?.name || 'document';
    await this.flattenService.flattenClientSide(
      this.pdfEngine, pdfDoc, shapes, markupEngine, docName
    );
  }

  exportXfdf() {
    const docId = this.state.documentId();
    this.annService.exportXfdf(docId).subscribe(blob => {
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href = url; a.download = `annotations-doc-${docId}.xfdf`; a.click();
      URL.revokeObjectURL(url);
    });
  }

  importXfdf(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const docId = this.state.documentId();
    this.annService.importXfdf(docId, file).subscribe({
      next: anns => {
        this.state.setAnnotationsSaved(anns);
        // Also load shapes from returned annotations
        const shapes = this.annService.annotationsToShapes(anns);
        shapes.forEach(s => this.state.shapes.update(all => [...all, s]));
      },
      error: err => console.error('XFDF import failed', err)
    });
  }
}
