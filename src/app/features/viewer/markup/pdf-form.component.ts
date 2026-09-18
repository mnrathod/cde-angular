import {
  Component, Input, OnInit, inject, signal, computed, ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder, FormGroup, FormControl, Validators, ReactiveFormsModule, FormsModule
} from '@angular/forms';
import { PdfFormService, PdfFormField } from '../../../core/services/pdf-form.service';
import { PdfFormDesignComponent } from './pdf-form-design.component';
import { ViewerStateService } from '../../../../viewer-core/viewer-state.service';
import { problemMessage } from '../../../core/handlers/problem-detail';
import { abbreviatedPageLabel } from '../../../../viewer-core/page-labels';

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
  imports: [
    CommonModule, ReactiveFormsModule, FormsModule, PdfFormDesignComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="p-3">
      <app-pdf-form-design
        [documentId]="documentId"
        (fieldsAdded)="reloadFields()"
      />

      <div i18n="Heading over the PDF's existing fillable fields@@pdfForm.heading"
           class="text-sm font-semibold text-gray-800 mb-1">Form Fields</div>

      @if (loading()) {
        <div i18n="@@pdfForm.loading" class="text-xs text-gray-400 py-6 text-center">Reading form fields...</div>
      }

      @if (!loading() && error()) {
        <div class="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
          {{ error() }}
        </div>
      }

      @if (!loading() && !error() && fields().length === 0) {
        <div i18n="@@pdfForm.empty" class="text-xs text-gray-400 py-6 text-center">
          This PDF has no fillable form fields.
        </div>
      }

      @if (fields().length > 0) {
        <p i18n="How many fillable fields the document has, and what filling them does@@pdfForm.fieldCount"
           class="text-xs text-gray-500 mb-3">
          {fields().length, plural, =1 {1 field.} other {{{ fields().length }} fields.}} Filling commits a new version; the previous one stays in the history.
        </p>

        <form [formGroup]="form" (ngSubmit)="submit()">
          @for (page of pageNumbers(); track page) {
            <div i18n="Groups the form fields that sit on one page@@pdfForm.pageHeading"
                 class="text-xs font-semibold text-gray-500 mt-3 mb-1.5 border-b border-gray-200 pb-1">
              Page {{ page }}
            </div>

            @for (field of fieldsOnPage(page); track field.name) {
              <div class="mb-2.5">
                <label class="block text-xs text-gray-600 mb-0.5" [attr.for]="field.name">
                  {{ field.name }}
                  @if (field.required) { <span class="text-red-500" aria-hidden="true">*</span> }
                  @if (field.readOnly) {
                    <span i18n="Marks a form field the document does not allow changing@@pdfForm.readOnly"
                          class="text-gray-400">(read-only)</span>
                  }
                </label>

                @switch (field.kind) {
                  @case ('checkbox') {
                    <input type="checkbox" [id]="field.name" [formControlName]="field.name"
                           class="h-4 w-4 align-middle" />
                  }
                  @case ('radio') {
                    <input type="checkbox" [id]="field.name" [formControlName]="field.name"
                           class="h-4 w-4 align-middle" />
                  }
                  @case ('textarea') {
                    <textarea [id]="field.name" [formControlName]="field.name" rows="3"
                      class="w-full px-2 py-1 text-xs border border-gray-300 rounded
                             focus:outline-none focus:ring-2 focus:ring-accent
                             disabled:bg-gray-100 disabled:text-gray-500"></textarea>
                  }
                  @case ('dropdown') {
                    <select [id]="field.name" [formControlName]="field.name"
                      class="w-full px-2 py-1 text-xs border border-gray-300 rounded
                             focus:outline-none focus:ring-2 focus:ring-accent
                             disabled:bg-gray-100 disabled:text-gray-500">
                      <option value="">—</option>
                      @for (opt of field.options; track opt.value) {
                        <option [value]="opt.value">{{ opt.label }}</option>
                      }
                    </select>
                  }
                  @case ('listbox') {
                    <select [id]="field.name" [formControlName]="field.name" size="4"
                      class="w-full px-2 py-1 text-xs border border-gray-300 rounded
                             focus:outline-none focus:ring-2 focus:ring-accent
                             disabled:bg-gray-100 disabled:text-gray-500">
                      @for (opt of field.options; track opt.value) {
                        <option [value]="opt.value">{{ opt.label }}</option>
                      }
                    </select>
                  }
                  @case ('signature') {
                    <div i18n="Shown in place of a signature field. The tab name must match the sidebar's Sign label.@@pdfForm.signatureField"
                         class="text-xs text-gray-400 italic">
                      Signature field — use the Sign tab.
                    </div>
                  }
                  @default {
                    <input [type]="field.kind === 'password' ? 'password' : 'text'"
                      [id]="field.name" [formControlName]="field.name"
                      [attr.maxlength]="field.maxLength ?? null"
                      class="w-full px-2 py-1 text-xs border border-gray-300 rounded
                             focus:outline-none focus:ring-2 focus:ring-accent
                             disabled:bg-gray-100 disabled:text-gray-500" />
                  }
                }

                @if (isInvalid(field.name)) {
                  <div i18n="Validation message naming the field that was left empty@@pdfForm.fieldRequired"
                       class="text-xs text-red-500 mt-0.5">
                    {{ field.name }} is required.
                  </div>
                }
                @if (field.maxLength) {
                  <div i18n="How many characters a field accepts@@pdfForm.maxLength"
                       class="text-xs text-gray-400 mt-0.5">Max {{ field.maxLength }} characters</div>
                }
              </div>
            }
          }

          <label class="flex items-center gap-1.5 mt-3 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" [formControl]="flattenControl" class="h-3.5 w-3.5" />
            <ng-container i18n="Option to make the filled values permanent, so the form can no longer be edited@@pdfForm.flatten"
              >Flatten (bake values in, remove editable fields)</ng-container
            >
          </label>

          <button type="submit" [disabled]="submitting() || form.invalid"
            class="w-full mt-3 py-1.5 text-xs rounded bg-accent text-white font-semibold
                   hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">
            {{ submitting() ? fillingLabel : fillAndDownloadLabel }}
          </button>

          @if (statusMessage()) {
            <div class="text-xs mt-2 p-2 rounded"
                 [class]="statusIsError()
                   ? 'text-red-600 bg-red-50 border border-red-200'
                   : 'text-green-700 bg-green-50 border border-green-200'">
              {{ statusMessage() }}
            </div>
          }
        </form>
      }
    </div>
  `
})
export class PdfFormComponent implements OnInit {
  pageShort = abbreviatedPageLabel;

  @Input({ required: true }) documentId!: number;
  @Input() documentName = 'document';

  private formService = inject(PdfFormService);
  private fb          = inject(FormBuilder);
  readonly state      = inject(ViewerStateService);

  readonly fields        = signal<PdfFormField[]>([]);
  readonly loading       = signal(true);
  readonly error         = signal('');
  readonly submitting    = signal(false);
  readonly statusMessage = signal('');
  readonly statusIsError = signal(false);

  form = this.fb.group({});
  flattenControl = new FormControl(false, { nonNullable: true });

  readonly pageNumbers = computed(() =>
    [...new Set(this.fields().map(f => f.page))].sort((a, b) => a - b)
  );

  fieldsOnPage(page: number): PdfFormField[] {
    return this.fields().filter(f => f.page === page);
  }

  /** Reads the document's fields again, after new ones were added. */
  reloadFields() {
    this.loadFields();
  }

  ngOnInit() {
    this.loadFields();
  }

  private loadFields() {
    this.loading.set(true);
    this.error.set('');
    this.formService.getFields(this.documentId).subscribe({
      next: response => {
        this.loading.set(false);
        if (!response.success) {
          this.error.set(response.error || 'Could not read form fields.');
          return;
        }
        // Push buttons carry no value to fill, so they'd only add noise.
        const editable = (response.fields || []).filter(f => f.kind !== 'button');
        this.fields.set(editable);
        this.buildForm(editable);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err.status === 503
          ? this.converterDownText()
          : $localize`:Shown when a PDF's form fields cannot be read@@pdfForm.readFailed:Could not read form fields from this document.`);
      }
    });
  }

  private buildForm(fields: PdfFormField[]) {
    const group = this.fb.group({});
    for (const field of fields) {
      const isBoolean = field.kind === 'checkbox' || field.kind === 'radio';
      const validators = [];
      // A read-only field is disabled, and Angular skips validation on
      // disabled controls — so requiring one would never block submission
      // anyway, but stating the condition keeps the intent explicit.
      if (field.required && !field.readOnly) {
        validators.push(isBoolean ? Validators.requiredTrue : Validators.required);
      }
      if (field.maxLength) validators.push(Validators.maxLength(field.maxLength));

      group.addControl(field.name, new FormControl(
        { value: isBoolean ? !!field.checked : (field.value ?? ''),
          disabled: field.readOnly || field.kind === 'signature' },
        { nonNullable: true, validators }
      ));
    }
    this.form = group;
  }

  /** Every placed field needs a name, and a dropdown needs choices. */
  /**
   * Said from two places, which is why it is a method rather than a field.
   *
   * <p>A 503 here means the out-of-process converter (§5.13.10) is down, not
   * that the document is at fault — worth distinguishing, because one is a
   * problem with the file and the other is a problem with the deployment.
   */
  private converterDownText(): string {
    return $localize`:Shown when the backend document converter is unreachable@@pdfForm.converterDown:The document converter service is not running.`;
  }

  /** Labels and hints that live in expressions, so `i18n` cannot mark them. */
  readonly fillAndDownloadLabel = $localize`:Saves the entered values and downloads the result@@pdfForm.fillAction:Fill & Download`;
  readonly fillingLabel = $localize`:Fill button while the request is in flight@@pdfForm.fillingAction:Filling...`;

  isInvalid(name: string): boolean {
    const control = this.form.get(name);
    return !!control && control.invalid && (control.dirty || control.touched);
  }

  submit() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }

    // getRawValue() would include disabled read-only fields; the server
    // rejects those anyway, so send only what the user can actually change.
    const values = this.form.value as Record<string, string | boolean>;

    this.submitting.set(true);
    this.statusMessage.set('');
    this.formService.fillForm(this.documentId, values, this.flattenControl.value).subscribe({
      next: result => {
        this.submitting.set(false);
        this.statusIsError.set(false);
        const version = result.version;
        const summary = result.summary;
        this.statusMessage.set(
          $localize`:Confirms a filled form was saved, naming the new version@@pdfForm.saved:Saved as version ${version}:version: — ${summary}:summary:`,
        );
        // Reload so the viewer shows the filled document; the next operation
        // then runs against these values rather than the empty form.
        this.state.applyVersionCommit(result.version, result.summary);
        // Flattening drops the interactive fields, so re-read them: what the
        // panel is showing no longer exists in the document.
        if (this.flattenControl.value) this.loadFields();
      },
      error: err => {
        this.submitting.set(false);
        this.statusIsError.set(true);
        this.statusMessage.set(err.status === 503
          ? this.converterDownText()
          : problemMessage(
              err,
              $localize`:Fallback when filling a form fails without a reason@@pdfForm.fillFailed:Filling the form failed.`,
            ));
      }
    });
  }
}
