import {
  Component, Input, OnInit, inject, signal, ChangeDetectionStrategy
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';

import { PdfFormField } from '../../../core/services/pdf-form.service';
import { PdfFormDesignComponent } from './pdf-form-design.component';
import { PdfFormFieldComponent } from './pdf-form-field.component';
import { PdfFormFillingService } from './pdf-form-filling.service';
import { FormPageGroup, layoutFor } from './pdf-form-fields';
import { ViewerStateService } from '../../../../viewer-core/viewer-state.service';
import { pageLabel } from '../../../../viewer-core/page-labels';

/**
 * Renders a PDF's AcroForm fields as an editable form and writes the values
 * back into the document as a new version. Field metadata (kind, options,
 * required, max length) comes from the server, so the control and its
 * validation match what the PDF itself declares rather than being guessed
 * here.
 */
@Component({
  selector: 'app-pdf-form',
  standalone: true,
  imports: [ReactiveFormsModule, PdfFormDesignComponent, PdfFormFieldComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [PdfFormFillingService],
  template: `
    <div class="p-3">
      <app-pdf-form-design [documentId]="documentId" (fieldsAdded)="reloadFields()" />

      <div i18n="Heading over the PDF's existing fillable fields@@pdfForm.heading"
           class="text-sm font-semibold text-gray-800 mb-1">Form Fields</div>

      @if (filling.loading()) {
        <div i18n="@@pdfForm.loading" class="text-xs text-gray-400 py-6 text-center">Reading form fields...</div>
      } @else if (filling.error()) {
        <div role="alert" class="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
          {{ filling.error() }}
        </div>
      } @else if (pages().length === 0) {
        <div i18n="@@pdfForm.empty" class="text-xs text-gray-400 py-6 text-center">
          This PDF has no fillable form fields.
        </div>
      }

      @if (pages().length > 0) {
        <p i18n="How many fillable fields the document has, and what filling them does@@pdfForm.fieldCount"
           class="text-xs text-gray-500 mb-3">
          {fieldCount(), plural, =1 {1 field.} other {{{ fieldCount() }} fields.}} Filling commits a new version; the previous one stays in the history.
        </p>

        <form [formGroup]="form()" (ngSubmit)="submit()">
          @for (group of pages(); track group.page) {
            <div class="text-xs font-semibold text-gray-500 mt-3 mb-1.5 border-b border-gray-200 pb-1">
              {{ pageHeading(group.page) }}
            </div>
            @for (row of group.rows; track row.controlId) {
              <app-pdf-form-field
                [field]="row.field" [control]="row.control" [controlId]="row.controlId" />
            }
          }

          <label class="flex items-center gap-1.5 mt-3 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" [formControl]="flattenControl" class="h-3.5 w-3.5" />
            <ng-container i18n="Option to make the filled values permanent, so the form can no longer be edited@@pdfForm.flatten"
              >Flatten (bake values in, remove editable fields)</ng-container
            >
          </label>

          <button type="submit" [disabled]="filling.submitting() || form().invalid"
            class="w-full mt-3 py-1.5 text-xs rounded bg-accent text-white font-semibold
                   hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">
            {{ filling.submitting() ? fillingLabel : fillLabel }}
          </button>

          @if (filling.message()) {
            <div class="text-xs mt-2 p-2 rounded" role="status" aria-live="polite"
                 [class]="filling.messageIsError()
                   ? 'text-red-600 bg-red-50 border border-red-200'
                   : 'text-green-700 bg-green-50 border border-green-200'">
              {{ filling.message() }}
            </div>
          }
        </form>
      }
    </div>
  `
})
export class PdfFormComponent implements OnInit {
  @Input({ required: true }) documentId!: number;

  readonly filling = inject(PdfFormFillingService);
  private state = inject(ViewerStateService);

  readonly pages = signal<readonly FormPageGroup[]>([]);
  readonly form = signal(new FormGroup<Record<string, FormControl>>({}));
  readonly flattenControl = new FormControl(false, { nonNullable: true });

  /**
   * Labels that live in expressions, so `i18n` cannot mark them.
   *
   * <p>The action button said "Fill & Download". Nothing is downloaded: the
   * values are written into a new version of the open document, which the
   * viewer then reloads. The name now says what happens (§3.2).
   */
  readonly fillLabel = $localize`:Saves the entered values into a new version of the document@@pdfForm.fillAction:Save filled form`;
  readonly fillingLabel = $localize`:Fill button while the request is in flight@@pdfForm.fillingAction:Saving...`;

  ngOnInit() {
    this.loadFields();
  }

  /** Reads the document's fields again, after new ones were added. */
  reloadFields() {
    this.loadFields();
  }

  fieldCount(): number {
    return this.pages().reduce((total, group) => total + group.rows.length, 0);
  }

  pageHeading(page: number): string {
    return pageLabel(page);
  }

  submit() {
    const form = this.form();
    if (form.invalid) { form.markAllAsTouched(); return; }

    // getRawValue() would include disabled read-only fields; the server
    // rejects those anyway, so send only what the user can actually change.
    const values = form.value as Record<string, string | boolean>;

    this.filling.fill(this.documentId, values, this.flattenControl.value, result => {
      // Reload so the viewer shows the filled document; the next operation
      // then runs against these values rather than the empty form.
      this.state.applyVersionCommit(result.version, result.summary);
      // Flattening drops the interactive fields, so re-read them: what the
      // panel is showing no longer exists in the document.
      if (this.flattenControl.value) this.loadFields();
    });
  }

  private loadFields() {
    this.filling.readFields(this.documentId, fields => this.showFields(fields));
  }

  private showFields(fields: PdfFormField[]) {
    const layout = layoutFor(fields);
    this.form.set(layout.form);
    this.pages.set(layout.pages);
  }
}
