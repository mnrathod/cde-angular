/**
 * Drawing new fillable fields onto a PDF.
 *
 * <p>The other half of the form panel fills fields that already exist; this half
 * puts them there. The validation is the part worth pinning down, and it is
 * worth it for a reason that is not obvious: a field without a name cannot be
 * filled or read back, so an unnamed one is not a field with a missing label —
 * it is a box drawn on the page that does nothing, for ever, in a document
 * somebody will later be asked to sign.
 *
 * <p>The same goes for a dropdown with no options: it renders as a control the
 * reader can focus and cannot answer. Both are caught here rather than
 * server-side alone, because by the time the server refuses, twenty boxes have
 * been placed and the reader has to find which one was wrong — which is also why
 * the server's own message is passed through rather than replaced.
 *
 * <p>The disabled "Add fields" button is the one control on this panel where
 * §1.1's exception applies: it teaches, through its tooltip, which field still
 * needs attention. Hiding it would leave the reader with drawn boxes and no way
 * to commit them and no idea why.
 */
import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NEVER, Observable, of, throwError } from "rxjs";

import { FormFieldDraft, ViewerStateService } from "../../../../viewer-core/viewer-state.service";
import { FormChangeResult, PdfFormService } from "../../../core/services/pdf-form.service";
import { PdfFormDesignComponent } from "./pdf-form-design.component";

/** What the server answers with when fields went in. */
function added(summary: string, version = 3): FormChangeResult {
  return { success: true, documentId: 42, version, summary, fields: ["inspector"] };
}

/** A request that never settles, so the in-flight state can be looked at. */
function inFlight(): Observable<FormChangeResult> {
  return NEVER;
}

function draft(overrides: Partial<FormFieldDraft> = {}): FormFieldDraft {
  return {
    id: "d1",
    page: 1,
    x: 100,
    y: 100,
    width: 120,
    height: 20,
    name: "inspector",
    kind: "TEXT",
    required: false,
    options: "",
    ...overrides,
  } as FormFieldDraft;
}

describe("PdfFormDesignComponent", () => {
  let fixture: ComponentFixture<PdfFormDesignComponent>;
  let panel: PdfFormDesignComponent;
  let state: ViewerStateService;
  let forms: PdfFormService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), ViewerStateService],
    });
    state = TestBed.inject(ViewerStateService);
    forms = TestBed.inject(PdfFormService);
    fixture = TestBed.createComponent(PdfFormDesignComponent);
    fixture.componentRef.setInput("documentId", 42);
    panel = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => vi.restoreAllMocks());

  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? "";
  }

  function addButton(): HTMLButtonElement | undefined {
    return Array.from(
      fixture.nativeElement.querySelectorAll("button") as NodeListOf<HTMLButtonElement>,
    ).find((button) => /Add fields|Adding/.test(button.textContent ?? ""));
  }

  function withDrafts(...drafts: FormFieldDraft[]): void {
    state.formFieldDrafts.set(drafts);
    fixture.detectChanges();
  }

  describe("before anything has been drawn", () => {
    it("says how to draw a field rather than showing empty controls", () => {
      // §1.1: an empty state teaches. The Field tool is in the toolbar, not in
      // this panel, so without this the reader has a panel that says "Design
      // fields" and offers nothing to do.
      expect(text()).toContain("Field");
      expect(text().toLowerCase()).toContain("draw a box");
    });

    it("offers no commit or discard controls, since there is nothing to act on", () => {
      expect(addButton()).toBeUndefined();
      expect(text()).not.toContain("Discard all");
    });

    it("counts nothing", () => {
      expect(text()).not.toContain("placed");
    });
  });

  describe("once fields have been drawn", () => {
    it("counts them, so the reader can tell a missed drag from a drawn one", () => {
      withDrafts(draft(), draft({ id: "d2" }));

      expect(text()).toContain("2 placed");
    });

    it("names the page each one is on", () => {
      // Drafts accumulate across pages, and a list of identical rows with no page
      // beside them is a list nobody can check.
      withDrafts(draft({ page: 4 }));

      expect(text()).toContain("4");
    });

    it("offers a way to discard one", () => {
      withDrafts(draft(), draft({ id: "d2" }));

      const discard = Array.from(
        fixture.nativeElement.querySelectorAll('button[title="Discard"]') as NodeListOf<HTMLButtonElement>,
      );
      discard[0]!.click();
      fixture.detectChanges();

      expect(state.formFieldDrafts()).toHaveLength(1);
    });

    it("offers a way to discard all of them", () => {
      withDrafts(draft(), draft({ id: "d2" }));

      Array.from(
        fixture.nativeElement.querySelectorAll("button") as NodeListOf<HTMLButtonElement>,
      )
        .find((button) => button.textContent?.includes("Discard all"))!
        .click();
      fixture.detectChanges();

      expect(state.formFieldDrafts()).toEqual([]);
    });

    it("opens the section itself when there is something in it", () => {
      // The panel is collapsed by default. Leaving it shut after the reader has
      // drawn a box hides the only place the box can be named.
      withDrafts(draft());

      expect(
        (fixture.nativeElement.querySelector("details") as HTMLDetailsElement).open,
      ).toBe(true);
    });

    it("offers the options box only for a dropdown", () => {
      // §1.1: a field that serves one of four kinds does not belong on the other
      // three.
      withDrafts(draft({ kind: "TEXT" }));
      expect(text()).not.toContain("comma separated");

      withDrafts(draft({ kind: "DROPDOWN" }));
      expect(
        fixture.nativeElement.querySelector('input[placeholder*="comma"]'),
      ).not.toBeNull();
    });
  });

  describe("whether the drawn fields can be committed", () => {
    it("they cannot, with nothing drawn", () => {
      expect(panel.draftsReady()).toBe(false);
    });

    it("they can, once each has a name", () => {
      withDrafts(draft({ name: "inspector" }));

      expect(panel.draftsReady()).toBe(true);
      expect(addButton()!.disabled).toBe(false);
    });

    it("they cannot while one is unnamed", () => {
      // A nameless field cannot be filled or read back — it is a box that does
      // nothing, in a document somebody will be asked to sign.
      withDrafts(draft({ name: "inspector" }), draft({ id: "d2", name: "" }));

      expect(panel.draftsReady()).toBe(false);
      expect(addButton()!.disabled).toBe(true);
    });

    it("a name of nothing but spaces does not count as a name", () => {
      withDrafts(draft({ name: "   " }));

      expect(panel.draftsReady()).toBe(false);
    });

    it("a dropdown needs something to choose from", () => {
      // Otherwise it renders as a control the reader can focus and cannot
      // answer.
      withDrafts(draft({ kind: "DROPDOWN", options: "" }));

      expect(panel.draftsReady()).toBe(false);
    });

    it("a dropdown whose options are only commas has nothing to choose from", () => {
      withDrafts(draft({ kind: "DROPDOWN", options: " , , " }));

      expect(panel.draftsReady()).toBe(false);
    });

    it("a dropdown with one real option is enough", () => {
      withDrafts(draft({ kind: "DROPDOWN", options: "Approved" }));

      expect(panel.draftsReady()).toBe(true);
    });

    it("the options rule applies to dropdowns only", () => {
      // A text field legitimately has none, and sharing the rule would block
      // every form that is not a dropdown.
      withDrafts(draft({ kind: "TEXT", options: "" }));

      expect(panel.draftsReady()).toBe(true);
    });

    it("says which field still needs attention, rather than only refusing", () => {
      // §1.1's exception: the disabled state teaches. Hiding the button would
      // leave the reader with drawn boxes, no way to commit them, and no reason.
      withDrafts(draft({ name: "" }));

      expect(addButton()!.title.toLowerCase()).toContain("name");
    });

    it("says what pressing it will do once it is available", () => {
      withDrafts(draft({ name: "inspector" }));

      expect(addButton()!.title.toLowerCase()).toContain("add these fields");
    });
  });

  describe("committing them", () => {
    it("sends the drawn fields for the document it was given", () => {
      const add = vi
        .spyOn(forms, "addFields")
        .mockReturnValue(of(added("1 field added")));
      withDrafts(draft({ name: "inspector" }));
      // Captured before the click: a success clears the drafts, so reading the
      // signal afterwards would compare the call against an empty list and pass
      // whatever was sent.
      const sent = [...state.formFieldDrafts()];

      addButton()!.click();

      expect(add).toHaveBeenCalledWith(42, sent);
    });

    it("does nothing when a field is still unnamed, even if the click arrives", () => {
      // The disabled attribute is the UI half; this is the one that stops a
      // nameless field reaching the document.
      const add = vi.spyOn(forms, "addFields");
      withDrafts(draft({ name: "" }));

      panel.addDrafts();

      expect(add).not.toHaveBeenCalled();
    });

    it("does not send twice while a request is in flight", () => {
      // Two requests would add the fields twice, and a duplicate field name is
      // refused by the server — so the second attempt fails and the reader is
      // told their fields could not be added, having just watched them be.
      const add = vi.spyOn(forms, "addFields").mockReturnValue(inFlight());
      withDrafts(draft({ name: "inspector" }));

      panel.addDrafts();
      panel.addDrafts();

      expect(add).toHaveBeenCalledTimes(1);
    });

    it("clears the drafts once they are on the document", () => {
      // Leaving them would offer to add the same fields again, which the server
      // refuses as duplicates.
      vi.spyOn(forms, "addFields").mockReturnValue(
        of(added("1 field added")),
      );
      withDrafts(draft({ name: "inspector" }));

      addButton()!.click();
      fixture.detectChanges();

      expect(state.formFieldDrafts()).toEqual([]);
    });

    it("reloads the viewer, because the document now has fields it did not have", () => {
      vi.spyOn(forms, "addFields").mockReturnValue(
        of(added("1 field added")),
      );
      withDrafts(draft({ name: "inspector" }));

      addButton()!.click();

      expect(state.reloadToken()).toBeGreaterThan(0);
    });

    it("tells whatever lists the fields to read them again", () => {
      // The filling half of the panel is a sibling, so it has no way to know.
      let told = 0;
      panel.fieldsAdded.subscribe(() => (told += 1));
      vi.spyOn(forms, "addFields").mockReturnValue(
        of(added("1 field added")),
      );
      withDrafts(draft({ name: "inspector" }));

      addButton()!.click();

      expect(told).toBe(1);
    });

    it("says what happened, in the server's own words", () => {
      vi.spyOn(forms, "addFields").mockReturnValue(
        of(added("2 fields added on page 1")),
      );
      withDrafts(draft({ name: "inspector" }));

      addButton()!.click();
      fixture.detectChanges();

      expect(text()).toContain("2 fields added on page 1");
      expect(panel.designFailed()).toBe(false);
    });
  });

  describe("when it fails", () => {
    it("keeps the drawn fields, so the work is not lost", () => {
      // The reader placed and named twenty boxes. Discarding them on a failure
      // the server may have caused is the worst outcome available.
      vi.spyOn(forms, "addFields").mockReturnValue(throwError(() => ({ status: 500 })));
      withDrafts(draft({ name: "inspector" }));

      addButton()!.click();
      fixture.detectChanges();

      expect(state.formFieldDrafts()).toHaveLength(1);
    });

    it("passes the server's reason through, since it names the offending field", () => {
      // "The fields could not be added" with twenty boxes placed leaves the
      // reader to find which one by trial.
      vi.spyOn(forms, "addFields").mockReturnValue(
        throwError(() => ({
          status: 422,
          error: { detail: "This document already has a field called 'inspector'." },
        })),
      );
      withDrafts(draft({ name: "inspector" }));

      addButton()!.click();
      fixture.detectChanges();

      expect(panel.designMessage()).toContain("inspector");
      expect(panel.designFailed()).toBe(true);
    });

    it("distinguishes the converter being down from the document being wrong", () => {
      // A 503 is the out-of-process worker (§5.13.10) not running — a problem
      // with the deployment, not with the fields. Telling the reader their
      // fields are invalid would send them to rename twenty boxes for nothing.
      vi.spyOn(forms, "addFields").mockReturnValue(throwError(() => ({ status: 503 })));
      withDrafts(draft({ name: "inspector" }));

      addButton()!.click();
      fixture.detectChanges();

      expect(panel.designMessage().toLowerCase()).toContain("converter");
    });

    it("falls back to a sentence of its own when nothing explained the failure", () => {
      vi.spyOn(forms, "addFields").mockReturnValue(throwError(() => ({ status: 500 })));
      withDrafts(draft({ name: "inspector" }));

      addButton()!.click();
      fixture.detectChanges();

      expect(panel.designMessage().trim()).not.toBe("");
      expect(panel.designFailed()).toBe(true);
    });

    it("lets the reader try again", () => {
      // The in-flight flag has to clear on failure, or the only route back is a
      // page reload — which loses the drafts the failure just preserved.
      vi.spyOn(forms, "addFields").mockReturnValue(throwError(() => ({ status: 500 })));
      withDrafts(draft({ name: "inspector" }));

      addButton()!.click();
      fixture.detectChanges();

      expect(panel.designing()).toBe(false);
      expect(addButton()!.disabled).toBe(false);
    });

    it("marks the message as a failure, not only by colouring it", () => {
      // The colour is the second cue; designFailed is what the template reads to
      // choose it, and the two have to agree (§1A.2).
      vi.spyOn(forms, "addFields").mockReturnValue(throwError(() => ({ status: 500 })));
      withDrafts(draft({ name: "inspector" }));

      addButton()!.click();
      fixture.detectChanges();

      expect(
        (fixture.nativeElement.querySelector("p.text-red-600") as HTMLElement | null)?.textContent,
      ).toContain(panel.designMessage());
    });

    it("clears a previous failure when a later attempt starts", () => {
      // An error left on screen beside a request that is now in flight reads as
      // the new attempt having failed before it finished.
      vi.spyOn(forms, "addFields").mockReturnValueOnce(throwError(() => ({ status: 500 })));
      withDrafts(draft({ name: "inspector" }));
      addButton()!.click();
      fixture.detectChanges();
      expect(panel.designMessage()).not.toBe("");

      vi.spyOn(forms, "addFields").mockReturnValue(
inFlight());
      panel.addDrafts();

      expect(panel.designMessage()).toBe("");
    });
  });
});
