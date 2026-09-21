/**
 * Whether a fillable field can be understood without seeing it.
 *
 * <p>These are the three defects the row carried, written down so they
 * cannot come back: a label pointing at an id that did not exist, a
 * requirement announced only as a hidden asterisk, and a validation message
 * sitting beside the control with nothing tying it to it.
 */
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { FormControl } from "@angular/forms";

import { PdfFormField } from "../../../core/services/pdf-form.service";
import { PdfFormFieldComponent } from "./pdf-form-field.component";

function field(overrides: Partial<PdfFormField> = {}): PdfFormField {
  return {
    name: "Given name",
    kind: "text",
    type: "/Tx",
    flags: 0,
    readOnly: false,
    required: false,
    page: 1,
    value: "",
    ...overrides,
  };
}

async function rowFor(
  overrides: Partial<PdfFormField> = {},
  control = new FormControl("", { nonNullable: true }),
) {
  TestBed.configureTestingModule({ imports: [PdfFormFieldComponent] });
  const fixture = TestBed.createComponent(PdfFormFieldComponent);
  fixture.componentRef.setInput("field", field(overrides));
  fixture.componentRef.setInput("control", control);
  fixture.componentRef.setInput("controlId", "pdf-form-field-0");
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

function host(fixture: ComponentFixture<PdfFormFieldComponent>) {
  return fixture.nativeElement as HTMLElement;
}

describe("a fillable field", () => {
  it("points its label at the control it names", async () => {
    // The PDF's own field name was used as the id. "Given name" has a space
    // in it, so the label resolved to nothing.
    const fixture = await rowFor();
    const label = host(fixture).querySelector("label");
    const control = host(fixture).querySelector("input");

    expect(label?.getAttribute("for")).toBe(control?.id);
  });

  it("tells assistive technology that a required field is required", async () => {
    const fixture = await rowFor({ required: true });

    expect(host(fixture).querySelector("input")?.getAttribute("aria-required"))
      .toBe("true");
  });

  it("does not require a field the document will not let anyone fill in", async () => {
    const fixture = await rowFor({ required: true, readOnly: true });

    expect(host(fixture).querySelector("input")?.getAttribute("aria-required"))
      .toBeNull();
  });

  it("ties the validation message to the control it is about", async () => {
    const control = new FormControl("", { nonNullable: true });
    const fixture = await rowFor({ required: true }, control);

    control.setErrors({ required: true });
    control.markAsTouched();
    fixture.detectChanges();

    const input = host(fixture).querySelector("input");
    const described = input?.getAttribute("aria-describedby") ?? "";
    expect(described).not.toBe("");
    expect(host(fixture).querySelector(`#${described.split(" ")[0]}`)).not.toBeNull();
  });

  it("marks the control invalid while it is showing an error", async () => {
    const control = new FormControl("", { nonNullable: true });
    const fixture = await rowFor({ required: true }, control);

    control.setErrors({ required: true });
    control.markAsTouched();
    fixture.detectChanges();

    expect(host(fixture).querySelector("input")?.getAttribute("aria-invalid"))
      .toBe("true");
  });

  it("stays silent about validity before the reader has touched it", async () => {
    const control = new FormControl("", { nonNullable: true });
    const fixture = await rowFor({ required: true }, control);

    control.setErrors({ required: true });
    fixture.detectChanges();

    expect(host(fixture).querySelector("input")?.getAttribute("aria-invalid"))
      .toBeNull();
  });

  it("ties the length limit to the control as well", async () => {
    const fixture = await rowFor({ maxLength: 20 });
    const input = host(fixture).querySelector("input");
    const described = input?.getAttribute("aria-describedby") ?? "";

    expect(host(fixture).querySelector(`#${described}`)?.textContent)
      .toContain("20");
  });

  it("leaves the label pointing at nothing for a signature, which has no control", async () => {
    const fixture = await rowFor({ kind: "signature" });

    expect(host(fixture).querySelector("label")?.getAttribute("for")).toBeNull();
  });

  it("renders a tick box for a checkbox field", async () => {
    const fixture = await rowFor({ kind: "checkbox" });

    expect(host(fixture).querySelector("input")?.type).toBe("checkbox");
  });

  it("renders a tick box for a radio field too, because the document gives it one state", async () => {
    const fixture = await rowFor({ kind: "radio" });

    expect(host(fixture).querySelector("input")?.type).toBe("checkbox");
  });

  it("names the unselected entry of a dropdown in words", async () => {
    // It was an em dash, which a screen reader reads out as punctuation.
    const fixture = await rowFor({
      kind: "dropdown",
      options: [{ value: "a", label: "Alpha" }],
    });
    const first = host(fixture).querySelector("option");

    expect(first?.textContent?.trim()).not.toBe("—");
    expect(first?.textContent?.trim()).not.toBe("");
  });
});
