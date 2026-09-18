/**
 * Drawing new fillable fields onto a PDF.
 *
 * <p>The other half of the form panel fills fields that already exist; this
 * half puts them there. Kept apart because they are different jobs on
 * different documents — one is authoring, the other is data entry — and a
 * reader of either has no reason to scroll through the other.
 */
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";

import { problemMessage } from "../../../core/handlers/problem-detail";
import { PdfFormService } from "../../../core/services/pdf-form.service";
import { abbreviatedPageLabel } from "../../../../viewer-core/page-labels";
import { ViewerStateService } from "../../../../viewer-core/viewer-state.service";

@Component({
  selector: "app-pdf-form-design",
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <details class="mb-3 border border-gray-200 rounded" [open]="state.formFieldDrafts().length > 0">
      <summary class="text-xs font-semibold text-gray-600 px-2 py-1.5 cursor-pointer select-none">
        <ng-container i18n="Expands the controls for adding new form fields to a PDF@@pdfForm.designHeading"
          >Design fields</ng-container
        >
        @if (state.formFieldDrafts().length) {
          <span i18n="How many new fields have been drawn but not yet added@@pdfForm.placedCount"
                class="text-blue-600">({{ state.formFieldDrafts().length }} placed)</span>
        }
      </summary>

      <div class="p-2 border-t border-gray-100">
        <p i18n="How to add a form field. The emphasised word must match the toolbar's Field label.@@pdfForm.designInstructions"
           class="text-xs text-gray-500 mb-2">
          Pick the <span class="font-medium">Field</span> tool in the toolbar and draw a box on
          the page, then name it here.
        </p>

        @for (draft of state.formFieldDrafts(); track draft.id) {
          <div class="border border-gray-200 rounded p-1.5 mb-1.5">
            <div class="flex items-center gap-1 mb-1">
              <input type="text" [ngModel]="draft.name"
                (ngModelChange)="state.updateFormFieldDraft(draft.id, { name: $event })"
                i18n-placeholder="@@pdfForm.fieldNamePlaceholder"
                placeholder="field name"
                class="flex-1 min-w-0 text-xs border border-gray-300 rounded px-1.5 py-0.5" />
              <span class="text-xs text-gray-400">{{ pageShort(draft.page) }}</span>
              <button (click)="state.removeFormFieldDraft(draft.id)"
                class="text-red-400 hover:text-red-600 text-xs"
                i18n-title="Removes one drawn field before it is added@@pdfForm.discardDraft"
                title="Discard">✕</button>
            </div>
            <div class="flex items-center gap-1">
              <select [ngModel]="draft.kind"
                (ngModelChange)="state.updateFormFieldDraft(draft.id, { kind: $event })"
                class="text-xs border border-gray-300 rounded px-1 py-0.5">
                <option value="TEXT" i18n="Form field kind — a single line of text@@formFieldKind.text">Text</option>
                <option value="TEXTAREA" i18n="Form field kind — several lines of text@@formFieldKind.textarea">Multi-line</option>
                <option value="CHECKBOX" i18n="Form field kind — a tick box@@formFieldKind.checkbox">Checkbox</option>
                <option value="DROPDOWN" i18n="Form field kind — a list to choose one value from@@formFieldKind.dropdown">Dropdown</option>
              </select>
              <label class="flex items-center gap-1 text-xs text-gray-600">
                <input type="checkbox" [ngModel]="draft.required"
                  (ngModelChange)="state.updateFormFieldDraft(draft.id, { required: $event })" />
                <ng-container i18n="Marks a form field as one that must be filled in@@pdfForm.required"
                  >Required</ng-container
                >
              </label>
            </div>
            @if (draft.kind === 'DROPDOWN') {
              <input type="text" [ngModel]="draft.options"
                (ngModelChange)="state.updateFormFieldDraft(draft.id, { options: $event })"
                i18n-placeholder="The values a dropdown field offers@@pdfForm.optionsPlaceholder"
                placeholder="options, comma separated"
                class="w-full text-xs border border-gray-300 rounded px-1.5 py-0.5 mt-1" />
            }
          </div>
        }

        @if (state.formFieldDrafts().length) {
          <div class="flex gap-1.5">
            <button (click)="state.clearFormFieldDrafts()" [disabled]="designing()"
              i18n="Removes every drawn field before any are added@@pdfForm.discardAllDrafts"
              class="flex-1 text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40">
              Discard all
            </button>
            <button (click)="addDrafts()" [disabled]="!draftsReady() || designing()"
              [title]="draftsReady() ? addFieldsHint : unnamedFieldHint"
              class="flex-1 text-xs px-2 py-1 rounded bg-accent text-white hover:opacity-90 disabled:opacity-40">
              {{ designing() ? addingLabel : addFieldsLabel }}
            </button>
          </div>
        }

        @if (designMessage()) {
          <p class="text-xs mt-1.5"
             [class]="designFailed() ? 'text-red-600' : 'text-emerald-700'">
            {{ designMessage() }}
          </p>
        }
      </div>
    </details>
  `,
})
export class PdfFormDesignComponent {
  /** The document the drawn fields are added to. */
  documentId = input.required<number>();
  /** Fields went in, so whatever lists them needs to read them again. */
  fieldsAdded = output<void>();

  private formService = inject(PdfFormService);
  readonly state = inject(ViewerStateService);

  pageShort = abbreviatedPageLabel;

  readonly designing = signal(false);
  readonly designMessage = signal("");
  readonly designFailed = signal(false);

  readonly addFieldsLabel = $localize`:Commits the drawn fields to the document@@pdfForm.addFieldsAction:Add fields`;
  readonly addingLabel = $localize`:Add-fields button while the request is in flight@@pdfForm.addingAction:Adding...`;
  readonly addFieldsHint = $localize`:Tooltip on the enabled Add fields button@@pdfForm.addFieldsHint:Add these fields to the document`;
  readonly unnamedFieldHint = $localize`:Tooltip explaining why Add fields is unavailable@@pdfForm.unnamedFieldHint:Every field needs a name`;

  /**
   * Whether the drawn fields can be sent.
   *
   * <p>Every one needs a name, because a nameless field cannot be filled or
   * read back; a dropdown additionally needs something to choose from.
   */
  draftsReady(): boolean {
    const drafts = this.state.formFieldDrafts();
    return (
      drafts.length > 0 &&
      drafts.every(
        (draft) =>
          draft.name.trim().length > 0 &&
          (draft.kind !== "DROPDOWN" ||
            draft.options.split(",").some((option) => option.trim())),
      )
    );
  }

  addDrafts(): void {
    if (!this.draftsReady() || this.designing()) return;
    this.designing.set(true);
    this.designMessage.set("");

    this.formService
      .addFields(this.documentId(), this.state.formFieldDrafts())
      .subscribe({
        next: (result) => {
          this.designing.set(false);
          this.designFailed.set(false);
          this.designMessage.set(result.summary);
          this.state.clearFormFieldDrafts();
          // The document now has fields it did not have.
          this.state.applyVersionCommit(result.version, result.summary);
          this.fieldsAdded.emit();
        },
        error: (err: { status?: number }) => {
          this.designing.set(false);
          this.designFailed.set(true);
          // The server names the offending field, which is more use than a
          // generic rejection when twenty boxes have been placed. A 503 is
          // the out-of-process converter (§5.13.10) being down, which is a
          // problem with the deployment rather than with the document.
          this.designMessage.set(
            err.status === 503
              ? $localize`:Shown when the backend document converter is unreachable@@pdfForm.converterDown:The document converter service is not running.`
              : problemMessage(
                  err,
                  $localize`:Fallback when adding new form fields fails without a reason@@pdfForm.addFailed:The fields could not be added.`,
                ),
          );
        },
      });
  }
}
