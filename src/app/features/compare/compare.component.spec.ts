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

  describe("grouping the changes", () => {
    it("has nothing to group before a comparison has run", () => {
      expect(compare.groupedChanges()).toEqual([]);
    });

    it("puts changes of the same category together", () => {
      compare.result.set(
        comparison({
          changes: [change("GEOMETRY"), change("TEXT"), change("GEOMETRY")],
        }),
      );

      const groups = compare.groupedChanges();

      expect(groups.map((group) => group.category).sort()).toEqual([
        "GEOMETRY",
        "TEXT",
      ]);
      expect(groups.find((g) => g.category === "GEOMETRY")?.items).toHaveLength(2);
    });

    it("gives a change with no category somewhere to go", () => {
      // Dropping it would lose a real difference between two documents, which
      // is the one thing this screen exists to show.
      compare.result.set(comparison({ changes: [change("")] }));

      expect(compare.groupedChanges()).toHaveLength(1);
    });
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

    it("drops a summary written about the previous pair", () => {
      // It describes documents that are no longer on screen, and leaving it
      // there reads as a summary of the new comparison.
      vi.spyOn(service, "compare").mockReturnValue(of(comparison()));
      compare.doc1.set(document(1, "Rev A"));
      compare.doc2.set(document(2, "Rev B"));
      compare.aiText.set("An earlier summary");

      compare.runCompare();

      expect(compare.aiText()).toBe("");
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

  describe("the AI summary", () => {
    it("has nothing to summarise before a comparison has run", () => {
      const report = vi.spyOn(service, "getComparisonReport");

      compare.generateAI();

      expect(report).not.toHaveBeenCalled();
    });

    it("shows the summary the server produced", () => {
      vi.spyOn(service, "getComparisonReport").mockReturnValue(
        of({ report: "## Summary\nTwo walls moved." } as ComparisonReport),
      );
      compare.result.set(comparison());

      compare.generateAI();

      expect(compare.reportLines().length).toBeGreaterThan(0);
      expect(compare.aiLoading()).toBe(false);
    });

    it("says the comparison itself is unaffected when the summary fails", () => {
      // The changes are still on screen and still correct. A failure here
      // must not read as a failure of the comparison.
      vi.spyOn(service, "getComparisonReport").mockReturnValue(
        throwError(() => ({ status: 503 })),
      );
      compare.result.set(comparison());

      compare.generateAI();

      expect(compare.aiText()).toContain("comparison itself is unaffected");
      expect(compare.aiLoading()).toBe(false);
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

    it("says when the two documents match", () => {
      // Lowercase, which is what the converter sends (`'identical' if not
      // changes`). The banner compares against that exact value.
      compare.result.set(comparison({ overall: "identical", totalChanges: 0 }));

      expect(render()).toContain("Files are identical");
    });

    it("counts the changes it found", () => {
      compare.result.set(
        comparison({
          overall: "changed",
          totalChanges: 2,
          added: 1,
          removed: 1,
          changes: [change("GEOMETRY"), change("TEXT")],
        }),
      );

      const text = render();

      expect(text).toContain("Changes detected");
      expect(text).toContain("GEOMETRY");
      expect(text).toContain("TEXT");
    });

    it("passes on a warning the server attached to the result", () => {
      // A comparison can succeed and still be partial — a page that would not
      // render, say — and the reader has to know that before trusting it.
      compare.result.set(
        comparison({ warning: "Page 4 could not be rendered." }),
      );

      expect(render()).toContain("Page 4 could not be rendered.");
    });

    it("lists the documents that can be chosen once the picker is open", () => {
      TestBed.inject(DocumentService).documents.set([document(1, "Rev A")]);
      compare.pickFile(1);

      expect(render()).toContain("Rev A");
    });
  });

  describe("what the screen says about the pair", () => {
    it("names both documents and the type they share", () => {
      const subtitle = compare.comparisonSubtitle(comparison());

      expect(subtitle).toContain("Site plan Rev A");
      expect(subtitle).toContain("Site plan Rev B");
      expect(subtitle).toContain("PDF");
    });

    it("says which of the two slots the picker is filling", () => {
      compare.pickFile(2);

      expect(compare.pickerHeading()).toContain("2");
    });
  });
});
