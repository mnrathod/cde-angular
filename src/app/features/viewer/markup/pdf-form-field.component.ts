/**
 * One of a PDF's fillable fields, as a labelled control.
 *
 * <p>Three things were wrong with the row this replaces, all of them the
 * same class of defect — a control a screen reader could not make sense of:
 *
 * <ul>
 *   <li>the label pointed at the field's PDF name, which is not a DOM id
 *       (`Given name` has a space in it), so on many documents the label
 *       named nothing;
 *   <li>a required field was marked only with a red asterisk that was itself
 *       hidden from assistive technology, so the requirement was announced
 *       to nobody;
 *   <li>the validation message and the length hint sat beside the control
 *       with nothing tying them to it, so neither was read out when the
 *       control took focus.
 * </ul>
 */
import {
  ChangeDetectionStrategy, Component, Input,
} from "@angular/core";
import { FormControl, ReactiveFormsModule } from "@angular/forms";

import { PdfFormField } from "../../../core/services/pdf-form.service";
import { isTickBox } from "./pdf-form-fields";

@Component({
  selector: "app-pdf-form-field",
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-2.5">
      <label class="block text-xs text-gray-600 mb-0.5" [attr.for]="labelTarget()">
        {{ field.name }}
        @if (isRequired()) { <span class="text-red-500" aria-hidden="true">*</span> }
        @if (field.readOnly) {
          <span i18n="Marks a form field the document does not allow changing@@pdfForm.readOnly"
                class="text-gray-400">(read-only)</span>
        }
      </label>

      @switch (field.kind) {
        @case ('signature') {
          <div i18n="Shown in place of a signature field. The tab name must match the sidebar's Sign label.@@pdfForm.signatureField"
               class="text-xs text-gray-400 italic">
            Signature field — use the Sign tab.
          </div>
        }
        @case ('textarea') {
          <textarea [id]="controlId" [formControl]="control" rows="3"
            class="entry" [attr.aria-required]="requiredFlag()"
            [attr.aria-invalid]="invalidFlag()"
            [attr.aria-describedby]="describedBy()"></textarea>
        }
        @case ('dropdown') {
          <select [id]="controlId" [formControl]="control" class="entry"
            [attr.aria-required]="requiredFlag()"
            [attr.aria-invalid]="invalidFlag()"
            [attr.aria-describedby]="describedBy()">
            <option value="">{{ noChoiceLabel }}</option>
            @for (choice of field.options; track choice.value) {
              <option [value]="choice.value">{{ choice.label }}</option>
            }
          </select>
        }
        @case ('listbox') {
          <select [id]="controlId" [formControl]="control" size="4" class="entry"
            [attr.aria-required]="requiredFlag()"
            [attr.aria-invalid]="invalidFlag()"
            [attr.aria-describedby]="describedBy()">
            @for (choice of field.options; track choice.value) {
              <option [value]="choice.value">{{ choice.label }}</option>
            }
          </select>
        }
        @default {
          @if (tickBox()) {
            <input type="checkbox" [id]="controlId" [formControl]="control"
              class="h-4 w-4 align-middle"
              [attr.aria-required]="requiredFlag()"
              [attr.aria-invalid]="invalidFlag()"
              [attr.aria-describedby]="describedBy()" />
          } @else {
            <input [type]="field.kind === 'password' ? 'password' : 'text'"
              [id]="controlId" [formControl]="control"
              [attr.maxlength]="field.maxLength ?? null" class="entry"
              [attr.aria-required]="requiredFlag()"
              [attr.aria-invalid]="invalidFlag()"
              [attr.aria-describedby]="describedBy()" />
          }
        }
      }

      @if (showsError()) {
        <div [id]="errorId()" class="text-xs text-red-500 mt-0.5">{{ requiredMessage() }}</div>
      }
      @if (field.maxLength) {
        <div [id]="hintId()" i18n="How many characters a field accepts@@pdfForm.maxLength"
             class="text-xs text-gray-400 mt-0.5">Max {{ field.maxLength }} characters</div>
      }
    </div>
  `,
  styles: [`
    .entry {
      display: block; width: 100%;
      padding: .25rem .5rem; font-size: .75rem;
      border: 1px solid #d1d5db; border-radius: .25rem;
    }
    .entry:focus { outline: none; box-shadow: 0 0 0 2px var(--accent, #2563eb); }
    .entry:disabled { background: #f3f4f6; color: #6b7280; }
  `],
})
export class PdfFormFieldComponent {
  @Input({ required: true }) field!: PdfFormField;
  @Input({ required: true }) control!: FormControl;
  @Input({ required: true }) controlId!: string;

  readonly noChoiceLabel = $localize`:The unselected entry at the top of a dropdown built from a PDF's choice list@@pdfForm.noChoice:Not set`;

  tickBox(): boolean {
    return isTickBox(this.field);
  }

  /** A read-only field is never filled in, so requiring it says nothing. */
  isRequired(): boolean {
    return this.field.required && !this.field.readOnly;
  }

  requiredFlag(): string | null {
    return this.isRequired() ? "true" : null;
  }

  /** A signature is shown, not edited, so there is no control to point at. */
  labelTarget(): string | null {
    return this.field.kind === "signature" ? null : this.controlId;
  }

  showsError(): boolean {
    return this.control.invalid && (this.control.dirty || this.control.touched);
  }

  invalidFlag(): string | null {
    return this.showsError() ? "true" : null;
  }

  errorId(): string {
    return `${this.controlId}-error`;
  }

  hintId(): string {
    return `${this.controlId}-hint`;
  }

  /** The ids of whatever is currently explaining this control, in reading order. */
  describedBy(): string | null {
    const ids = [
      this.showsError() ? this.errorId() : "",
      this.field.maxLength ? this.hintId() : "",
    ].filter(Boolean);
    return ids.length ? ids.join(" ") : null;
  }

  requiredMessage(): string {
    const name = this.field.name;
    return $localize`:Validation message naming the field that was left empty@@pdfForm.fieldRequired:${name}:name: is required.`;
  }
}
