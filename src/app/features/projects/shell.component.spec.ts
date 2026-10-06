/**
 * What the shell is left owning once the sidebar, the grid and the three
 * dialogs became components of their own: which dialog is open, and where
 * opening a document takes you.
 *
 * <p>The labels this file used to test moved to `project-vocabulary.spec.ts`
 * and the delete heading to the confirmation dialog, which is where the
 * behaviour now lives.
 */
import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { signal } from "@angular/core";
import { Router, provideRouter } from "@angular/router";
import { of } from "rxjs";

import { Document, Project } from "../../core/models";
import { DocumentService } from "../../core/services/document.service";
import { AuthService } from "../../core/services/auth.service";
import { ProjectService } from "../../core/services/project.service";
import { Permission, RoleService } from "../../core/services/role.service";
import { ShellComponent } from "./shell.component";

/** A project with only the fields the shell reads. */
function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 7,
    name: "Northern Depot",
    description: "",
    phase: "DESIGN",
    location: "",
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

/** A document with only the fields the shell reads. */
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

describe("ShellComponent", () => {
  let shell: ShellComponent;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    shell = TestBed.createComponent(ShellComponent).componentInstance;
    router = TestBed.inject(Router);
  });

  describe("choosing which dialog is open", () => {
    it("opens no dialog until something asks for one", () => {
      expect(shell.dialog().kind).toBe("none");
    });

    it("opens the project dialog with nothing to edit when creating", () => {
      shell.openProjectDialog(null);

      expect(shell.dialog()).toEqual({ kind: "project", editing: null });
    });

    it("opens the project dialog on the project being edited", () => {
      const existing = project({ name: "Southern Yard" });

      shell.openProjectDialog(existing);

      expect(shell.dialog()).toEqual({ kind: "project", editing: existing });
    });

    it("names the project in the delete confirmation", () => {
      // The name is what the dialog shows back. Carrying the id alone would
      // leave the user confirming a deletion they cannot identify.
      shell.confirmDeleteProject(project({ id: 3, name: "Northern Depot" }));

      expect(shell.dialog()).toEqual({
        kind: "delete",
        target: { kind: "project", id: 3, name: "Northern Depot" },
      });
    });

    it("names the document in the delete confirmation", () => {
      shell.confirmDeleteDocument(document({ id: 9, name: "Site plan" }));

      expect(shell.dialog()).toEqual({
        kind: "delete",
        target: { kind: "document", id: 9, name: "Site plan" },
      });
    });

    it("closes whatever was open", () => {
      shell.confirmDeleteProject(project());

      shell.closeDialog();

      expect(shell.dialog().kind).toBe("none");
    });

    it("replaces the open dialog rather than stacking a second one", () => {
      // Two modals at once would trap focus in the one underneath.
      shell.openProjectDialog(null);
      shell.confirmDeleteProject(project());

      expect(shell.dialog().kind).toBe("delete");
    });
  });

  describe("opening a document", () => {
    it("sends a model to the 3D viewer", () => {
      const model = document({ id: 11, documentType: "BIM_MODEL" });
      vi.spyOn(TestBed.inject(DocumentService), "is3D").mockReturnValue(true);
      const navigate = vi.spyOn(router, "navigate").mockResolvedValue(true);

      shell.openDocument(model);

      expect(navigate).toHaveBeenCalledWith(["/viewer3d", 11]);
    });

    it("sends a drawing to the flat viewer", () => {
      // The two viewers cannot render each other's documents, so picking the
      // wrong one shows an empty canvas rather than an error.
      const drawing = document({ id: 12, documentType: "DRAWING" });
      vi.spyOn(TestBed.inject(DocumentService), "is3D").mockReturnValue(false);
      const navigate = vi.spyOn(router, "navigate").mockResolvedValue(true);

      shell.openDocument(drawing);

      expect(navigate).toHaveBeenCalledWith(["/viewer", 12]);
    });
  });
});

/**
 * The shell as it is actually drawn.
 *
 * <p>The suite above builds the component without rendering it, which is right
 * for the dialog bookkeeping and leaves the layout — and the two permission
 * gates in it — untested. Those gates are §1.1: a control the account cannot use
 * is not rendered, and here hiding Upload also matters because it is the one
 * button whose dialog needs a selected project to exist at all.
 *
 * <p>The documents-for-the-selected-project effect is the other thing worth
 * asserting. It is the only thing that fills the grid, so a reader choosing a
 * project and seeing nothing is what its absence looks like.
 */
describe("the shell, rendered", () => {
  let fixture: ComponentFixture<ShellComponent>;
  let shell: ShellComponent;
  let projects: ProjectService;
  let documents: DocumentService;
  let loadedFor: number[];

  function renderFor(held: string[]): void {
    TestBed.resetTestingModule();
    loadedFor = [];
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        RoleService,
        {
          provide: AuthService,
          useValue: {
            role: signal("ENGINEER"),
            permissions: signal(new Set(held)),
            isLoggedIn: signal(true),
            username: signal("sam.okonkwo"),
          },
        },
      ],
    });
    projects = TestBed.inject(ProjectService);
    documents = TestBed.inject(DocumentService);
    vi.spyOn(projects, "load").mockReturnValue(of([]));
    vi.spyOn(documents, "loadByProject").mockImplementation((projectId: number) => {
      loadedFor.push(projectId);
      return of({ content: [], totalElements: 0 } as never);
    });
    fixture = TestBed.createComponent(ShellComponent);
    shell = fixture.componentInstance;
    fixture.detectChanges();
  }

  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? "";
  }

  function buttonSaying(label: string): HTMLButtonElement | undefined {
    return Array.from(
      fixture.nativeElement.querySelectorAll("button") as NodeListOf<HTMLButtonElement>,
    ).find((button) => button.textContent?.includes(label));
  }

  beforeEach(() => renderFor([Permission.WriteDocument]));

  afterEach(() => vi.restoreAllMocks());

  describe("before a project is chosen", () => {
    it("asks for one rather than showing a blank heading", () => {
      // §1.1: an empty state teaches. A bare heading reads as a project whose
      // name failed to load.
      expect(text()).toContain("Select a project");
    });

    it("offers neither Compare nor Upload, since both need a project", () => {
      // Upload in particular: its dialog reads the selected project's id, so
      // offering it with nothing selected is a control that cannot work.
      expect(buttonSaying("Compare")).toBeUndefined();
      expect(buttonSaying("Upload")).toBeUndefined();
    });

    it("loads the list of projects, which is the only thing there is to do", () => {
      expect(projects.load).toHaveBeenCalled();
    });

    it("asks for no documents", () => {
      expect(loadedFor).toEqual([]);
    });
  });

  describe("once a project is chosen", () => {
    beforeEach(() => {
      projects.selected.set(project({ id: 7, name: "Northern Depot" }));
      fixture.detectChanges();
    });

    it("names it", () => {
      expect(text()).toContain("Northern Depot");
      expect(text()).not.toContain("Select a project");
    });

    it("loads its documents, which is the only thing that fills the grid", () => {
      expect(loadedFor).toEqual([7]);
    });

    it("loads the next project's documents when the choice changes", () => {
      // Without this the grid keeps showing the previous project's documents
      // under the new project's name, which is the worst of both.
      projects.selected.set(project({ id: 9, name: "Quayside" }));
      fixture.detectChanges();

      expect(loadedFor).toEqual([7, 9]);
    });

    it("offers Compare", () => {
      expect(buttonSaying("Compare")).not.toBeUndefined();
    });

    it("goes to the comparison picker", () => {
      const navigate = vi.spyOn(TestBed.inject(Router), "navigate").mockResolvedValue(true);

      buttonSaying("Compare")!.click();

      expect(navigate).toHaveBeenCalledWith(["/compare"]);
    });

    it("offers Upload to an account that may write documents", () => {
      expect(buttonSaying("Upload")).not.toBeUndefined();
    });

    it("opens the upload dialog", () => {
      buttonSaying("Upload")!.click();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector("app-document-upload-dialog")).not.toBeNull();
    });
  });

  describe("an account that may not write documents", () => {
    beforeEach(() => {
      renderFor([Permission.ReadDocument]);
      projects.selected.set(project());
      fixture.detectChanges();
    });

    it("is not offered Upload", () => {
      // §1.1: hidden rather than disabled. A greyed-out Upload teaches a
      // read-only reader nothing except that somebody else can.
      expect(buttonSaying("Upload")).toBeUndefined();
    });

    it("is still offered Compare, which reads rather than writes", () => {
      // The read path is unaffected. Hiding both would turn a read-only
      // account's workspace into a list with nothing to do.
      expect(buttonSaying("Compare")).not.toBeUndefined();
    });
  });

  describe("which dialog is drawn", () => {
    it("none, until something asks for one", () => {
      expect(fixture.nativeElement.querySelector("app-project-dialog")).toBeNull();
      expect(fixture.nativeElement.querySelector("app-delete-confirmation")).toBeNull();
      expect(fixture.nativeElement.querySelector("app-document-upload-dialog")).toBeNull();
    });

    it("the project dialog", () => {
      shell.openProjectDialog(null);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector("app-project-dialog")).not.toBeNull();
    });

    it("the delete confirmation", () => {
      shell.confirmDeleteProject(project());
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector("app-delete-confirmation")).not.toBeNull();
    });

    it("only one at a time", () => {
      // Two modals at once is two focus traps fighting, and the reader can
      // escape neither.
      shell.openProjectDialog(null);
      fixture.detectChanges();
      shell.confirmDeleteProject(project());
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector("app-project-dialog")).toBeNull();
      expect(fixture.nativeElement.querySelector("app-delete-confirmation")).not.toBeNull();
    });

    it("and it goes away when closed", () => {
      shell.openProjectDialog(null);
      fixture.detectChanges();

      shell.closeDialog();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector("app-project-dialog")).toBeNull();
    });
  });
});
