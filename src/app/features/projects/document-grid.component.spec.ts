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
import { signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { of, throwError } from "rxjs";

import { Document } from "../../core/models";
import { AuthService } from "../../core/services/auth.service";
import { DocumentService } from "../../core/services/document.service";
import { ProjectService } from "../../core/services/project.service";
import { Permission, RoleService } from "../../core/services/role.service";
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

  describe("naming the status chooser", () => {
    it("names it by the document, not just by what it does", () => {
      // There is one of these per card. A shared name like "Change status"
      // announces as a grid of identical choosers with nothing to say which
      // document each belongs to (SC 2.4.6).
      const label = grid.statusLabelFor({ name: "Foundation plan" });

      expect(label).toContain("Foundation plan");
    });

    it("gives two documents two different names", () => {
      expect(grid.statusLabelFor({ name: "Level 01" })).not.toBe(
        grid.statusLabelFor({ name: "Level 02" }),
      );
    });

    it("puts those names on the rendered choosers, not just in the method", () => {
      // Asserting the method alone let a regression through: replacing the
      // template binding with a literal "Change status" passed every test
      // above while putting the defect straight back.
      //
      // The chooser only renders for someone who may change a status, so the
      // permission has to be granted or this asserts over an empty grid — and
      // an assertion over nothing passes whatever the template says.
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          RoleService,
          {
            provide: AuthService,
            useValue: {
              role: signal("ENGINEER"),
              permissions: signal(new Set([Permission.WriteDocument])),
              isLoggedIn: signal(true),
              username: signal("sam.okonkwo"),
            },
          },
        ],
      });
      documents = TestBed.inject(DocumentService);
      // The grid shows an empty state until a project is chosen, so without
      // this the assertions below run against no cards at all.
      TestBed.inject(ProjectService).selected.set({ id: 1, name: "Tower" } as never);
      fixture = TestBed.createComponent(DocumentGridComponent);
      grid = fixture.componentInstance;

      documents.documents.set([
        document({ id: 1, name: "Level 01" }),
        document({ id: 2, name: "Level 02" }),
      ]);
      fixture.detectChanges();

      const names = Array.from(
        fixture.nativeElement.querySelectorAll("select") as NodeListOf<HTMLElement>,
      ).map((element) => element.getAttribute("aria-label"));

      expect(names.length).toBeGreaterThan(0);
      expect(names.some((name) => name?.includes("Level 01"))).toBe(true);
      expect(new Set(names).size).toBe(names.length);
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
