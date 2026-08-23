import {
  Component, inject, Output, EventEmitter, ChangeDetectionStrategy, signal,
  computed, effect
} from '@angular/core';
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
import { MarkupEngineService } from '../../../core/services/viewer/markup-engine.service';
import { IconComponent } from '../../../shared/components/icon.component';
import {
  allTools, toolForKey, MEASUREMENT_TOOLS, usesStrokeStyle
} from './tool-catalog';
import { problemDetail } from '../../../core/handlers/problem-detail';

/**
 * The command bar above the document, and the context bar beneath it.
 *
 * The split follows what a control acts on. Commands that apply to the whole
 * document whatever you happen to be drawing — undo, zoom, save, print, the
 * processing operations — are always in the same place and never move. Options
 * that belong to the tool currently in hand appear only while it is held, in
 * the context bar. The previous ribbon mixed the two, so the width of the
 * toolbar changed with the selected tab and undo/redo were pushed off the end
 * of the row entirely below 1920px.
 */
@Component({
  selector: 'app-markup-toolbar',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKey($event)' },
  template: `
    <div class="flex flex-col flex-shrink-0 bg-white border-b border-gray-200">

      <!-- ── Command bar ──────────────────────────────────────── -->
      <div class="flex items-center h-10 px-2 gap-0.5">

        <button type="button" (click)="state.undo()" [disabled]="!state.canUndo()"
          title="Undo (Ctrl+Z)" aria-label="Undo" [class]="iconButton">
          <app-icon name="undo" [size]="17" />
        </button>
        <button type="button" (click)="state.redo()" [disabled]="!state.canRedo()"
          title="Redo (Ctrl+Y)" aria-label="Redo" [class]="iconButton">
          <app-icon name="redo" [size]="17" />
        </button>
        <button type="button" (click)="clearAll()"
          title="Delete all markup" aria-label="Delete all markup"
          [class]="iconButton + ' hover:text-red-600'">
          <app-icon name="trash" [size]="17" />
        </button>

        <div [class]="divider"></div>

        <button type="button" (click)="state.zoomOut()" title="Zoom out"
          aria-label="Zoom out" [class]="iconButton">
          <app-icon name="zoom-out" [size]="17" />
        </button>
        <span class="w-12 text-center text-xs tabular-nums text-gray-600">
          {{ (state.zoom() * 100).toFixed(0) }}%
        </span>
        <button type="button" (click)="state.zoomIn()" title="Zoom in"
          aria-label="Zoom in" [class]="iconButton">
          <app-icon name="zoom-in" [size]="17" />
        </button>
        <button type="button" (click)="state.zoomFit()" title="Fit page to window"
          aria-label="Fit page to window" [class]="iconButton">
          <app-icon name="fit" [size]="17" />
        </button>
        <button type="button" (click)="state.rotateClockwise()"
          [title]="rotateHint()" aria-label="Rotate 90 degrees clockwise"
          [class]="state.rotation() ? activeIconButton : iconButton">
          <app-icon name="rotate" [size]="17" />
        </button>

        <div [class]="divider"></div>

        <button type="button" (click)="saveMarkup()"
          [title]="state.dirty() ? 'Save annotations (Ctrl+S) — unsaved changes' : 'Save annotations (Ctrl+S)'"
          [class]="state.dirty() ? labelledButton + ' text-accent' : labelledButton">
          <app-icon name="save" [size]="16" />
          <span>{{ saving() ? 'Saving' : state.dirty() ? 'Save' : 'Saved' }}</span>
          @if (state.dirty() && !saving()) {
            <span class="w-1.5 h-1.5 rounded-full bg-accent"></span>
          }
        </button>
        <button type="button" (click)="print()" title="Print with annotations (Ctrl+P)"
          [class]="labelledButton">
          <app-icon name="print" [size]="16" />
          <span>Print</span>
        </button>

        <div [class]="divider"></div>

        <button type="button" (click)="exportXfdf()"
          title="Export annotations as XFDF (opens in Bluebeam, Acrobat and Procore)"
          [class]="labelledButton">
          <app-icon name="export" [size]="16" />
          <span>Export</span>
        </button>
        <label title="Import annotations from an XFDF file"
          [class]="labelledButton + ' cursor-pointer'">
          <app-icon name="import" [size]="16" />
          <span>Import</span>
          <input type="file" accept=".xfdf" class="hidden" (change)="importXfdf($event)" />
        </label>

        <div [class]="divider"></div>

        <button type="button" (click)="flattenPdf()" [disabled]="!isPdf() || flattening()"
          [title]="isPdf()
            ? 'Bake annotations into the page as permanent content'
            : 'Flattening is only available for PDF documents'"
          [class]="labelledButton">
          <app-icon name="flatten" [size]="16" />
          <span>{{ flattening() ? 'Flattening' : 'Flatten' }}</span>
        </button>
        <button type="button" (click)="runOcr()" [disabled]="!isPdf() || ocrRunning()"
          [title]="isPdf()
            ? 'Make a scanned PDF searchable by adding an invisible text layer'
            : 'OCR is only available for PDF documents'"
          [class]="labelledButton">
          <app-icon name="ocr" [size]="16" />
          <span>{{ ocrRunning() ? 'Reading' : 'OCR' }}</span>
        </button>

        <!-- Right-aligned: things that are only sometimes true. -->
        <div class="ml-auto flex items-center gap-1.5 pl-2">
          @if (state.redactionRegions().length > 0) {
            <button type="button" (click)="applyRedaction()" [disabled]="redacting()"
              title="Permanently destroy the content under these regions and commit a new version"
              class="h-7 px-2.5 inline-flex items-center gap-1.5 text-xs font-medium rounded-md
                     bg-red-50 text-red-700 border border-red-200 hover:bg-red-100
                     disabled:opacity-40">
              <app-icon name="redact" [size]="15" />
              <span>{{ redacting() ? 'Redacting' : 'Apply redaction (' + state.redactionRegions().length + ')' }}</span>
            </button>
          }

          @if (state.processingMessage()) {
            <button type="button"
              (click)="state.sidebarTab.set('versions'); state.processingMessage.set('')"
              title="Open version history"
              class="h-7 px-2.5 inline-flex items-center gap-1.5 text-xs rounded-md
                     bg-emerald-50 text-emerald-800 border border-emerald-200
                     hover:bg-emerald-100 max-w-[22rem]">
              <app-icon name="check" [size]="15" />
              <span class="truncate">{{ state.processingMessage() }}</span>
            </button>
          }
        </div>
      </div>

      <!-- ── Context bar ──────────────────────────────────────────
           Present only when the active tool has options or an instruction.
           Pan and Select have neither, so the bar disappears and the
           document gets the height back. -->
      @if (showContextBar()) {
        <div class="flex items-center h-9 px-3 gap-3 border-t border-gray-200 bg-gray-50/80">

          <span class="text-xs font-semibold text-gray-700">{{ activeToolLabel() }}</span>

          @if (usesStrokeStyle(state.activeTool())) {
            <div [class]="contextDivider"></div>

            <label class="flex items-center gap-1.5 cursor-pointer" title="Stroke colour">
              <span class="text-xs text-gray-500">Colour</span>
              <input type="color" [ngModel]="state.strokeColor()"
                (ngModelChange)="state.strokeColor.set($event)"
                aria-label="Stroke colour"
                class="h-6 w-8 rounded border border-gray-300 cursor-pointer p-0.5 bg-white" />
            </label>

            <label class="flex items-center gap-1.5" title="Line width">
              <span class="text-xs text-gray-500">Width</span>
              <select [ngModel]="state.strokeWidth()"
                (ngModelChange)="state.strokeWidth.set(+$event)"
                aria-label="Line width"
                class="h-6 w-16 text-xs border border-gray-300 rounded px-1.5 bg-white">
                @for (width of strokeWidths; track width) {
                  <option [value]="width">{{ width }} px</option>
                }
              </select>
            </label>
          }

          @if (isMeasurementTool(state.activeTool())) {
            <div [class]="contextDivider"></div>

            @if (state.isCalibrated()) {
              <span class="text-xs text-gray-600">
                Scale <span class="font-mono font-medium">{{ scaleLabel() }}</span>
              </span>
              <button type="button" (click)="startCalibration()"
                class="text-xs text-accent hover:underline">Recalibrate</button>
            } @else {
              <button type="button" (click)="startCalibration()"
                title="Draw a line over a known distance to set the drawing's scale"
                class="h-6 px-2 inline-flex items-center gap-1.5 text-xs font-medium rounded
                       bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100">
                <app-icon name="calibrate" [size]="14" />
                <span>Set scale — readings are in pixels until you do</span>
              </button>
            }
          }

          @if (completionHint()) {
            <span class="ml-auto text-xs text-gray-500">{{ completionHint() }}</span>
          }
        </div>
      }

      <!-- Calibration dialog: opens once the reference line has been drawn -->
      @if (state.pendingCalibrationPixels() > 0) {
        <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-[600] flex items-center justify-center">
          <div class="bg-white rounded-lg shadow-2xl p-6 w-80">
            <h3 class="font-semibold text-gray-800 mb-1 flex items-center gap-2">
              <app-icon name="calibrate" [size]="18" />
              Set drawing scale
            </h3>
            <p class="text-xs text-gray-500 mb-4">
              The line you drew is
              <span class="font-mono font-semibold">{{ state.pendingCalibrationPixels().toFixed(1) }} px</span>.
              What is that distance on the drawing?
            </p>

            <div class="flex gap-2 mb-3">
              <input type="number" [(ngModel)]="calibrationValue" name="calibrationValue"
                min="0" step="any" placeholder="e.g. 5" aria-label="Known distance"
                class="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded
                       focus:outline-none focus:ring-2 focus:ring-accent" />
              <select [(ngModel)]="calibrationUnit" name="calibrationUnit" aria-label="Unit"
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
              <button type="button" (click)="cancelCalibration()"
                class="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50">Cancel</button>
              <button type="button" (click)="applyCalibration()"
                class="px-3 py-1.5 text-xs bg-accent text-white rounded hover:bg-blue-700 font-semibold">
                Apply
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `
})
export class MarkupToolbarComponent {
  readonly state            = inject(ViewerStateService);
  private readonly annService       = inject(AnnotationService);
  private readonly flattenService   = inject(FlattenService);
  private readonly redactionService = inject(RedactionService);
  private readonly ocrService       = inject(OcrService);
  private readonly measure          = inject(MeasurementService);
  private readonly engine           = inject(MarkupEngineService);

  // Signals, not plain fields: this component is OnPush, so a bare field
  // mutated from an async HTTP callback never re-renders — the button would
  // stay stuck on "Redacting"/"Reading" after the call finished.
  readonly saving     = signal(false);
  readonly redacting  = signal(false);
  readonly ocrRunning = signal(false);
  readonly flattening = signal(false);

  @Output() saveRequested  = new EventEmitter<void>();
  @Output() printRequested = new EventEmitter<void>();

  // ── Shared button styling ────────────────────────────────────
  // Named rather than repeated inline so a change lands on every control at
  // once, and so the difference between the three kinds of button is a
  // deliberate choice rather than a copy that drifted.
  readonly iconButton =
    'w-8 h-8 rounded-md inline-flex items-center justify-center text-gray-600 ' +
    'hover:bg-gray-100 hover:text-gray-900 transition-colors ' +
    'disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed';

  readonly activeIconButton =
    'w-8 h-8 rounded-md inline-flex items-center justify-center ' +
    'bg-accent/10 text-accent transition-colors';

  readonly labelledButton =
    'h-8 px-2 rounded-md inline-flex items-center gap-1.5 text-xs font-medium ' +
    'text-gray-700 hover:bg-gray-100 transition-colors ' +
    'disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed';

  readonly divider        = 'w-px h-5 bg-gray-200 mx-1.5';
  readonly contextDivider = 'w-px h-4 bg-gray-300';

  readonly strokeWidths = [1, 2, 3, 5];

  constructor() {
    // Clear anything left from a previous attempt as the dialog opens, rather
    // than when the tool is picked: the reference line is drawn in between, so
    // resetting at selection time left a stale error visible on screen while
    // the user was still drawing.
    effect(() => {
      if (this.state.pendingCalibrationPixels() > 0) {
        this.calibrationValue = null;
        this.calibrationError.set('');
      }
    });
  }

  // ── Context bar ──────────────────────────────────────────────
  private readonly toolsByRail = allTools();

  readonly activeToolLabel = computed(() => {
    const active = this.state.activeTool();
    return this.toolsByRail.find(tool => tool.id === active)?.label ?? '';
  });

  readonly completionHint = computed(() => {
    const hint = this.engine.completionHint(this.state.activeTool());
    return hint ? `${hint.charAt(0).toUpperCase()}${hint.slice(1)}.` : '';
  });

  /**
   * Whether the active tool has anything to show. Pan and Select carry no
   * options and need no instruction, so the bar is hidden rather than drawn
   * empty — an always-present bar with nothing in it is the kind of detail
   * that makes chrome feel arbitrary.
   */
  readonly showContextBar = computed(() => {
    const active = this.state.activeTool();
    return usesStrokeStyle(active)
        || this.isMeasurementTool(active)
        || !!this.engine.completionHint(active);
  });

  usesStrokeStyle = usesStrokeStyle;

  isMeasurementTool(tool: MarkupTool): boolean {
    return MEASUREMENT_TOOLS.includes(tool);
  }

  rotateHint(): string {
    const rotation = this.state.rotation();
    return rotation
      ? `Rotate 90° clockwise (currently ${rotation}°)`
      : 'Rotate 90° clockwise';
  }

  isPdf(): boolean {
    return this.state.viewerData()?.type === 'pdf';
  }

  /**
   * Discarding every annotation on the document is not undoable past the
   * undo stack's depth, so it asks first — the button sits beside undo and
   * redo, which are not destructive, and a misclick would otherwise cost the
   * whole markup session.
   */
  clearAll() {
    const count = this.state.shapes().length;
    if (!count) return;
    if (!confirm(`Delete all ${count} markup item(s) on this document?`)) return;
    this.state.clearAll();
  }

  /**
   * Burn the marked regions out of the document. The result becomes the
   * document's current version, so the removed content is gone for every
   * later reader and every later operation — not just in a copy the person
   * who ran it happens to hold.
   */
  applyRedaction() {
    const regions = this.state.redactionRegions();
    if (!regions.length) return;

    this.redacting.set(true);
    this.redactionService.redact(this.state.documentId(), regions).subscribe({
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
  private failureMessage(
    err: { status?: number; error?: { message?: string } }, action: string): string {
    if (err.status === 503) return `${action} failed — the document converter service is not running.`;
    return problemDetail(err, `${action} failed.`);
  }

  // ── Scale calibration ────────────────────────────────────────
  readonly units = MEASUREMENT_UNITS;
  calibrationValue: number | null = null;
  calibrationUnit: MeasurementUnit = 'm';
  readonly calibrationError = signal('');

  /** Short readout for the context bar, e.g. "1px = 0.025 m". */
  scaleLabel(): string {
    const scale = this.state.measurementScale();
    return `1px = ${Number(scale.unitsPerPixel.toFixed(5))} ${scale.unit}`;
  }

  /**
   * Selecting the tool is the whole action — the dialog opens by itself once
   * the reference line has been drawn.
   */
  startCalibration() {
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
    if (e.ctrlKey && e.key === 'p')  { e.preventDefault(); this.print();       return; }

    // TEXTAREA and contenteditable as well as INPUT: a note or callout body
    // is not an <input>, and without this every letter typed into one would
    // also switch tool.
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

    // Keys are unique across the catalog — asserted by tool-catalog.spec.ts,
    // because a duplicate silently makes the later tool unreachable rather
    // than failing loudly.
    const match = toolForKey(e.key);
    if (!match) return;
    if (match.pdfOnly && !this.isPdf()) return;
    this.state.activeTool.set(match.id);
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
    this.annService.importXfdf(this.state.documentId(), file).subscribe({
      next: anns => {
        this.state.setAnnotationsSaved(anns);
        const shapes = this.annService.annotationsToShapes(anns);
        shapes.forEach(s => this.state.shapes.update(all => [...all, s]));
      },
      error: err => console.error('XFDF import failed', err)
    });
  }
}
