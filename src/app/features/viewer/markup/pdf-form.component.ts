import {
  Component, Input, OnInit, inject, signal, computed, ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder, FormGroup, FormControl, Validators, ReactiveFormsModule
} from '@angular/forms';
import { PdfFormService, PdfFormField } from '../../../core/services/pdf-form.service';

/**
 * Renders a PDF's AcroForm fields as an editable form and writes the values
 * back into a downloadable copy. Field metadata (kind, options, required,
 * max length) comes from the server, so the control and its validation match
 * what the PDF itself declares rather than being guessed here.
 */
@Component({
  selector: 'app-pdf-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="p-3">
      <div class="text-sm font-semibold text-gray-800 mb-1">Form Fields</div>

      @if (loading()) {
        <div class="text-xs text-gray-400 py-6 text-center">Reading form fields...</div>
      }

      @if (!loading() && error()) {
        <div class="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
          {{ error() }}
        </div>
      }

      @if (!loading() && !error() && fields().length === 0) {
        <div class="text-xs text-gray-400 py-6 text-center">
          This PDF has no fillable form fields.
        </div>
      }

      @if (fields().length > 0) {
        <p class="text-xs text-gray-500 mb-3">
          {{ fields().length }} field(s). Filling produces a copy for download —
          the stored document is not changed.
        </p>

        <form [formGroup]="form" (ngSubmit)="submit()">
          @for (page of pageNumbers(); track page) {
            <div class="text-xs font-semibold text-gray-500 mt-3 mb-1.5 border-b border-gray-200 pb-1">
              Page {{ page }}
            </div>

            @for (field of fieldsOnPage(page); track field.name) {
              <div class="mb-2.5">
                <label class="block text-xs text-gray-600 mb-0.5" [attr.for]="field.name">
                  {{ field.name }}
                  @if (field.required) { <span class="text-red-500">*</span> }
                  @if (field.readOnly) { <span class="text-gray-400">(read-only)</span> }
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
                    <div class="text-xs text-gray-400 italic">
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
                  <div class="text-xs text-red-500 mt-0.5">
                    {{ field.name }} is required.
                  </div>
                }
                @if (field.maxLength) {
                  <div class="text-xs text-gray-400 mt-0.5">Max {{ field.maxLength }} characters</div>
                }
              </div>
            }
          }

          <label class="flex items-center gap-1.5 mt-3 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" [formControl]="flattenControl" class="h-3.5 w-3.5" />
            Flatten (bake values in, remove editable fields)
          </label>

          <button type="submit" [disabled]="submitting() || form.invalid"
            class="w-full mt-3 py-1.5 text-xs rounded bg-accent text-white font-semibold
                   hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">
            {{ submitting() ? 'Filling...' : 'Fill & Download' }}
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
  @Input({ required: true }) documentId!: number;
  @Input() documentName = 'document';

  private formService = inject(PdfFormService);
  private fb          = inject(FormBuilder);

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
          ? 'The document converter service is not running.'
          : 'Could not read form fields from this document.');
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
      next: blob => {
        this.submitting.set(false);
        const url = URL.createObjectURL(blob);
        const a   = document.createElement('a');
        a.href = url; a.download = `${this.documentName}_filled.pdf`; a.click();
        URL.revokeObjectURL(url);
        this.statusIsError.set(false);
        this.statusMessage.set('Filled PDF downloaded.');
      },
      error: err => {
        this.submitting.set(false);
        this.statusIsError.set(true);
        this.statusMessage.set(err.status === 503
          ? 'The document converter service is not running.'
          : 'Filling the form failed.');
      }
    });
  }
}
