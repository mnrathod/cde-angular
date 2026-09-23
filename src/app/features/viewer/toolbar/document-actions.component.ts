/**
 * What can be done to the document as a whole: save, print, exchange, commit.
 *
 * <p>Separated from the view controls beside them because these act on the
 * document and those act on the view of it — and because the import control
 * needed fixing and was buried in a two-hundred-line bar.
 *
 * <p>**Import could not be reached from the keyboard.** It was a `<label>`
 * wrapping `<input type="file" class="hidden">`. `hidden` is `display: none`,
 * which takes the input out of the tab order, and a `<label>` is not
 * focusable — so the only way to import annotations was to click the label
 * with a pointer. §1A.4 requires file upload to be keyboard-operable, and
 * SC 2.1.1 requires it of everything. The input is `sr-only` now, which hides
 * it without removing it from the tab order, and the label draws the focus
 * ring on its behalf through `focus-within`.
 */
import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject,
} from "@angular/core";

import { IconComponent } from "../../../../viewer-core/icon.component";
import { ViewerStateService } from "../../../../viewer-core/viewer-state.service";
import { DocumentOperationsService } from "./document-operations.service";
import { LABELLED_BUTTON, TOOLBAR_DIVIDER } from "./toolbar-buttons";

@Component({
  selector: "app-document-actions",
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" (click)="saveRequested.emit()"
      [title]="state.dirty() ? saveDirtyHint : saveHint"
      [attr.aria-busy]="saving ? 'true' : null"
      [class]="state.dirty() ? labelledButton + ' text-accent' : labelledButton">
      <app-icon name="save" [size]="16" />
      <span>{{ saving ? savingLabel : state.dirty() ? saveLabel : savedLabel }}</span>
      @if (state.dirty() && !saving) {
        <span class="w-1.5 h-1.5 rounded-full bg-accent" aria-hidden="true"></span>
      }
    </button>

    <button type="button" (click)="printRequested.emit()"
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

    <label for="xfdf-import"
      i18n-title="XFDF is a format name and stays as it is@@toolbar.importHint"
      title="Import annotations from an XFDF file"
      [class]="labelledButton + ' cursor-pointer focus-within:ring-2 focus-within:ring-accent'">
      <app-icon name="import" [size]="16" />
      <span i18n="Short toolbar label@@toolbar.import">Import</span>
      <input id="xfdf-import" type="file" accept=".xfdf" class="sr-only"
             (change)="onXfdfChosen($event)" />
    </label>

    <div [class]="divider"></div>

    <button type="button" (click)="flattenRequested.emit()"
      [disabled]="!operations.isPdf() || operations.flattening()"
      [title]="operations.isPdf() ? flattenHint : flattenUnavailableHint"
      [attr.aria-busy]="operations.flattening() ? 'true' : null"
      [class]="labelledButton">
      <app-icon name="flatten" [size]="16" />
      <span>{{ operations.flattening() ? flatteningLabel : flattenLabel }}</span>
    </button>

    <button type="button" (click)="operations.runOcr()"
      [disabled]="!operations.isPdf() || operations.ocrRunning()"
      [title]="operations.isPdf() ? ocrHint : ocrUnavailableHint"
      [attr.aria-busy]="operations.ocrRunning() ? 'true' : null"
      [class]="labelledButton">
      <app-icon name="ocr" [size]="16" />
      <span>{{ operations.ocrRunning() ? ocrRunningLabel : ocrLabel }}</span>
    </button>
  `,
})
export class DocumentActionsComponent {
  readonly state = inject(ViewerStateService);
  readonly operations = inject(DocumentOperationsService);

  /** Saving is the viewer's own, not one of the document operations. */
  @Output() saveRequested = new EventEmitter<void>();
  @Output() printRequested = new EventEmitter<void>();
  /** Flattening cannot be undone, so the bar above asks before it starts. */
  @Output() flattenRequested = new EventEmitter<void>();

  readonly labelledButton = LABELLED_BUTTON;
  readonly divider = TOOLBAR_DIVIDER;

  /** Whether a save is in flight, which the toolbar owns. */
  @Input() saving = false;

  onXfdfChosen(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.operations.importXfdf(file);
    // Cleared so choosing the same file twice raises a change event the
    // second time; without this a failed import cannot be retried.
    input.value = "";
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
}
