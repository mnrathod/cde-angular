import {
  Component, inject, Output, EventEmitter, ChangeDetectionStrategy, signal,
  computed, effect
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ViewerStateService, MarkupTool } from '../../../../viewer-core/viewer-state.service';
import { FlattenService } from '../../../core/services/viewer/flatten.service';
import { AnnotationService } from '../../../core/services/viewer/annotation.service';
import { RedactionService } from '../../../core/services/redaction.service';
import { OcrService } from '../../../core/services/ocr.service';
import {
  MeasurementService, MeasurementUnit, MEASUREMENT_UNITS
} from '../../../../viewer-core/measurement.service';
import { MarkupEngineService } from '../../../../viewer-core/markup-engine.service';
import { IconComponent } from '../../../../viewer-core/icon.component';
import {
  allTools, toolForKey, MEASUREMENT_TOOLS, usesStrokeStyle
} from '../../../../viewer-core/tool-catalog';
import { problemMessage } from '../../../core/handlers/problem-detail';

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
          i18n-title="Tooltip on undo. Ctrl+Z is the keyboard shortcut and stays as it is.@@toolbar.undoHint"
          title="Undo (Ctrl+Z)"
          i18n-aria-label="@@toolbar.undo" aria-label="Undo" [class]="iconButton">
          <app-icon name="undo" [size]="17" />
        </button>
        <button type="button" (click)="state.redo()" [disabled]="!state.canRedo()"
          i18n-title="Tooltip on redo. Ctrl+Y is the keyboard shortcut and stays as it is.@@toolbar.redoHint"
          title="Redo (Ctrl+Y)"
          i18n-aria-label="@@toolbar.redo" aria-label="Redo" [class]="iconButton">
          <app-icon name="redo" [size]="17" />
        </button>
        <button type="button" (click)="clearAll()"
          i18n-title="@@toolbar.clearAllHint" title="Delete all markup"
          i18n-aria-label="@@toolbar.clearAll" aria-label="Delete all markup"
          [class]="iconButton + ' hover:text-red-600'">
          <app-icon name="trash" [size]="17" />
        </button>

        <div [class]="divider"></div>

        <button type="button" (click)="state.zoomOut()"
          i18n-title="@@toolbar.zoomOutHint" title="Zoom out"
          i18n-aria-label="@@toolbar.zoomOut" aria-label="Zoom out" [class]="iconButton">
          <app-icon name="zoom-out" [size]="17" />
        </button>
        <span class="w-12 text-center text-xs tabular-nums text-gray-600">
          {{ (state.zoom() * 100).toFixed(0) }}%
        </span>
        <button type="button" (click)="state.zoomIn()"
          i18n-title="@@toolbar.zoomInHint" title="Zoom in"
          i18n-aria-label="@@toolbar.zoomIn" aria-label="Zoom in" [class]="iconButton">
          <app-icon name="zoom-in" [size]="17" />
        </button>
        <button type="button" (click)="state.zoomFit()"
          i18n-title="@@toolbar.zoomFitHint" title="Fit page to window"
          i18n-aria-label="@@toolbar.zoomFit" aria-label="Fit page to window" [class]="iconButton">
          <app-icon name="fit" [size]="17" />
        </button>
        <button type="button" (click)="state.rotateClockwise()"
          [title]="rotateHint()"
          i18n-aria-label="Spelled out in words rather than as 90°, so a screen reader says it correctly@@toolbar.rotate"
          aria-label="Rotate 90 degrees clockwise"
          [class]="state.rotation() ? activeIconButton : iconButton">
          <app-icon name="rotate" [size]="17" />
        </button>

        <div [class]="divider"></div>

        <button type="button" (click)="saveMarkup()"
          [title]="state.dirty() ? saveDirtyHint : saveHint"
          [class]="state.dirty() ? labelledButton + ' text-accent' : labelledButton">
          <app-icon name="save" [size]="16" />
          <span>{{ saving() ? savingLabel : state.dirty() ? saveLabel : savedLabel }}</span>
          @if (state.dirty() && !saving()) {
            <span class="w-1.5 h-1.5 rounded-full bg-accent"></span>
          }
        </button>
        <button type="button" (click)="print()"
          i18n-title="Tooltip on print. Ctrl+P is the keyboard shortcut and stays as it is.@@toolbar.printHint"
          title="Print with annotations (Ctrl+P)"
          [class]="labelledButton">
          <app-icon name="print" [size]="16" />
          <span i18n="Short toolbar label@@toolbar.print">Print</span>
        </button>

        <div [class]="divider"></div>

        <button type="button" (click)="exportXfdf()"
          i18n-title="Tooltip on export. XFDF is a format name; the three products named are other software and keep their own names.@@toolbar.exportHint"
          title="Export annotations as XFDF (opens in Bluebeam, Acrobat and Procore)"
          [class]="labelledButton">
          <app-icon name="export" [size]="16" />
          <span i18n="Short toolbar label@@toolbar.export">Export</span>
        </button>
        <label i18n-title="XFDF is a format name and stays as it is@@toolbar.importHint"
          title="Import annotations from an XFDF file"
          [class]="labelledButton + ' cursor-pointer'">
          <app-icon name="import" [size]="16" />
          <span i18n="Short toolbar label@@toolbar.import">Import</span>
          <input type="file" accept=".xfdf" class="hidden" (change)="importXfdf($event)" />
        </label>

        <div [class]="divider"></div>

        <button type="button" (click)="flattenPdf()" [disabled]="!isPdf() || flattening()"
          [title]="isPdf() ? flattenHint : flattenUnavailableHint"
          [class]="labelledButton">
          <app-icon name="flatten" [size]="16" />
          <span>{{ flattening() ? flatteningLabel : flattenLabel }}</span>
        </button>
        <button type="button" (click)="runOcr()" [disabled]="!isPdf() || ocrRunning()"
          [title]="isPdf() ? ocrHint : ocrUnavailableHint"
          [class]="labelledButton">
          <app-icon name="ocr" [size]="16" />
          <span>{{ ocrRunning() ? ocrRunningLabel : ocrLabel }}</span>
        </button>

        <!-- Right-aligned: things that are only sometimes true. -->
        <div class="ms-auto flex items-center gap-1.5 ps-2">
          @if (state.redactionRegions().length > 0) {
            <button type="button" (click)="applyRedaction()" [disabled]="redacting()"
              i18n-title="@@toolbar.applyRedactionHint"
              title="Permanently destroy the content under these regions and commit a new version"
              class="h-7 px-2.5 inline-flex items-center gap-1.5 text-xs font-medium rounded-md
                     bg-red-50 text-red-700 border border-red-200 hover:bg-red-100
                     disabled:opacity-40">
              <app-icon name="redact" [size]="15" />
              <span>{{ redacting() ? redactingLabel : applyRedactionLabel(state.redactionRegions().length) }}</span>
            </button>
          }

          @if (state.processingMessage()) {
            <button type="button"
              (click)="state.sidebarTab.set('versions'); state.processingMessage.set('')"
              i18n-title="@@toolbar.openHistoryHint" title="Open version history"
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

            <label class="flex items-center gap-1.5 cursor-pointer"
                   i18n-title="@@toolbar.strokeColourHint" title="Stroke colour">
              <span i18n="Colour of the line a markup tool draws. Short — it sits in a crowded strip.@@toolbar.strokeColour"
                    class="text-xs text-gray-500">Colour</span>
              <input type="color" [ngModel]="state.strokeColor()"
                (ngModelChange)="state.strokeColor.set($event)"
                i18n-aria-label="@@toolbar.strokeColourLabel" aria-label="Stroke colour"
                class="h-6 w-8 rounded border border-gray-300 cursor-pointer p-0.5 bg-white" />
            </label>

            <label class="flex items-center gap-1.5"
                   i18n-title="@@toolbar.strokeWidthHint" title="Line width">
              <span i18n="Thickness of the line a markup tool draws. Short — it sits in a crowded strip.@@toolbar.strokeWidth"
                    class="text-xs text-gray-500">Width</span>
              <select [ngModel]="state.strokeWidth()"
                (ngModelChange)="state.strokeWidth.set(+$event)"
                i18n-aria-label="@@toolbar.strokeWidthLabel" aria-label="Line width"
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
              <span i18n="The drawing scale currently in force@@toolbar.scale"
                    class="text-xs text-gray-600">
                Scale <span class="font-mono font-medium">{{ scaleLabel() }}</span>
              </span>
              <button type="button" (click)="startCalibration()"
                i18n="Sets the drawing scale again@@toolbar.recalibrate"
                class="text-xs text-accent hover:underline">Recalibrate</button>
            } @else {
              <button type="button" (click)="startCalibration()"
                i18n-title="@@toolbar.calibrateHint"
                title="Draw a line over a known distance to set the drawing's scale"
                class="h-6 px-2 inline-flex items-center gap-1.5 text-xs font-medium rounded
                       bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100">
                <app-icon name="calibrate" [size]="14" />
                <span i18n="Prompt to calibrate, shown while measurements have no real-world units@@toolbar.setScale"
                  >Set scale — readings are in pixels until you do</span
                >
              </button>
            }
          }

          @if (completionHint()) {
            <span class="ms-auto text-xs text-gray-500">{{ completionHint() }}</span>
          }
        </div>
      }

      <!-- Calibration dialog: opens once the reference line has been drawn -->
      @if (state.pendingCalibrationPixels() > 0) {
        <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-[600] flex items-center justify-center">
          <div class="bg-white rounded-lg shadow-2xl p-6 w-80">
            <h3 class="font-semibold text-gray-800 mb-1 flex items-center gap-2">
              <app-icon name="calibrate" [size]="18" />
              <ng-container i18n="Heading of the dialog that sets a drawing's scale@@toolbar.calibrationHeading"
                >Set drawing scale</ng-container
              >
            </h3>
            <p i18n="Asks what real-world distance the drawn reference line represents. The emphasised value is its length on screen in pixels.@@toolbar.calibrationQuestion"
               class="text-xs text-gray-500 mb-4">
              The line you drew is
              <span class="font-mono font-semibold">{{ state.pendingCalibrationPixels().toFixed(1) }} px</span>.
              What is that distance on the drawing?
            </p>

            <div class="flex gap-2 mb-3">
              <input type="number" [(ngModel)]="calibrationValue" name="calibrationValue"
                min="0" step="any"
                i18n-placeholder="Example of a distance@@toolbar.calibrationValuePlaceholder" placeholder="e.g. 5"
                i18n-aria-label="The real-world distance the drawn line represents@@toolbar.calibrationValueLabel"
                aria-label="Known distance"
                class="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded
                       focus:outline-none focus:ring-2 focus:ring-accent" />
              <select [(ngModel)]="calibrationUnit" name="calibrationUnit"
                i18n-aria-label="The unit the known distance is given in@@toolbar.calibrationUnitLabel"
                aria-label="Unit"
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
                i18n="@@toolbar.calibrationCancel"
                class="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50">Cancel</button>
              <button type="button" (click)="applyCalibration()"
                i18n="Confirms the entered scale@@toolbar.calibrationApply"
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

  // The engine returns a finished sentence now, so there is nothing to
  // capitalise here — doing so worked in English and was wrong anywhere the
  // casing rules differ.
  readonly completionHint = computed(() =>
    this.engine.completionHint(this.state.activeTool()));

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
      ? $localize`:Tooltip on rotate, when the page is already turned@@toolbar.rotateHintTurned:Rotate 90° clockwise (currently ${rotation}:degrees:°)`
      : $localize`:Tooltip on rotate, when the page is the right way up@@toolbar.rotateHint:Rotate 90° clockwise`;
  }

  /**
   * Labels and tooltips that live in expressions, so `i18n` cannot mark them
   * — see the note in login.component.ts.
   */
  readonly saveLabel = $localize`:Save button with unsaved markup. Short toolbar label.@@toolbar.save:Save`;
  readonly savedLabel = $localize`:Save button when everything is already saved. Short toolbar label.@@toolbar.saved:Saved`;
  readonly savingLabel = $localize`:Save button while the request is in flight. Short toolbar label.@@toolbar.saving:Saving`;
  readonly saveHint = $localize`:Tooltip on save. Ctrl+S is the keyboard shortcut and stays as it is.@@toolbar.saveHint:Save annotations (Ctrl+S)`;
  readonly saveDirtyHint = $localize`:Tooltip on save when there is unsaved markup. Ctrl+S is the keyboard shortcut.@@toolbar.saveDirtyHint:Save annotations (Ctrl+S) — unsaved changes`;
  readonly flattenLabel = $localize`:Burns markup into the page as permanent content. Short toolbar label.@@toolbar.flatten:Flatten`;
  readonly flatteningLabel = $localize`:Flatten button while the request is in flight. Short toolbar label.@@toolbar.flattening:Flattening`;
  readonly flattenHint = $localize`:Tooltip on the enabled flatten button@@toolbar.flattenHint:Bake annotations into the page as permanent content`;
  readonly flattenUnavailableHint = $localize`:Tooltip explaining why flatten is unavailable@@toolbar.flattenUnavailableHint:Flattening is only available for PDF documents`;
  readonly ocrLabel = $localize`:Optical character recognition, which makes a scan searchable. Short toolbar label; OCR is widely understood and may stay as it is.@@toolbar.ocr:OCR`;
  readonly ocrRunningLabel = $localize`:OCR button while the request is in flight. Short toolbar label.@@toolbar.ocrRunning:Reading`;
  readonly ocrHint = $localize`:Tooltip on the enabled OCR button@@toolbar.ocrHint:Make a scanned PDF searchable by adding an invisible text layer`;
  readonly ocrUnavailableHint = $localize`:Tooltip explaining why OCR is unavailable@@toolbar.ocrUnavailableHint:OCR is only available for PDF documents`;
  readonly redactingLabel = $localize`:Redaction button while the request is in flight. Short toolbar label.@@toolbar.redacting:Redacting`;

  /** Label of the button that destroys the drawn regions, with how many. */
  applyRedactionLabel(regionCount: number): string {
    return $localize`:Button that permanently destroys the drawn regions, naming how many@@toolbar.applyRedaction:Apply redaction (${regionCount}:count:)`;
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
    const question = $localize`:Confirmation before discarding every annotation on the document@@toolbar.confirmClearAll:Delete all ${count}:count: markup item(s) on this document?`;
    if (!confirm(question)) return;
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
        this.state.processingMessage.set(this.failureMessage(err, {
          whenConverterDown: $localize`:Redaction failed because the backend converter is unreachable@@toolbar.redactionConverterDown:Redaction failed — the document converter service is not running.`,
          otherwise: $localize`:Fallback when redaction fails without a reason@@toolbar.redactionFailed:Redaction failed.`,
        }));
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
        this.state.processingMessage.set(this.failureMessage(err, {
          whenConverterDown: $localize`:Text recognition failed because the backend converter is unreachable@@toolbar.ocrConverterDown:OCR failed — the document converter service is not running.`,
          otherwise: $localize`:Fallback when text recognition fails without a reason@@toolbar.ocrFailed:OCR failed.`,
        }));
      }
    });
  }

  /**
   * Server error text is authored by the backend for display; anything else
   * gets a generic line naming the likely cause rather than the exception.
   *
   * <p>`${action} failed.` is reached only when the response carried no
   * problem document at all, so it must not be the answer for a request that
   * never arrived — see `problemMessage`, which separates that case out.
   */
  /**
   * Turns a failed request into something a person can act on.
   *
   * <p>Takes two complete messages rather than a noun to interpolate into
   * "{action} failed." — a sentence assembled from an English noun and an
   * English verb cannot be translated, because neither the word order nor the
   * agreement carries over.
   */
  private failureMessage(
    err: { status?: number; error?: { message?: string } },
    messages: { whenConverterDown: string; otherwise: string },
  ): string {
    if (err.status === 503) return messages.whenConverterDown;
    return problemMessage(err, messages.otherwise);
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
      this.calibrationError.set(
        $localize`:Validation message in the scale dialog@@toolbar.calibrationInvalid:Enter a distance greater than zero.`,
      );
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
      this.state.processingMessage.set(
        $localize`:Shown when flatten is used on a document with no markup@@toolbar.nothingToFlatten:There are no annotations to flatten.`,
      );
      return;
    }
    const shapeCount = shapes.length;
    const question = $localize`:Confirmation before making markup a permanent part of the page@@toolbar.confirmFlattenQuestion:Flatten ${shapeCount}:count: annotation(s) into the page?`;
    const consequence = $localize`:Second paragraph of the flatten confirmation@@toolbar.confirmFlattenConsequence:They become permanent page content and will no longer be editable. The current version stays in the history and can be restored.`;
    if (!confirm(`${question}\n\n${consequence}`)) return;

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
        this.state.processingMessage.set(this.failureMessage(err, {
          whenConverterDown: $localize`:Flattening failed because the backend converter is unreachable@@toolbar.flattenConverterDown:Flatten failed — the document converter service is not running.`,
          otherwise: $localize`:Fallback when flattening fails without a reason@@toolbar.flattenFailed:Flatten failed.`,
        }));
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
