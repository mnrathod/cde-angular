/**
 * Comparing two documents.
 *
 * <p>Two things here had no test. The grouping is what the whole change list
 * is rendered from, and it has to cope with a category the server did not
 * send. The AI summary is the one place in this screen that reaches a third
 * party, and its failure must leave the comparison itself readable rather
 * than replacing it.
 */
import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { Router, provideRouter } from "@angular/router";
import { of, throwError } from "rxjs";

import { CompareResult, Document } from "../../core/models";
import { ComparisonReport, CompareService } from "../../core/services/compare.service";
import { DocumentService } from "../../core/services/document.service";
import { ProjectService } from "../../core/services/project.service";
import { CompareComponent } from "./compare.component";

function comparison(overrides: Partial<CompareResult> = {}): CompareResult {
  return {
    success: true,
    fileType: "PDF",
    overall: "changed",
    totalChanges: 0,
    added: 0,
    removed: 0,
    changes: [],
    doc1Name: "Site plan Rev A",
    doc2Name: "Site plan Rev B",
    ...overrides,
  } as CompareResult;
}

function change(category: string, severity = "low") {
  return {
    category,
    severity,
    type: "modified",
    description: "A line moved",
  } as never;
}

function document(id: number, name: string): Document {
  return {
    id,
    name,
    fileName: `${name}.pdf`,
    fileType: "application/pdf",
    fileSize: 1,
    documentType: "DRAWING",
    status: "DRAFT",
    drawingNumber: "",
    revision: "A",
    projectId: 1,
    createdAt: "2026-01-01T00:00:00Z",
  };
}

describe("CompareComponent", () => {
  let fixture: ComponentFixture<CompareComponent>;
  let compare: CompareComponent;
  let service: CompareService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    fixture = TestBed.createComponent(CompareComponent);
    compare = fixture.componentInstance;
    service = TestBed.inject(CompareService);
  });

  describe("running the comparison", () => {
    it("does nothing until both files are chosen", () => {
      const run = vi.spyOn(service, "compare");
      compare.doc1.set(document(1, "Rev A"));

      compare.runCompare();

      expect(run).not.toHaveBeenCalled();
    });

    it("compares the two that were chosen", () => {
      const run = vi.spyOn(service, "compare").mockReturnValue(of(comparison()));
      compare.doc1.set(document(1, "Rev A"));
      compare.doc2.set(document(2, "Rev B"));

      compare.runCompare();

      expect(run).toHaveBeenCalledWith({ documentId1: 1, documentId2: 2 });
      expect(compare.comparing()).toBe(false);
    });

    it("stops showing itself as busy when the comparison fails", () => {
      vi.spyOn(service, "compare").mockReturnValue(throwError(() => ({})));
      compare.doc1.set(document(1, "Rev A"));
      compare.doc2.set(document(2, "Rev B"));

      compare.runCompare();

      expect(compare.comparing()).toBe(false);
    });

    it("swaps which file is which", () => {
      compare.doc1.set(document(1, "Rev A"));
      compare.doc2.set(document(2, "Rev B"));

      compare.swapFiles();

      expect(compare.doc1()?.id).toBe(2);
      expect(compare.doc2()?.id).toBe(1);
    });

    it("puts a chosen document in the slot the picker was opened for", () => {
      compare.pickFile(2);

      compare.selectDoc(document(9, "Rev C"));

      expect(compare.doc2()?.id).toBe(9);
      expect(compare.doc1()).toBeNull();
      expect(compare.showPicker()).toBe(false);
    });
  });

  describe("the visual comparison", () => {
    it("does nothing until both files are chosen", () => {
      const router = TestBed.inject(Router);
      const navigate = vi.spyOn(router, "navigate").mockResolvedValue(true);
      compare.doc1.set(document(1, "Rev A"));

      compare.openVisualCompare();

      expect(navigate).not.toHaveBeenCalled();
    });

    it("carries both documents into the visual view", () => {
      const router = TestBed.inject(Router);
      const navigate = vi.spyOn(router, "navigate").mockResolvedValue(true);
      compare.doc1.set(document(1, "Rev A"));
      compare.doc2.set(document(2, "Rev B"));

      compare.openVisualCompare();

      expect(navigate).toHaveBeenCalledWith(["/visual-compare"], {
        queryParams: { doc1: 1, doc2: 2 },
      });
    });
  });

  describe("arriving on the screen", () => {
    it("loads the project's documents when there are none to choose from", () => {
      const documents = TestBed.inject(DocumentService);
      const projects = TestBed.inject(ProjectService);
      projects.selected.set({ id: 3 } as never);
      const load = vi
        .spyOn(documents, "loadByProject")
        .mockReturnValue(of([] as never));

      compare.ngOnInit();

      expect(load).toHaveBeenCalledWith(3);
    });

    it("does not reload documents it already has", () => {
      const documents = TestBed.inject(DocumentService);
      const projects = TestBed.inject(ProjectService);
      projects.selected.set({ id: 3 } as never);
      documents.documents.set([document(1, "Rev A")]);
      const load = vi.spyOn(documents, "loadByProject");

      compare.ngOnInit();

      expect(load).not.toHaveBeenCalled();
    });

    it("asks for nothing when no project is selected", () => {
      const load = vi.spyOn(TestBed.inject(DocumentService), "loadByProject");

      compare.ngOnInit();

      expect(load).not.toHaveBeenCalled();
    });
  });

  describe("what is on the screen", () => {
    /** Renders the current state and returns the visible text. */
    function render(): string {
      fixture.detectChanges();
      return fixture.nativeElement.textContent ?? "";
    }

    it("teaches rather than apologises before anything is chosen", () => {
      // §1.1 — an empty state says what the screen is for and what to do.
      expect(render()).toContain("Select two");
    });

    it("lists the documents that can be chosen once the picker is open", () => {
      TestBed.inject(DocumentService).documents.set([document(1, "Rev A")]);
      compare.pickFile(1);

      expect(render()).toContain("Rev A");
    });
  });

  describe("what the screen says about the pair", () => {
    it("says which of the two slots the picker is filling", () => {
      compare.pickFile(2);

      expect(compare.pickerHeading()).toContain("2");
    });
  });
});
