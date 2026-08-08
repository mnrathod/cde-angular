import { Component, inject, Output, EventEmitter, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ViewerStateService, MarkupTool } from '../../../core/services/viewer/viewer-state.service';
import { FlattenService } from '../../../core/services/viewer/flatten.service';
import { AnnotationService } from '../../../core/services/viewer/annotation.service';
import { RedactionService } from '../../../core/services/redaction.service';
import { OcrService } from '../../../core/services/ocr.service';
import {
  MeasurementService, MeasurementUnit, MEASUREMENT_UNITS
} from '../../../core/services/viewer/measurement.service';

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
      <button (click)="state.redo()" [disabled]="!state.canRedo()"
        title="Redo (Ctrl+Y)"
        class="h-7 px-2.5 text-xs rounded border bg-white border-gray-300 hover:bg-gray-50 disabled:opacity-40">
        ↪ Redo
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
        💾 {{ saving() ? 'Saving...' : state.dirty() ? 'Save *' : 'Saved' }}
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

      <!-- Flatten annotations into the page -->
      <button (click)="flattenPdf()" [disabled]="!isPdf() || flattening()"
        [title]="!isPdf()
          ? 'Flattening is only available for PDF documents'
          : 'Bake annotations into the page as permanent content'"
        class="h-7 px-2.5 text-xs rounded border bg-white border-gray-300 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">
        ▤ {{ flattening() ? 'Flattening...' : 'Flatten' }}
      </button>

      <!-- Scale calibration -->
      <button (click)="startCalibration()"
        [class.ring-2]="state.activeTool() === 'calibrate'"
        [title]="state.isCalibrated()
          ? 'Recalibrate: draw a line over a known distance'
          : 'Measurements are in pixels until the drawing is calibrated'"
        class="h-7 px-2.5 text-xs rounded border ring-amber-400
               {{ state.isCalibrated()
                    ? 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                    : 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100' }}">
        ⚖ {{ state.isCalibrated() ? scaleLabel() : 'Calibrate' }}
      </button>

      <!-- OCR: scanned PDF → searchable PDF -->
      <button (click)="runOcr()" [disabled]="!isPdf() || ocrRunning()"
        [title]="!isPdf()
          ? 'OCR is only available for PDF documents'
          : 'Make a scanned PDF searchable by adding an invisible text layer'"
        class="h-7 px-2.5 text-xs rounded border bg-white border-gray-300 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">
        🔎 {{ ocrRunning() ? 'Running OCR...' : 'OCR' }}
      </button>

      <!-- Print -->
      <button (click)="print()" title="Print with annotations"
        class="h-7 px-2.5 text-xs rounded border bg-white border-gray-300 hover:bg-gray-50">
        🖨 Print
      </button>

      <!-- Apply redaction (PDF only) -->
      @if (state.redactionRegions().length > 0) {
        <button (click)="applyRedaction()" [disabled]="redacting()"
          title="Permanently destroy the content under these regions and commit a new version"
          class="h-7 px-2.5 text-xs rounded border bg-red-50 border-red-300 text-red-700 hover:bg-red-100 disabled:opacity-40">
          ⬛ {{ redacting() ? 'Redacting...' : 'Apply Redaction (' + state.redactionRegions().length + ')' }}
        </button>
      }

      <!-- Outcome of the last processing run -->
      @if (state.processingMessage()) {
        <button (click)="state.sidebarTab.set('versions'); state.processingMessage.set('')"
          title="Open version history"
          class="h-7 px-2.5 text-xs rounded border bg-emerald-50 border-emerald-300 text-emerald-800
                 hover:bg-emerald-100 max-w-[22rem] truncate">
          ✓ {{ state.processingMessage() }}
        </button>
      }

      <!-- Calibration dialog: opens once the reference line has been drawn -->
      @if (state.pendingCalibrationPixels() > 0) {
        <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-[600] flex items-center justify-center">
          <div class="bg-white rounded-lg shadow-2xl p-6 w-80">
            <h3 class="font-semibold text-gray-800 mb-1">⚖ Calibrate Scale</h3>
            <p class="text-xs text-gray-500 mb-4">
              The line you drew is
              <span class="font-mono font-semibold">{{ state.pendingCalibrationPixels().toFixed(1) }} px</span>.
              What is that distance on the drawing?
            </p>

            <div class="flex gap-2 mb-3">
              <input type="number" [(ngModel)]="calibrationValue" name="calibrationValue"
                min="0" step="any" placeholder="e.g. 5"
                class="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded
                       focus:outline-none focus:ring-2 focus:ring-accent" />
              <select [(ngModel)]="calibrationUnit" name="calibrationUnit"
                class="px-2 py-1.5 text-sm border border-gray-300 rounded
                       focus:outline-none focus:ring-2 focus:ring-accent">
                @for (unit of units; track unit) { <option [value]="unit">{{ unit }}</option> }
              </select>
            </div>

            @if (calibrationError()) {
              <div class="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2 mb-3">
                {{ calibrationError() }}
              </div>
            }

            <div class="flex gap-2 justify-end">
              <button (click)="cancelCalibration()"
                class="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50">Cancel</button>
              <button (click)="applyCalibration()"
                class="px-3 py-1.5 text-xs bg-accent text-white rounded hover:bg-blue-700 font-semibold">
                Apply
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Zoom controls -->
      <div class="ml-auto flex items-center gap-1">
        <button (click)="state.zoomOut()" class="h-7 w-7 text-xs rounded border bg-white border-gray-300 hover:bg-gray-50">−</button>
        <span class="text-xs text-gray-600 w-12 text-center">{{ (state.zoom() * 100).toFixed(0) }}%</span>
        <button (click)="state.zoomIn()"  class="h-7 w-7 text-xs rounded border bg-white border-gray-300 hover:bg-gray-50">+</button>
        <button (click)="state.zoomFit()" class="h-7 px-2 text-xs rounded border bg-white border-gray-300 hover:bg-gray-50">Fit</button>
        <button (click)="state.rotateClockwise()"
          [title]="'Rotate 90° clockwise' + (state.rotation() ? ' (currently ' + state.rotation() + '°)' : '')"
          class="h-7 px-2 text-xs rounded border bg-white border-gray-300 hover:bg-gray-50"
          [class.ring-2]="state.rotation() !== 0">
          ⟳{{ state.rotation() ? ' ' + state.rotation() + '°' : '' }}
        </button>
      </div>
    </div>
  `
})
export class MarkupToolbarComponent {
  state      = inject(ViewerStateService);
  annService    = inject(AnnotationService);
  flattenService = inject(FlattenService);
  redactionService = inject(RedactionService);
  ocrService       = inject(OcrService);
  measure          = inject(MeasurementService);

  // Signals, not plain fields: this component is OnPush, so a bare field
  // mutated from an async HTTP callback never re-renders — the button would
  // stay stuck on "Redacting..."/"Running OCR..." after the call finished.
  readonly saving     = signal(false);
  readonly redacting  = signal(false);
  readonly ocrRunning = signal(false);
  readonly flattening = signal(false);

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
    { id: 'area',      icon: '⬡',  label: 'Area',      key: 'Q' },
    { id: 'radius',    icon: '◎',  label: 'Radius',    key: 'E' },
    { id: 'callout',   icon: '💬', label: 'Callout',   key: 'O' },
    { id: 'redact',    icon: '⬛', label: 'Redact',    key: 'X' },
  ];

  /** Tools whose readouts depend on the drawing's scale. */
  private static readonly MEASUREMENT_TOOLS: MarkupTool[] = ['dimension', 'area', 'radius'];

  isMeasurementTool(tool: MarkupTool): boolean {
    return MarkupToolbarComponent.MEASUREMENT_TOOLS.includes(tool);
  }

  setTool(t: MarkupTool) {
    if (t === 'redact' && !this.isPdf()) return;   // matches the button's disabled state
    this.state.activeTool.set(t);
  }

  isPdf(): boolean {
    return this.state.viewerData()?.type === 'pdf';
  }

  /**
   * Burn the marked regions out of the document. The result becomes the
   * document's current version, so the removed content is gone for every
   * later reader and every later operation — not just in a copy the person
   * who ran it happens to hold.
   */
  applyRedaction() {
    const docId   = this.state.documentId();
    const regions = this.state.redactionRegions();
    if (!regions.length) return;

    this.redacting.set(true);
    this.redactionService.redact(docId, regions).subscribe({
      next: result => {
        this.redacting.set(false);
        this.state.clearRedactionRegions();
        this.state.applyVersionCommit(result.version, result.summary);
      },
      error: err => {
        this.redacting.set(false);
        this.state.processingMessage.set(this.failureMessage(err, 'Redaction'));
      }
    });
  }

  /**
   * Turn a scanned PDF into a searchable one by adding an invisible text
   * layer. Committed as a new version, so the text is available to search,
   * selection and any later processing rather than living in a side copy.
   */
  runOcr() {
    if (!this.isPdf()) return;

    this.ocrRunning.set(true);
    this.ocrService.makeSearchable(this.state.documentId()).subscribe({
      next: result => {
        this.ocrRunning.set(false);
        this.state.applyVersionCommit(result.version, result.summary);
      },
      error: err => {
        this.ocrRunning.set(false);
        this.state.processingMessage.set(this.failureMessage(err, 'OCR'));
      }
    });
  }

  /**
   * Server error text is authored by the backend for display; anything else
   * gets a generic line naming the likely cause rather than the exception.
   */
  private failureMessage(err: { status?: number; error?: { message?: string } }, action: string): string {
    if (err.status === 503) return `${action} failed — the document converter service is not running.`;
    return err.error?.message ?? `${action} failed.`;
  }

  // ── Scale calibration ────────────────────────────────────────
  readonly units = MEASUREMENT_UNITS;
  calibrationValue: number | null = null;
  calibrationUnit: MeasurementUnit = 'm';
  readonly calibrationError = signal('');

  /** Short readout for the toolbar button, e.g. "1px = 0.025 m". */
  scaleLabel(): string {
    const scale = this.state.measurementScale();
    return `1px = ${Number(scale.unitsPerPixel.toFixed(5))} ${scale.unit}`;
  }

  startCalibration() {
    this.calibrationError.set('');
    this.calibrationValue = null;
    // Selecting the tool is the whole action — the dialog opens by itself
    // once the reference line has been drawn.
    this.state.activeTool.set('calibrate');
  }

  applyCalibration() {
    const scale = this.measure.calibrate(
      this.state.pendingCalibrationPixels(),
      Number(this.calibrationValue),
      this.calibrationUnit
    );
    if (!scale) {
      this.calibrationError.set('Enter a distance greater than zero.');
      return;
    }
    this.state.setScale(scale);
    this.state.pendingCalibrationPixels.set(0);
    this.state.activeTool.set('pan');
  }

  cancelCalibration() {
    this.state.pendingCalibrationPixels.set(0);
    this.calibrationError.set('');
    this.state.activeTool.set('pan');
  }

  private downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  onKey(e: KeyboardEvent) {
    if (e.ctrlKey && e.key === 'z')  { e.preventDefault(); this.state.undo(); return; }
    if (e.ctrlKey && e.key === 'y')  { e.preventDefault(); this.state.redo(); return; }
    if (e.ctrlKey && e.key === 's')  { e.preventDefault(); this.saveMarkup();  return; }
    if (e.ctrlKey && e.key === 'p')  { e.preventDefault(); this.print();        return; }
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    // Single-key shortcuts
    const match = this.tools.find(t => t.key.toLowerCase() === e.key.toLowerCase());
    if (match) this.setTool(match.id);
  }

  saveMarkup() { this.saveRequested.emit(); }
  print()      { this.printRequested.emit(); }

  /**
   * Bake the markup into the page itself, server-side, and commit the result
   * as a new version.
   *
   * Flattening is destructive by definition: once the shapes are page content
   * they are no longer editable annotations, so the annotation records that
   * produced them are removed to stop the overlay drawing a second copy on
   * top of the baked-in one. The pre-flatten file stays in the version
   * history, so the document itself can be restored.
   */
  flattenPdf() {
    const shapes = this.state.shapes();
    if (!this.isPdf() || !shapes.length) {
      this.state.processingMessage.set('There are no annotations to flatten.');
      return;
    }
    if (!confirm(
      `Flatten ${shapes.length} annotation(s) into the page?\n\n` +
      'They become permanent page content and will no longer be editable. ' +
      'The current version stays in the history and can be restored.'
    )) return;

    this.flattening.set(true);
    this.flattenService.flattenToPdf({
      documentId: this.state.documentId(),
      shapes,
      quality: 'print'
    }).subscribe({
      next: result => {
        this.flattening.set(false);
        this.discardFlattenedAnnotations();
        this.state.applyVersionCommit(result.version, result.summary);
      },
      error: err => {
        this.flattening.set(false);
        this.state.processingMessage.set(this.failureMessage(err, 'Flatten'));
      }
    });
  }

  /**
   * Drops the annotations now living in the page content, locally and on the
   * server. Without this they reload on the next open and render on top of
   * the flattened copy of themselves.
   */
  private discardFlattenedAnnotations() {
    const saved = this.state.annotations();
    this.state.shapes.set([]);
    this.state.annotations.set([]);
    this.state.dirty.set(false);
    saved.forEach(annotation =>
      this.annService.deleteAnnotation(annotation.id).subscribe({
        error: () => { /* the flatten already succeeded; a stale record is cosmetic */ }
      })
    );
  }

  exportXfdf() {
    const docId = this.state.documentId();
    this.annService.exportXfdf(docId).subscribe(blob =>
      this.downloadBlob(blob, `annotations-doc-${docId}.xfdf`)
    );
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
