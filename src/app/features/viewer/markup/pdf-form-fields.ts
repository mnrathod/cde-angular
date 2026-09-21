/**
 * Turning a PDF's declared fields into controls a page can render.
 *
 * <p>Out of the component because none of it is rendering: which validators
 * a field earns, what its starting value is, and which page it belongs to
 * are all decided by the metadata the document itself carries (§3.3 —
 * components render and dispatch).
 *
 * <p>The form and the grouping are built together, in one pass, so every row
 * holds the control it names. Looking the control up from the group
 * afterwards would make every row's control optional to satisfy the type
 * checker, for a case that cannot arise.
 */
import { FormControl, FormGroup, ValidatorFn, Validators } from "@angular/forms";

import { PdfFormField } from "../../../core/services/pdf-form.service";

/** A field whose value is a tick rather than text. */
export function isTickBox(field: PdfFormField): boolean {
  return field.kind === "checkbox" || field.kind === "radio";
}

/** One field, its control, and the id a label can point at. */
export interface FormFieldRow {
  readonly field: PdfFormField;
  readonly control: FormControl;
  readonly controlId: string;
}

/** The fields that sit on one page of the document. */
export interface FormPageGroup {
  readonly page: number;
  readonly rows: readonly FormFieldRow[];
}

export interface PdfFormLayout {
  readonly form: FormGroup<Record<string, FormControl>>;
  readonly pages: readonly FormPageGroup[];
}

/**
 * A DOM id for a field's control.
 *
 * <p>The field's own name was used as the id. AcroForm names are not ids:
 * `topmostSubform[0].Page1[0].Name[0]` and `Given name` are both ordinary
 * PDF field names, and a space makes `<label for>` resolve to nothing — so
 * the control ends up with no accessible name at all (§1A.2). An ordinal is
 * enough here, and unlike escaping the name it cannot collide.
 */
function controlIdAt(index: number): string {
  return `pdf-form-field-${index}`;
}

function controlFor(field: PdfFormField): FormControl {
  const tick = isTickBox(field);
  const validators: ValidatorFn[] = [];

  // A read-only field is disabled, and Angular skips validation on disabled
  // controls — so requiring one would never block submission anyway, but
  // stating the condition keeps the intent explicit.
  if (field.required && !field.readOnly) {
    validators.push(tick ? Validators.requiredTrue : Validators.required);
  }
  if (field.maxLength) validators.push(Validators.maxLength(field.maxLength));

  return new FormControl(
    {
      value: tick ? !!field.checked : (field.value ?? ""),
      disabled: field.readOnly || field.kind === "signature",
    },
    { nonNullable: true, validators },
  );
}

/** Builds the form for these fields and groups them by the page they sit on. */
export function layoutFor(fields: readonly PdfFormField[]): PdfFormLayout {
  const controls: Record<string, FormControl> = {};
  const byPage = new Map<number, FormFieldRow[]>();

  fields.forEach((field, index) => {
    const control = controlFor(field);
    controls[field.name] = control;

    const row: FormFieldRow = { field, control, controlId: controlIdAt(index) };
    const existing = byPage.get(field.page);
    if (existing) existing.push(row);
    else byPage.set(field.page, [row]);
  });

  const pages = [...byPage.entries()]
    .sort(([left], [right]) => left - right)
    .map(([page, rows]) => ({ page, rows }));

  return { form: new FormGroup(controls), pages };
}
