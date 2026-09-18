import {
  Component, inject, Output, EventEmitter, ChangeDetectionStrategy, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ViewerStateService } from '../../../../viewer-core/viewer-state.service';
import { IconComponent } from '../../../../viewer-core/icon.component';
import { toolForKey } from '../../../../viewer-core/tool-catalog';
import { DocumentOperationsService } from './document-operations.service';
import { MarkupContextBarComponent } from './markup-context-bar.component';
import { ScaleCalibrationComponent } from './scale-calibration.component';

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
  imports: [
    CommonModule, FormsModule, IconComponent,
    MarkupContextBarComponent, ScaleCalibrationComponent,
  ],
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

        <button type="button" (click)="operations.exportXfdf()"
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
          <input type="file" accept=".xfdf" class="hidden" (change)="onXfdfChosen($event)" />
        </label>

        <div [class]="divider"></div>

        <button type="button" (click)="flattenToPage()" [disabled]="!operations.isPdf() || operations.flattening()"
          [title]="operations.isPdf() ? flattenHint : flattenUnavailableHint"
          [class]="labelledButton">
          <app-icon name="flatten" [size]="16" />
          <span>{{ operations.flattening() ? flatteningLabel : flattenLabel }}</span>
        </button>
        <button type="button" (click)="operations.runOcr()" [disabled]="!operations.isPdf() || operations.ocrRunning()"
          [title]="operations.isPdf() ? ocrHint : ocrUnavailableHint"
          [class]="labelledButton">
          <app-icon name="ocr" [size]="16" />
          <span>{{ operations.ocrRunning() ? ocrRunningLabel : ocrLabel }}</span>
        </button>

        <!-- Right-aligned: things that are only sometimes true. -->
        <div class="ms-auto flex items-center gap-1.5 ps-2">
          @if (state.redactionRegions().length > 0) {
            <button type="button" (click)="operations.applyRedaction()" [disabled]="operations.redacting()"
              i18n-title="@@toolbar.applyRedactionHint"
              title="Permanently destroy the content under these regions and commit a new version"
              class="h-7 px-2.5 inline-flex items-center gap-1.5 text-xs font-medium rounded-md
                     bg-red-50 text-red-700 border border-red-200 hover:bg-red-100
                     disabled:opacity-40">
              <app-icon name="redact" [size]="15" />
              <span>{{ operations.redacting() ? redactingLabel : applyRedactionLabel(state.redactionRegions().length) }}</span>
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

      <app-markup-context-bar />

      <app-scale-calibration />
    </div>
  `
})
export class MarkupToolbarComponent {
  readonly state            = inject(ViewerStateService);
  readonly operations       = inject(DocumentOperationsService);

  /** Saving is the viewer's own, not one of the document operations. */
  readonly saving = signal(false);

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
    if (match.pdfOnly && !this.operations.isPdf()) return;
    this.state.activeTool.set(match.id);
  }

  saveMarkup() { this.saveRequested.emit(); }
  print()      { this.printRequested.emit(); }

  /** Flattening cannot be undone, so it asks before it starts. */
  flattenToPage() {
    this.operations.flattenToPage((question) => confirm(question));
  }

  onXfdfChosen(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.operations.importXfdf(file);
    // Cleared so choosing the same file twice raises a change event the
    // second time; without this a failed import cannot be retried.
    input.value = '';
  }

}
