/**
 * The viewer's outermost component: what it loads, what it tears down, and how
 * it searches.
 *
 * <p>Three behaviours here are not obvious from reading the template, and each
 * of them has already been a defect.
 *
 * <p>**Search had two kinds of document and only handled one.** `runSearch`
 * read `pdfDoc()` and returned the moment there wasn't one, so a converted CAD
 * drawing — which has plenty of text, in its title block alone — answered every
 * query with "No matches found" whether the words were on it or not. A silent
 * wrong answer, which is worse than a failure: the reader concludes the text is
 * not there.
 *
 * <p>**The collaboration socket is scoped to this component, not a singleton.**
 * Leaving the document has to tear the socket down, not leave it announcing a
 * presence that has gone. A missing `ngOnDestroy` is invisible until two people
 * are looking at a list of ghosts.
 *
 * <p>**A server-side rewrite commits a new version**, so redact, OCR, flatten
 * and form-fill all have to re-fetch — otherwise the viewer shows the old bytes
 * and, worse, the next operation runs against the copy already in memory and
 * discards the previous one's work. The effect that does this must not fire on
 * the first render, because `ngOnInit` does the first load and a second
 * concurrent fetch of the same document is a race.
 */
import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ActivatedRoute, Router } from "@angular/router";

import { DrawingSearchService } from "../../../viewer-core/drawing-search.service";
import { PdfEngineService } from "../../../viewer-core/pdf-engine.service";
import { ViewerStateService } from "../../../viewer-core/viewer-state.service";
import { RemoteDocumentChanges } from "./remote-document-changes";
import { ViewerDocumentLoader } from "./viewer-document-loader";
import { ViewerShellComponent } from "./viewer-shell.component";

/** What the sidebar sends instead of a page number when Search was pressed. */
const SEARCH_REQUESTED = -1;

describe("ViewerShellComponent", () => {
  let fixture: ComponentFixture<ViewerShellComponent>;
  let shell: ViewerShellComponent;
  let state: ViewerStateService;

  let loaded: number[];
  let annotationsLoaded: number[];
  let saved: number;
  let watched: number[];
  let stopped: number;
  let navigatedTo: unknown[][];
  let pdfSearches: Array<{ query: string }>;
  let pdfSearchResults: Array<{ pageIndex: number }>;
  let printedWithAnnotations: number;
  let windowPrints: number;

  const loaderStub = {
    load: (id: number) => loaded.push(id),
    loadAnnotations: (id: number) => annotationsLoaded.push(id),
    saveShapes: () => (saved += 1),
  };

  const remoteStub = {
    watch: (id: number) => watched.push(id),
    stop: () => (stopped += 1),
  };

  const pdfEngineStub = {
    searchDocument: async (_doc: unknown, query: string) => {
      pdfSearches.push({ query });
      return pdfSearchResults;
    },
    printWithAnnotations: async () => {
      printedWithAnnotations += 1;
    },
  };

  /** Builds the shell with `id` in the route. */
  function render(routeId: string | null): void {
    TestBed.resetTestingModule();
    loaded = [];
    annotationsLoaded = [];
    saved = 0;
    watched = [];
    stopped = 0;
    navigatedTo = [];
    pdfSearches = [];
    pdfSearchResults = [];
    printedWithAnnotations = 0;
    windowPrints = 0;

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => routeId } } },
        },
        {
          provide: Router,
          useValue: { navigate: (commands: unknown[]) => navigatedTo.push(commands) },
        },
      ],
    });
    // One `set` and no `add`: TestBed refuses both at once, and the template is
    // emptied anyway because the shell's children each pull in their own tree of
    // services. What is under test here is the shell's own wiring — what it
    // loads, what it tears down, how it searches — none of which is in the
    // markup.
    TestBed.overrideComponent(ViewerShellComponent, {
      set: {
        template: "",
        imports: [],
        providers: [
          ViewerStateService,
          { provide: ViewerDocumentLoader, useValue: loaderStub },
          { provide: RemoteDocumentChanges, useValue: remoteStub },
          { provide: PdfEngineService, useValue: pdfEngineStub },
          { provide: DrawingSearchService, useValue: new DrawingSearchService() },
        ],
      },
    });

    fixture = TestBed.createComponent(ViewerShellComponent);
    shell = fixture.componentInstance;
    state = fixture.debugElement.injector.get(ViewerStateService);
    vi.spyOn(window, "print").mockImplementation(() => {
      windowPrints += 1;
    });
    fixture.detectChanges();
  }

  afterEach(() => vi.restoreAllMocks());

  describe("opening a document", () => {
    beforeEach(() => render("42"));

    it("loads the document named in the route", () => {
      expect(loaded).toEqual([42]);
      expect(state.documentId()).toBe(42);
    });

    it("loads its markup too, not only the document", () => {
      // Opening a drawing and finding the annotations missing until something
      // else triggers a fetch is the defect this guards.
      expect(annotationsLoaded).toEqual([42]);
    });

    it("starts watching for other people's changes", () => {
      expect(watched).toEqual([42]);
    });

    it("does not navigate away", () => {
      expect(navigatedTo).toEqual([]);
    });
  });

  describe("a route with no document in it", () => {
    it("goes back to the start rather than loading document zero", () => {
      // Number(null) is 0, and a load of document 0 is a request that cannot
      // succeed followed by an error banner for a document the reader never
      // asked for.
      render(null);

      expect(navigatedTo).toEqual([["/"]]);
      expect(loaded).toEqual([]);
    });

    it("does not open a socket for a document it is not showing", () => {
      render(null);

      expect(watched).toEqual([]);
    });

    it("treats an unreadable id the same way", () => {
      render("not-a-number");

      expect(navigatedTo).toEqual([["/"]]);
      expect(loaded).toEqual([]);
    });
  });

  describe("leaving the document", () => {
    it("tears the socket down", () => {
      // The socket is provided by this component rather than as a singleton
      // precisely so that it can be torn down. Without this, everyone else on
      // the drawing keeps seeing a presence that has gone.
      render("42");

      fixture.destroy();

      expect(stopped).toBe(1);
    });
  });

  describe("after an operation rewrites the document", () => {
    it("re-fetches, so the viewer shows the result", () => {
      // Redact, OCR, flatten and form-fill all commit a new version
      // server-side. Without the re-fetch the reader sees the old bytes, and
      // the next operation runs against the stale copy and discards this one's
      // work.
      render("42");
      expect(loaded).toEqual([42]);

      state.reloadToken.set(1);
      fixture.detectChanges();

      expect(loaded).toEqual([42, 42]);
    });

    it("does not re-fetch before anything has been committed", () => {
      // The effect runs on the first render too. Loading again there would mean
      // two concurrent fetches of the same document on every open.
      render("42");

      fixture.detectChanges();

      expect(loaded).toEqual([42]);
    });

    it("re-fetches again on each subsequent commit", () => {
      render("42");

      state.reloadToken.set(1);
      fixture.detectChanges();
      state.reloadToken.set(2);
      fixture.detectChanges();

      expect(loaded).toHaveLength(3);
    });
  });

  describe("searching a PDF", () => {
    beforeEach(() => render("42"));

    it("asks the PDF engine and keeps what it found", () => {
      state.pdfDoc.set({ numPages: 3 });
      state.searchQuery.set("foundation");
      pdfSearchResults = [{ pageIndex: 2 }, { pageIndex: 5 }];

      shell.onPageSelected(SEARCH_REQUESTED);

      return Promise.resolve().then(() => {
        expect(pdfSearches).toEqual([{ query: "foundation" }]);
        expect(state.searchResults()).toHaveLength(2);
      });
    });

    it("moves to the first match, so the reader sees a result rather than a count", () => {
      state.pdfDoc.set({ numPages: 9 });
      state.totalPages.set(9);
      state.searchQuery.set("foundation");
      pdfSearchResults = [{ pageIndex: 6 }];

      shell.onPageSelected(SEARCH_REQUESTED);

      return Promise.resolve().then(() => {
        expect(state.currentPage()).toBe(6);
      });
    });

    it("a match past the last page does not navigate off the end", () => {
      // The page count and the search index come from different reads of the
      // document, so they can disagree while a reload is in flight. Navigating
      // to a page that does not exist leaves the canvas blank with no reason
      // given.
      state.pdfDoc.set({ numPages: 3 });
      state.totalPages.set(3);
      state.searchQuery.set("foundation");
      pdfSearchResults = [{ pageIndex: 99 }];

      shell.onPageSelected(SEARCH_REQUESTED);

      return Promise.resolve().then(() => {
        expect(state.currentPage()).toBe(3);
      });
    });

    it("stays put when a PDF search found nothing", () => {
      state.pdfDoc.set({ numPages: 9 });
      state.totalPages.set(9);
      state.currentPage.set(4);
      state.searchQuery.set("nothing here");
      pdfSearchResults = [];

      shell.onPageSelected(SEARCH_REQUESTED);

      return Promise.resolve().then(() => {
        expect(state.currentPage()).toBe(4);
        expect(state.searchResults()).toEqual([]);
      });
    });
  });

  describe("searching a converted drawing", () => {
    beforeEach(() => render("42"));

    it("searches its text instead of answering that there is none", () => {
      // The defect. There is no pdfDoc for a converted CAD drawing, and the
      // early return meant every query came back empty — including for words
      // plainly in the title block. A silent wrong answer: the reader concludes
      // the text is not there.
      state.pdfDoc.set(null);
      state.drawingText.set([
        { text: "FOUNDATION PLAN", x: 10, y: 20, width: 100, height: 10 },
        { text: "SCALE 1:50", x: 10, y: 40, width: 60, height: 10 },
      ] as never);
      state.searchQuery.set("foundation");

      shell.onPageSelected(SEARCH_REQUESTED);

      return Promise.resolve().then(() => {
        expect(state.searchResults()).toHaveLength(1);
        expect(pdfSearches).toEqual([]);
      });
    });

    it("focuses the first match on the drawing, since there are no pages to turn to", () => {
      state.pdfDoc.set(null);
      state.drawingText.set([
        { text: "FOUNDATION PLAN", x: 10, y: 20, width: 100, height: 10 },
      ] as never);
      state.searchQuery.set("foundation");

      shell.onPageSelected(SEARCH_REQUESTED);

      return Promise.resolve().then(() => {
        expect(state.searchFocus()).not.toBeNull();
      });
    });

    it("clears the focus when a drawing search found nothing", () => {
      state.pdfDoc.set(null);
      state.drawingText.set([{ text: "SCALE 1:50", x: 0, y: 0, width: 1, height: 1 }] as never);
      state.searchFocus.set({ text: "stale", x: 0, y: 0, width: 1, height: 1 } as never);
      state.searchQuery.set("foundation");

      shell.onPageSelected(SEARCH_REQUESTED);

      return Promise.resolve().then(() => {
        expect(state.searchFocus()).toBeNull();
      });
    });
  });

  describe("an empty search", () => {
    beforeEach(() => render("42"));

    it("clears the previous results rather than leaving them on screen", () => {
      // Deleting the query and leaving yesterday's highlights up is how a
      // reader comes to believe a word is on a page it is not on.
      state.searchResults.set([{ pageIndex: 1 }] as never);
      state.searchFocus.set({ text: "stale", x: 0, y: 0, width: 1, height: 1 } as never);
      state.searchQuery.set("");

      shell.onPageSelected(SEARCH_REQUESTED);

      return Promise.resolve().then(() => {
        expect(state.searchResults()).toEqual([]);
        expect(state.searchFocus()).toBeNull();
      });
    });

    it("a query of nothing but spaces counts as empty", () => {
      state.pdfDoc.set({ numPages: 1 });
      state.searchQuery.set("   ");

      shell.onPageSelected(SEARCH_REQUESTED);

      return Promise.resolve().then(() => {
        expect(pdfSearches).toEqual([]);
      });
    });
  });

  describe("choosing a page from the sidebar", () => {
    beforeEach(() => render("42"));

    it("scrolls to that page", () => {
      const page = globalThis.document.createElement("div");
      page.id = "pdf-page-3";
      const scrolled = vi.fn();
      page.scrollIntoView = scrolled;
      globalThis.document.body.append(page);

      shell.onPageSelected(3);

      expect(scrolled).toHaveBeenCalled();
      page.remove();
    });

    it("does not fail when the page is not on screen yet", () => {
      // Virtualised pages are not all in the DOM, and a sidebar click can
      // arrive before the page it names has rendered.
      expect(() => shell.onPageSelected(99)).not.toThrow();
    });

    it("does not treat the search signal as a page number", () => {
      // SEARCH_REQUESTED is -1, and scrolling to "pdf-page--1" would silently
      // do nothing instead of searching.
      state.searchQuery.set("");

      shell.onPageSelected(SEARCH_REQUESTED);

      return Promise.resolve().then(() => {
        expect(state.searchResults()).toEqual([]);
      });
    });
  });

  describe("printing", () => {
    beforeEach(() => render("42"));

    it("prints the markup along with the PDF", async () => {
      // Printing a drawing without the comments on it is a sheet that looks
      // approved and is not.
      state.pdfDoc.set({ numPages: 2 });

      await shell.printDocument();

      expect(printedWithAnnotations).toBe(1);
      expect(windowPrints).toBe(0);
    });

    it("falls back to the browser's own print for anything that is not a PDF", async () => {
      // A converted drawing or an image has no pdfDoc. Refusing to print would
      // be worse than printing without the markup layer.
      state.pdfDoc.set(null);

      await shell.printDocument();

      expect(windowPrints).toBe(1);
      expect(printedWithAnnotations).toBe(0);
    });
  });

  describe("going back", () => {
    it("returns to the start", () => {
      render("42");

      shell.goBack();

      expect(navigatedTo).toContainEqual(["/"]);
    });
  });
});
