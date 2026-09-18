/**
 * The confirmation before something is deleted for good.
 *
 * <p>The failure that matters is closing on an error: the dialog disappears,
 * nothing was deleted, and the user believes it was.
 */
import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { of, throwError } from "rxjs";

import { DocumentService } from "../../core/services/document.service";
import { ProjectService } from "../../core/services/project.service";
import {
  DeleteConfirmationComponent,
  DeletionTarget,
} from "./delete-confirmation.component";

describe("DeleteConfirmationComponent", () => {
  let fixture: ComponentFixture<DeleteConfirmationComponent>;
  let confirmation: DeleteConfirmationComponent;
  let projects: ProjectService;
  let documents: DocumentService;

  function render(target: DeletionTarget): void {
    fixture = TestBed.createComponent(DeleteConfirmationComponent);
    fixture.componentRef.setInput("target", target);
    confirmation = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    projects = TestBed.inject(ProjectService);
    documents = TestBed.inject(DocumentService);
  });

  it("asks about a project and a document in different words", () => {
    // Two whole messages rather than "Delete {kind}?" with an English noun
    // dropped into the gap — gender and article agreement do not survive
    // that, and the translator never sees the word that lands there.
    render({ kind: "project", id: 1, name: "Northern Depot" });
    const aboutProject = confirmation.heading();

    render({ kind: "document", id: 2, name: "Site plan" });

    expect(confirmation.heading()).not.toBe(aboutProject);
  });

  it("names what is about to go", () => {
    render({ kind: "document", id: 2, name: "Site plan" });

    expect(fixture.nativeElement.textContent).toContain("Site plan");
  });

  it("warns that a project takes its documents with it", () => {
    // The consequence a user is least likely to expect, and the only one
    // they cannot undo.
    render({ kind: "project", id: 1, name: "Northern Depot" });

    expect(fixture.nativeElement.textContent).toContain(
      "Documents belonging to this project are deleted with it",
    );
  });

  it("does not give that warning for a single document", () => {
    render({ kind: "document", id: 2, name: "Site plan" });

    expect(fixture.nativeElement.textContent).not.toContain(
      "deleted with it",
    );
  });

  it("deletes the project through the project service", () => {
    const remove = vi.spyOn(projects, "remove").mockReturnValue(of(undefined));
    render({ kind: "project", id: 3, name: "Northern Depot" });

    confirmation.confirm();

    expect(remove).toHaveBeenCalledWith(3);
  });

  it("deletes the document through the document service", () => {
    const remove = vi.spyOn(documents, "delete").mockReturnValue(of(undefined));
    render({ kind: "document", id: 4, name: "Site plan" });

    confirmation.confirm();

    expect(remove).toHaveBeenCalledWith(4);
  });

  it("closes once the deletion went through", () => {
    vi.spyOn(documents, "delete").mockReturnValue(of(undefined));
    render({ kind: "document", id: 4, name: "Site plan" });
    const closed = vi.fn();
    confirmation.closed.subscribe(closed);

    confirmation.confirm();

    expect(closed).toHaveBeenCalled();
  });

  it("stays open and explains itself when the deletion failed", () => {
    // Closing here is the dangerous outcome: nothing was deleted and the
    // user has every reason to think it was.
    vi.spyOn(documents, "delete").mockReturnValue(throwError(() => ({})));
    render({ kind: "document", id: 4, name: "Site plan" });
    const closed = vi.fn();
    confirmation.closed.subscribe(closed);

    confirmation.confirm();

    expect(closed).not.toHaveBeenCalled();
    expect(confirmation.error()).toContain("Could not delete the document");
    expect(confirmation.deleting()).toBe(false);
  });

  it("says which kind of thing failed to delete", () => {
    vi.spyOn(projects, "remove").mockReturnValue(throwError(() => ({})));
    render({ kind: "project", id: 3, name: "Northern Depot" });

    confirmation.confirm();

    expect(confirmation.error()).toContain("Could not delete the project");
  });
});
