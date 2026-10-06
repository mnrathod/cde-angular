/**
 * A PDF's existing fillable fields, as an editable form.
 *
 * <p>The behaviour worth pinning down is that filling **commits a version**
 * rather than handing back a download. That is what lets the operations be
 * combined — fill, then redact, then flatten — and it is also why the panel has
 * to re-read the document afterwards in one specific case: flattening removes
 * the interactive fields, so what the panel is still showing no longer exists in
 * the file. Leaving the form on screen after a flatten offers the reader
 * controls that cannot be filled again and whose next submission would be
 * refused.
 *
 * <p>The action button is the other thing. It used to say "Fill & Download".
 * Nothing is downloaded, and §3.2 is explicit that names must not lie — a
 * reader who pressed it waited for a file that never arrived while the document
 * changed under them.
 */
import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";

import { PdfFormField } from "../../../core/services/pdf-form.service";
import { ViewerStateService } from "../../../../viewer-core/viewer-state.service";
import { PdfFormComponent } from "./pdf-form.component";
import { PdfFormFillingService } from "./pdf-form-filling.service";

function field(overrides: Partial<PdfFormField> = {}): PdfFormField {
  return {
    name: "inspector",
    kind: "TEXT",
    type: "/Tx",
    flags: 0,
    readOnly: false,
    required: false,
    page: 1,
    value: "",
    ...overrides,
  } as PdfFormField;
}

describe("PdfFormComponent", () => {
  let fixture: ComponentFixture<PdfFormComponent>;
  let panel: PdfFormComponent;
  let filling: PdfFormFillingService;
  let state: ViewerStateService;

  let fieldsToReturn: PdfFormField[];
  let readCount: number;
  let fills: Array<{
    documentId: number;
    values: Record<string, string | boolean>;
    flatten: boolean;
  }>;
  /** Lets a test settle the fill the way the service would. */
  let settleFill: ((result: { version: number; summary: string }) => void) | null;

  beforeEach(() => {
    fieldsToReturn = [field()];
    readCount = 0;
    fills = [];
    settleFill = null;

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), ViewerStateService],
    });
    state = TestBed.inject(ViewerStateService);
    fixture = TestBed.createComponent(PdfFormComponent);
    fixture.componentRef.setInput("documentId", 42);
    panel = fixture.componentInstance;
    filling = fixture.debugElement.injector.get(PdfFormFillingService);

    vi.spyOn(filling, "readFields").mockImplementation((_id, onFields) => {
      readCount += 1;
      filling.loading.set(false);
      onFields(fieldsToReturn);
    });
    vi.spyOn(filling, "fill").mockImplementation(
      (documentId, values, flatten, onFilled) => {
        fills.push({ documentId, values, flatten });
        settleFill = (result) => onFilled(result as never);
      },
    );
  });

  afterEach(() => vi.restoreAllMocks());

  function open(): void {
    fixture.detectChanges();
  }

  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? "";
  }

  function submitButton(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
  }

  describe("reading the document's fields", () => {
    it("reads them when the panel opens", () => {
      open();

      expect(readCount).toBe(1);
    });

    it("lists one row per field", () => {
      fieldsToReturn = [field({ name: "inspector" }), field({ name: "date" })];

      open();

      expect(fixture.nativeElement.querySelectorAll("app-pdf-form-field")).toHaveLength(2);
    });

    it("counts them, in the singular for one", () => {
      // "1 fields." is the kind of thing that makes a product look unfinished in
      // the demo a procurement decision gets made from.
      fieldsToReturn = [field()];

      open();

      expect(text()).toContain("1 field.");
      expect(text()).not.toContain("1 fields");
    });

    it("counts them in the plural for several", () => {
      fieldsToReturn = [field({ name: "a" }), field({ name: "b" }), field({ name: "c" })];

      open();

      expect(text()).toContain("3 fields.");
    });

    it("groups them by the page they are on", () => {
      // A list of twenty identical-looking rows is a list nobody can check
      // against the document in front of them.
      fieldsToReturn = [field({ name: "a", page: 1 }), field({ name: "b", page: 3 })];

      open();

      expect(panel.pages().map((group) => group.page)).toEqual([1, 3]);
    });

    it("says what filling will do before anything is entered", () => {
      // The reader is about to change a document, not download one. §1.1: the
      // panel teaches rather than letting the consequence arrive afterwards.
      open();

      expect(text().toLowerCase()).toContain("commits a new version");
      expect(text().toLowerCase()).toContain("history");
    });
  });

  describe("a document with no fillable fields", () => {
    it("says so rather than showing an empty form", () => {
      fieldsToReturn = [];

      open();

      expect(text()).toContain("no fillable form fields");
    });

    it("offers no submit control, since there is nothing to fill", () => {
      fieldsToReturn = [];

      open();

      expect(submitButton()).toBeNull();
    });

    it("still offers the design panel, which is how fields get there", () => {
      // The one case where the empty state has a next action, and it is in the
      // sibling panel above.
      fieldsToReturn = [];

      open();

      expect(fixture.nativeElement.querySelector("app-pdf-form-design")).not.toBeNull();
    });
  });

  describe("while the fields are being read", () => {
    it("says so rather than claiming the document has none", () => {
      // "This PDF has no fillable form fields" during the first read is a
      // statement about the document that happens to be false.
      vi.mocked(filling.readFields).mockImplementation(() => {
        filling.loading.set(true);
      });

      open();

      expect(text()).toContain("Reading form fields");
      expect(text()).not.toContain("no fillable form fields");
    });
  });

  describe("when the fields could not be read", () => {
    it("says why, and interrupts", () => {
      vi.mocked(filling.readFields).mockImplementation(() => {
        filling.loading.set(false);
        filling.error.set("This document's form fields could not be read.");
      });

      open();

      expect(text()).toContain("could not be read");
      expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    });

    it("shows the failure instead of the empty state", () => {
      vi.mocked(filling.readFields).mockImplementation(() => {
        filling.loading.set(false);
        filling.error.set("Unreadable.");
      });

      open();

      expect(text()).not.toContain("no fillable form fields");
    });
  });

  describe("the action button", () => {
    it("says what it does, which is save rather than download", () => {
      // It said "Fill & Download". Nothing is downloaded — the values go into a
      // new version of the open document, which the viewer reloads. §3.2: names
      // must not lie.
      open();

      expect(submitButton().textContent).toContain("Save");
      expect(submitButton().textContent).not.toContain("Download");
    });

    it("says it is working while the request is in flight", () => {
      open();
      filling.submitting.set(true);
      fixture.detectChanges();

      expect(submitButton().textContent).toContain("Saving");
      expect(submitButton().disabled).toBe(true);
    });

    it("is refused while a required field is empty", () => {
      // The PDF declares which fields are required, so this is the document's own
      // rule rather than one invented here.
      fieldsToReturn = [field({ name: "inspector", required: true, value: "" })];

      open();

      expect(panel.form().invalid).toBe(true);
      expect(submitButton().disabled).toBe(true);
    });

    it("is available once the required field has a value", () => {
      fieldsToReturn = [field({ name: "inspector", required: true, value: "Sam" })];

      open();

      expect(submitButton().disabled).toBe(false);
    });
  });

  describe("filling the form", () => {
    it("sends the values for the document it was given", () => {
      fieldsToReturn = [field({ name: "inspector", value: "Sam" })];
      open();

      panel.submit();

      expect(fills[0]!.documentId).toBe(42);
      expect(fills[0]!.values).toMatchObject({ inspector: "Sam" });
    });

    it("sends nothing when the form is invalid", () => {
      // The button is disabled, and this is the other half: a submit that reached
      // the method anyway must not send a form the document will refuse.
      fieldsToReturn = [field({ name: "inspector", required: true, value: "" })];
      open();

      panel.submit();

      expect(fills).toEqual([]);
    });

    it("marks the fields so the reader can see which one is wrong", () => {
      // A refused submit that changes nothing on screen reads as a button that
      // does not work. Touching the controls is what makes the validation
      // messages appear.
      fieldsToReturn = [field({ name: "inspector", required: true, value: "" })];
      open();

      panel.submit();

      expect(panel.form().touched).toBe(true);
    });

    it("reloads the viewer, so it shows the filled document", () => {
      // Without this the reader sees the empty form they just filled, and the
      // next operation runs against the unfilled version.
      fieldsToReturn = [field({ name: "inspector", value: "Sam" })];
      open();
      panel.submit();

      settleFill!({ version: 4, summary: "1 field filled" });

      expect(state.reloadToken()).toBeGreaterThan(0);
    });

    it("does not re-read the fields after an ordinary fill", () => {
      // The fields are still there, holding the values just written. Re-reading
      // would discard anything the reader had typed and not yet submitted.
      fieldsToReturn = [field({ name: "inspector", value: "Sam" })];
      open();
      const readsBefore = readCount;
      panel.submit();

      settleFill!({ version: 4, summary: "1 field filled" });

      expect(readCount).toBe(readsBefore);
    });
  });

  describe("flattening as part of the fill", () => {
    it("is off by default, because it cannot be undone within the document", () => {
      // A flattened form has no interactive fields left. Defaulting it on would
      // make the ordinary case destructive.
      open();

      expect(panel.flattenControl.value).toBe(false);
    });

    it("is sent when the reader asks for it", () => {
      fieldsToReturn = [field({ name: "inspector", value: "Sam" })];
      open();
      panel.flattenControl.setValue(true);

      panel.submit();

      expect(fills[0]!.flatten).toBe(true);
    });

    it("says what it does, not just what it is called", () => {
      open();

      expect(text().toLowerCase()).toContain("bake values in");
      expect(text().toLowerCase()).toContain("remove editable fields");
    });

    it("re-reads the fields afterwards, because they are gone", () => {
      // Flattening removes the interactive fields. Leaving the form on screen
      // offers the reader controls that no longer exist in the document and whose
      // next submission the server would refuse.
      fieldsToReturn = [field({ name: "inspector", value: "Sam" })];
      open();
      panel.flattenControl.setValue(true);
      panel.submit();
      const readsBefore = readCount;

      settleFill!({ version: 4, summary: "Form flattened" });

      expect(readCount).toBe(readsBefore + 1);
    });
  });

  describe("fields added by the design panel", () => {
    it("are read again, since the sibling panel cannot say what they are", () => {
      open();
      const readsBefore = readCount;

      panel.reloadFields();

      expect(readCount).toBe(readsBefore + 1);
    });

    it("appear in the list", () => {
      open();
      fieldsToReturn = [field({ name: "inspector" }), field({ name: "signature" })];

      panel.reloadFields();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelectorAll("app-pdf-form-field")).toHaveLength(2);
    });
  });

  describe("what the panel announces", () => {
    it("announces the outcome rather than only showing it", () => {
      // A commit finishing is the one thing here that happens without the reader
      // asking for it just then.
      fieldsToReturn = [field({ name: "inspector", value: "Sam" })];
      open();
      filling.message.set("1 field filled — version 4 created");
      fixture.detectChanges();

      const live = fixture.nativeElement.querySelector('[role="status"]');

      expect(live).not.toBeNull();
      expect(live.getAttribute("aria-live")).toBe("polite");
      expect(live.textContent).toContain("version 4");
    });

    it("marks a failure as one, not only by colouring it", () => {
      fieldsToReturn = [field({ name: "inspector", value: "Sam" })];
      open();
      filling.message.set("The form could not be filled.");
      filling.messageIsError.set(true);
      fixture.detectChanges();

      expect(
        (fixture.nativeElement.querySelector('[role="status"]') as HTMLElement).className,
      ).toContain("text-red-600");
    });

    it("shows nothing before anything has happened", () => {
      fieldsToReturn = [field({ name: "inspector", value: "Sam" })];

      open();

      expect(fixture.nativeElement.querySelector('[role="status"]')).toBeNull();
    });
  });
});
