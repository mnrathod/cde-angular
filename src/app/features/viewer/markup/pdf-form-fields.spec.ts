/**
 * What a PDF's declared fields turn into.
 *
 * <p>The rules here are the document's, not ours: a read-only field cannot
 * be edited, a signature is signed elsewhere, a tick starts ticked or not,
 * and a maximum length is a maximum length. Getting one wrong either blocks
 * a submission that should go through or lets through one the document will
 * reject.
 */
import { PdfFormField } from "../../../core/services/pdf-form.service";
import { isTickBox, layoutFor } from "./pdf-form-fields";

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

describe("the controls a PDF's fields become", () => {
  it("starts a text field at the value the document holds", () => {
    const { form } = layoutFor([field({ value: "Ada" })]);

    expect(form.controls["Given name"]?.value).toBe("Ada");
  });

  it("starts a tick box from its checked state, not its text value", () => {
    const { form } = layoutFor([
      field({ name: "Agree", kind: "checkbox", checked: true, value: "" }),
    ]);

    expect(form.controls["Agree"]?.value).toBe(true);
  });

  it("refuses to submit while a required field is empty", () => {
    const { form } = layoutFor([field({ required: true })]);

    expect(form.valid).toBe(false);
  });

  it("requires a required tick box to actually be ticked", () => {
    const { form } = layoutFor([
      field({ name: "Agree", kind: "checkbox", required: true, checked: false }),
    ]);

    expect(form.valid).toBe(false);
  });

  it("refuses text longer than the document allows", () => {
    const { form } = layoutFor([field({ maxLength: 3 })]);

    form.controls["Given name"]?.setValue("Ada Lovelace");

    expect(form.valid).toBe(false);
  });

  it("disables a field the document marks read-only", () => {
    const { form } = layoutFor([field({ readOnly: true })]);

    expect(form.controls["Given name"]?.disabled).toBe(true);
  });

  it("does not block submission on a required field nobody can fill in", () => {
    // Read-only and required together is a contradiction the document is
    // free to state. A disabled control carries no validators, so it cannot
    // hold the form shut. `invalid` rather than `valid` because that is what
    // the submit button reads, and a group of only-disabled controls reports
    // neither — its status is DISABLED.
    const { form } = layoutFor([
      field({ name: "locked", readOnly: true, required: true }),
      field({ name: "open", value: "something" }),
    ]);

    expect(form.invalid).toBe(false);
  });

  it("disables a signature field, because signing happens on another tab", () => {
    const { form } = layoutFor([field({ name: "Sig", kind: "signature" })]);

    expect(form.controls["Sig"]?.disabled).toBe(true);
  });
});

describe("grouping a PDF's fields by page", () => {
  it("puts each field under the page it sits on", () => {
    const { pages } = layoutFor([
      field({ name: "a", page: 2 }),
      field({ name: "b", page: 1 }),
      field({ name: "c", page: 2 }),
    ]);

    expect(pages.map((group) => group.page)).toEqual([1, 2]);
    expect(pages[1]?.rows.map((row) => row.field.name)).toEqual(["a", "c"]);
  });

  it("gives every field an id a label can point at", () => {
    // A PDF field name is not a DOM id — `Given name` has a space in it, and
    // `<label for>` would resolve to nothing.
    const { pages } = layoutFor([field({ name: "Given name" })]);

    expect(pages[0]?.rows[0]?.controlId).not.toContain(" ");
  });

  it("does not give two fields the same id", () => {
    const { pages } = layoutFor([
      field({ name: "one" }), field({ name: "two" }), field({ name: "three" }),
    ]);
    const ids = pages.flatMap((group) => group.rows.map((row) => row.controlId));

    expect(new Set(ids).size).toBe(3);
  });

  it("hands each row the control that belongs to it", () => {
    const { form, pages } = layoutFor([field({ name: "Given name" })]);

    expect(pages[0]?.rows[0]?.control).toBe(form.controls["Given name"]);
  });
});

describe("telling a tick from text", () => {
  it("counts a checkbox as a tick", () => {
    expect(isTickBox(field({ kind: "checkbox" }))).toBe(true);
  });

  it("counts a radio as a tick, because the document gives it one state", () => {
    expect(isTickBox(field({ kind: "radio" }))).toBe(true);
  });

  it("does not count a dropdown as a tick", () => {
    expect(isTickBox(field({ kind: "dropdown" }))).toBe(false);
  });
});
