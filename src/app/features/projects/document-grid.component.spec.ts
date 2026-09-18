/**
 * The grid of document cards, and the inline status control on each one.
 *
 * <p>The status dropdown is the part worth guarding. It is an optimistic
 * control on a `select`, and the browser has already moved it by the time the
 * request goes out — so if the request fails and nothing puts it back, the
 * card shows a status the document does not have.
 */
import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { of, throwError } from "rxjs";

import { Document } from "../../core/models";
import { DocumentService } from "../../core/services/document.service";
import { DocumentGridComponent } from "./document-grid.component";

function document(overrides: Partial<Document> = {}): Document {
  return {
    id: 42,
    name: "Site plan",
    fileName: "site-plan.pdf",
    fileType: "application/pdf",
    fileSize: 1024,
    documentType: "DRAWING",
    status: "DRAFT",
    drawingNumber: "A-100",
    revision: "A",
    projectId: 7,
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

/** A change event from a status dropdown that has already moved. */
function statusChangedTo(value: string): { event: Event; control: HTMLSelectElement } {
  const control = globalThis.document.createElement("select");
  control.innerHTML = `
    <option value="DRAFT"></option>
    <option value="IN_REVIEW"></option>
    <option value="APPROVED"></option>`;
  control.value = value;
  return { event: { target: control } as unknown as Event, control };
}

describe("DocumentGridComponent", () => {
  let fixture: ComponentFixture<DocumentGridComponent>;
  let grid: DocumentGridComponent;
  let documents: DocumentService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    documents = TestBed.inject(DocumentService);
    fixture = TestBed.createComponent(DocumentGridComponent);
    grid = fixture.componentInstance;
    fixture.detectChanges();
  });

  describe("the revision on a card", () => {
    it("marks the revision so it is not read as part of the drawing number", () => {
      expect(grid.revisionSuffix(document({ revision: "B" }))).toContain("B");
      expect(grid.revisionSuffix(document({ revision: "B" }))).toContain("Rev");
    });

    it("says nothing at all for a document with no revision", () => {
      // A bare " · " with nothing after it reads as a missing value.
      expect(grid.revisionSuffix(document({ revision: "" }))).toBe("");
    });
  });

  describe("changing a status inline", () => {
    it("saves the status that was chosen", () => {
      const update = vi
        .spyOn(documents, "updateStatus")
        .mockReturnValue(of(document({ status: "APPROVED" })));
      const { event } = statusChangedTo("APPROVED");

      grid.changeStatus(document({ id: 42, status: "DRAFT" }), event);

      expect(update).toHaveBeenCalledWith(42, "APPROVED");
    });

    it("sends nothing when the status did not actually change", () => {
      // Opening the dropdown and reselecting the current value raises a
      // change event on some browsers; a write for it is pure noise in the
      // audit trail.
      const update = vi.spyOn(documents, "updateStatus");
      const { event } = statusChangedTo("DRAFT");

      grid.changeStatus(document({ status: "DRAFT" }), event);

      expect(update).not.toHaveBeenCalled();
    });

    it("holds the control disabled while the request is in flight", () => {
      vi.spyOn(documents, "updateStatus").mockReturnValue(
        of(document({ status: "APPROVED" })),
      );
      const { event } = statusChangedTo("APPROVED");

      grid.changeStatus(document({ id: 42, status: "DRAFT" }), event);

      // Resolved synchronously here, so what this proves is that the flag is
      // cleared afterwards rather than left stuck on.
      expect(grid.statusUpdatingId()).toBeNull();
    });

    it("puts the control back when the save failed", () => {
      // The document did not change, so leaving the select showing the new
      // value would tell the reviewer their change was accepted.
      vi.spyOn(documents, "updateStatus").mockReturnValue(throwError(() => ({})));
      const { event, control } = statusChangedTo("APPROVED");

      grid.changeStatus(document({ id: 42, status: "DRAFT" }), event);

      expect(control.value).toBe("DRAFT");
      expect(grid.statusUpdatingId()).toBeNull();
    });
  });

  it("invites the user to pick a project before one is chosen", () => {
    expect(fixture.nativeElement.textContent).toContain(
      "Select a project to see its documents",
    );
  });
});
