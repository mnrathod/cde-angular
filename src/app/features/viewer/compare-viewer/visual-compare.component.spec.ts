/**
 * Two revisions of a drawing, side by side, under a slider, or overlaid.
 *
 * <p>The behaviour worth pinning down is that the two documents need not be the
 * same length. A revision that adds a sheet is the ordinary case, not an edge
 * one, and the page is therefore clamped **per document** rather than refused —
 * so page 4 of a three-page original shows its page 3 beside page 4 of the
 * revision. Refusing would make the comparison unusable at exactly the point it
 * matters; clamping globally to the shorter document would hide the added sheet,
 * which is the change the reader opened this to see.
 *
 * <p>The redraw is deferred by a frame, and that is load-bearing rather than
 * incidental: the canvases belong to the mode, and the mode's canvases are
 * created by the same change detection the mode change is part of. Drawing
 * immediately paints the pair the *previous* mode used, which is about to be
 * discarded — so the reader switches mode and sees nothing.
 */
import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ActivatedRoute, Router } from "@angular/router";

import { Document } from "../../../core/models";
import { PdfEngineService } from "../../../../viewer-core/pdf-engine.service";
import { CompareDocumentsLoader, ComparedDocument } from "./compare-documents-loader";
import { VisualCompareComponent } from "./visual-compare.component";

function document(id: number, name: string): Document {
  return {
    id,
    name,
    fileName: `${name}.pdf`,
    fileType: "application/pdf",
    fileSize: 1024,
    documentType: "DRAWING",
    status: "APPROVED",
    revision: "P01",
    projectId: 7,
    createdAt: "2026-01-01T00:00:00Z",
  } as Document;
}

function compared(id: number, name: string, pages: number | null): ComparedDocument {
  return {
    document: document(id, name),
    pdfDoc: pages === null ? undefined : { numPages: pages },
  };
}

describe("VisualCompareComponent", () => {
  let fixture: ComponentFixture<VisualCompareComponent>;
  let compare: VisualCompareComponent;
  let loader: CompareDocumentsLoader;

  let queryParams: Record<string, string | null>;
  let navigatedTo: unknown[][];
  let renders: Array<{ numPages: number; page: number }>;
  let pairToLoad: [ComparedDocument, ComparedDocument] | null;

  const engineStub = {
    renderPage: async (pdfDoc: { numPages: number }, page: number) => {
      renders.push({ numPages: pdfDoc.numPages, page });
      return { width: 900, height: 1200 };
    },
    getPageSize: async () => ({ width: 900, height: 1200 }),
    renderTextLayer: async () => undefined,
    highlightMatches: () => undefined,
  };

  beforeEach(() => {
    queryParams = { doc1: "1", doc2: "2" };
    navigatedTo = [];
    renders = [];
    pairToLoad = [compared(1, "original", 3), compared(2, "revised", 4)];

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PdfEngineService, useValue: engineStub },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: { get: (key: string) => queryParams[key] ?? null } },
          },
        },
        {
          provide: Router,
          useValue: { navigate: (commands: unknown[]) => navigatedTo.push(commands) },
        },
      ],
    });
    fixture = TestBed.createComponent(VisualCompareComponent);
    compare = fixture.componentInstance;
    loader = fixture.debugElement.injector.get(CompareDocumentsLoader);
    vi.spyOn(loader, "load").mockImplementation(async () => {
      loader.loading.set(false);
      return pairToLoad as never;
    });
  });

  afterEach(() => vi.restoreAllMocks());

  /** Opens the comparison and lets the deferred redraw run. */
  async function open(): Promise<void> {
    fixture.detectChanges();
    await compare.ngOnInit();
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? "";
  }

  describe("opening a comparison", () => {
    it("loads both documents named in the URL", async () => {
      await open();

      expect(loader.load).toHaveBeenCalledWith(1, 2);
    });

    it("goes back when the URL names only one", async () => {
      // Comparing a document with nothing is not a comparison, and the loader
      // would ask the server for document NaN.
      queryParams = { doc1: "1", doc2: null };

      await compare.ngOnInit();

      expect(navigatedTo).toEqual([["/"]]);
      expect(loader.load).not.toHaveBeenCalled();
    });

    it("goes back when the URL names neither", async () => {
      queryParams = {};

      await compare.ngOnInit();

      expect(navigatedTo).toEqual([["/"]]);
    });

    it("draws nothing when the pair could not be loaded", async () => {
      // The loader has already set an error message the template shows. Carrying
      // on would render two blank canvases over it.
      pairToLoad = null;

      await open();

      expect(renders).toEqual([]);
    });
  });

  describe("how many pages there are to compare", () => {
    it("takes the longer of the two documents", async () => {
      // A revision that adds a sheet is the ordinary case. Taking the shorter
      // would hide the added page, which is the change the reader opened this to
      // see.
      await open();

      expect(compare.totalPages()).toBe(4);
    });

    it("takes the longer whichever way round it is", async () => {
      pairToLoad = [compared(1, "original", 6), compared(2, "revised", 2)];

      await open();

      expect(compare.totalPages()).toBe(6);
    });

    it("counts one page for a document that is not a PDF", async () => {
      // A converted drawing has no pdfDoc. Zero pages would make every page
      // navigation a no-op and leave the reader on a blank canvas.
      pairToLoad = [compared(1, "original", null), compared(2, "revised", null)];

      await open();

      expect(compare.totalPages()).toBe(1);
    });
  });

  describe("turning the page", () => {
    it("draws the page it was asked for, in both documents", async () => {
      await open();
      renders = [];

      compare.goToPage(2);
      fixture.detectChanges();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(renders.map((render) => render.page)).toEqual([2, 2]);
    });

    it("clamps per document, so a shorter original shows its last page", async () => {
      // The whole point: page 4 of a three-page original is its page 3, beside
      // page 4 of the revision. Clamping globally to 3 would hide the added
      // sheet; refusing would make the comparison unusable.
      await open();
      renders = [];

      compare.goToPage(4);
      fixture.detectChanges();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(renders).toEqual(
        expect.arrayContaining([
          { numPages: 3, page: 3 },
          { numPages: 4, page: 4 },
        ]),
      );
    });

    it("refuses to go past the longer document", async () => {
      await open();

      compare.goToPage(99);

      expect(compare.currentPage()).toBe(4);
    });

    it("refuses to go before the first page", async () => {
      await open();

      compare.goToPage(0);

      expect(compare.currentPage()).toBe(1);
    });

    it("refuses a negative page", async () => {
      await open();

      compare.goToPage(-5);

      expect(compare.currentPage()).toBe(1);
    });
  });

  describe("choosing how to compare", () => {
    it("starts side by side, which is the view that needs no explanation", async () => {
      await open();

      expect(compare.mode()).toBe("side-by-side");
      expect(text()).toContain("ORIGINAL");
      expect(text()).toContain("REVISED");
    });

    it("switches to the slider", async () => {
      await open();

      compare.chooseMode("slider");
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector("app-compare-slider")).not.toBeNull();
    });

    it("switches to the overlay", async () => {
      await open();

      compare.chooseMode("overlay");
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelectorAll("canvas")).toHaveLength(2);
      expect(fixture.nativeElement.querySelector("app-compare-slider")).toBeNull();
    });

    it("redraws into the canvases the new mode owns, not the old ones", async () => {
      // The redraw is deferred a frame because the new mode's canvases are
      // created by the change detection the mode change is part of. Drawing
      // immediately paints a canvas that is about to be discarded, so the reader
      // switches mode and sees nothing.
      await open();
      renders = [];

      compare.chooseMode("overlay");
      fixture.detectChanges();
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(renders).toHaveLength(2);
    });

    it("keeps the page when the mode changes", async () => {
      // Switching view to look at the same sheet a different way is the point;
      // resetting to page 1 would lose the reader's place every time.
      await open();
      compare.goToPage(3);

      compare.chooseMode("overlay");

      expect(compare.currentPage()).toBe(3);
    });
  });

  describe("the overlay's blend", () => {
    it("starts half way, so both drawings are visible", async () => {
      // At either extreme the overlay shows one drawing and the reader cannot
      // tell it is an overlay at all.
      await open();

      expect(compare.overlayOpacity()).toBe(50);
    });

    it("is applied to the upper canvas as a fraction", async () => {
      await open();
      compare.chooseMode("overlay");
      compare.overlayOpacity.set(80);
      fixture.detectChanges();

      const upper = fixture.nativeElement.querySelector(
        "canvas.absolute",
      ) as HTMLCanvasElement;

      expect(upper.style.opacity).toBe("0.8");
    });
  });

  describe("while it is loading", () => {
    /**
     * Holds the load open.
     *
     * <p>The default stub settles immediately, which is right for every other
     * test here and wrong for these two: the first `detectChanges()` runs
     * `ngOnInit`, so by the time anything could be asserted the load has already
     * finished and the loading state has been and gone.
     */
    beforeEach(() => {
      vi.mocked(loader.load).mockImplementation(
        () => new Promise(() => undefined) as never,
      );
      loader.loading.set(true);
      fixture.detectChanges();
    });

    it("says what it is doing rather than showing two blank panels", () => {
      expect(text()).toContain(loader.progress());
    });

    it("shows no canvases yet", () => {
      // Two empty canvases above a spinner reads as a comparison that loaded and
      // found nothing.
      expect(fixture.nativeElement.querySelectorAll("canvas")).toHaveLength(0);
    });
  });

  describe("when the pair could not be opened", () => {
    it("says why, and interrupts, because there is nothing else on the page", async () => {
      loader.loading.set(false);
      loader.errorMsg.set("One of these documents is not a PDF.");
      fixture.detectChanges();

      expect(text()).toContain("not a PDF");
      expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    });

    it("shows the failure instead of the comparison", async () => {
      loader.loading.set(false);
      loader.errorMsg.set("Could not open these documents.");
      fixture.detectChanges();

      expect(text()).not.toContain("ORIGINAL");
    });
  });

  describe("leaving", () => {
    it("goes back to the comparison picker, not to the document list", async () => {
      // The reader came from a screen where they chose two documents. Dropping
      // them at the root means choosing a project again to compare the next pair.
      await open();

      compare.goBack();

      expect(navigatedTo).toContainEqual(["/compare"]);
    });
  });
});
