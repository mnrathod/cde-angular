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
import { TestBed } from "@angular/core/testing";
import { Router, provideRouter } from "@angular/router";

import { Document, Project } from "../../core/models";
import { DocumentService } from "../../core/services/document.service";
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
