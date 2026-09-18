import {
  Component, Input, OnInit, inject, signal, computed, ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder, FormGroup, FormControl, Validators, ReactiveFormsModule, FormsModule
} from '@angular/forms';
import { PdfFormService, PdfFormField } from '../../../core/services/pdf-form.service';
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
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="p-3">
      <!-- ── Design ────────────────────────────────────────────── -->
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

  readonly designing     = signal(false);
  readonly designMessage = signal('');
  readonly designFailed  = signal(false);

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
  draftsReady(): boolean {
    const drafts = this.state.formFieldDrafts();
    return drafts.length > 0 && drafts.every(draft =>
      draft.name.trim().length > 0 &&
      (draft.kind !== 'DROPDOWN' || draft.options.split(',').some(o => o.trim())));
  }

  addDrafts() {
    if (!this.draftsReady()) return;
    this.designing.set(true);
    this.designMessage.set('');

    this.formService.addFields(this.documentId, this.state.formFieldDrafts()).subscribe({
      next: result => {
        this.designing.set(false);
        this.designFailed.set(false);
        this.designMessage.set(result.summary);
        this.state.clearFormFieldDrafts();
        // The document now has fields it did not have; reload so the fill
        // form below reflects them.
        this.state.applyVersionCommit(result.version, result.summary);
        this.loadFields();
      },
      error: err => {
        this.designing.set(false);
        this.designFailed.set(true);
        // The server names the offending field, which is more use than a
        // generic rejection when twenty boxes have been placed.
        this.designMessage.set(
          problemMessage(
            err,
            $localize`:Fallback when adding new form fields fails without a reason@@pdfForm.addFailed:The fields could not be added.`,
          ),
        );
      }
    });
  }

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
  readonly addFieldsLabel = $localize`:Commits the drawn fields to the document@@pdfForm.addFieldsAction:Add fields`;
  readonly addingLabel = $localize`:Add-fields button while the request is in flight@@pdfForm.addingAction:Adding...`;
  readonly addFieldsHint = $localize`:Tooltip on the enabled Add fields button@@pdfForm.addFieldsHint:Add these fields to the document`;
  readonly unnamedFieldHint = $localize`:Tooltip explaining why Add fields is unavailable@@pdfForm.unnamedFieldHint:Every field needs a name`;
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
