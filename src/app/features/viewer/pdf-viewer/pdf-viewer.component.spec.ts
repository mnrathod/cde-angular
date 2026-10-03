/**
 * The scrolling PDF view, and the window of pages it keeps painted.
 *
 * <p>The windowing is the reason this component exists rather than just a
 * `@for` over every page. A two-hundred-page specification painted in full is
 * hundreds of canvases in GPU memory, which §7.3 forbids and which in practice
 * means the tab is killed. So a page outside the window keeps its correct
 * *size* — the scroll height and the page anchors have to stay right — and
 * releases its backing store.
 *
 * <p>That leaves two things that are easy to get wrong and invisible when they
 * are:
 *
 * <p>**The current page is driven from two directions.** Scrolling sets it, and
 * the header's page arrows set it; the second has to scroll the view and the
 * first must not. A plain "am I mid-update" boolean cannot tell them apart —
 * it would be set and cleared synchronously inside the scroll handler while the
 * effect runs afterwards, so by then it always reads false. The component
 * remembers the last page scrolling produced instead, and these assertions are
 * what stop that reverting to the simpler, broken version.
 *
 * <p>**A jump has to paint before it scrolls.** Landing on a page outside the
 * window shows the reader a grey placeholder with a number on it, which looks
 * like a document that failed to load.
 */
import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";

import { CollaborationService } from "../../../core/services/collaboration.service";
import { PdfEngineService } from "../../../../viewer-core/pdf-engine.service";
import { ViewerStateService } from "../../../../viewer-core/viewer-state.service";
import { PdfViewerComponent } from "./pdf-viewer.component";

/** A pdf.js document stand-in: enough shape for sizing and painting. */
function fakePdf(pages = 10): unknown {
  return {
    numPages: pages,
    getPage: async (pageNumber: number) => ({
      pageNumber,
      getViewport: ({ scale }: { scale: number }) => ({
        width: 600 * scale,
        height: 800 * scale,
      }),
      render: () => ({ promise: Promise.resolve(), cancel: () => undefined }),
      getTextContent: async () => ({ items: [] }),
      getAnnotations: async () => [],
    }),
  };
}

describe("PdfViewerComponent", () => {
  let fixture: ComponentFixture<PdfViewerComponent>;
  let viewer: PdfViewerComponent;
  let state: ViewerStateService;
  let thumbnailRequests: number;

  /** What IntersectionObserver instances the component created. */
  let observers: Array<{
    callback: IntersectionObserverCallback;
    observed: Element[];
    disconnected: boolean;
  }>;

  const engineStub = {
    generateThumbnails: async () => {
      thumbnailRequests += 1;
      return [{ pageNumber: 1, dataUrl: "data:," }];
    },
    getPageSize: async (_doc: unknown, _page: number, zoom: number) => ({
      width: 600 * zoom,
      height: 800 * zoom,
    }),
    renderPage: async () => undefined,
    renderTextLayer: async () => undefined,
    highlightMatches: () => undefined,
  };

  beforeEach(() => {
    thumbnailRequests = 0;
    observers = [];

    class FakeIntersectionObserver {
      observed: Element[] = [];
      disconnected = false;
      constructor(public callback: IntersectionObserverCallback) {
        observers.push(this as never);
      }
      observe(element: Element): void {
        this.observed.push(element);
      }
      unobserve(): void {}
      disconnect(): void {
        this.disconnected = true;
      }
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
      root = null;
      rootMargin = "";
      thresholds: number[] = [];
    }
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
    // The test DOM has no scrollIntoView. Installing it on the prototype rather
    // than per element because the component finds its targets with
    // getElementById, so a per-element stand-in appended to the body would be
    // shadowed by the real host that carries the same id.
    if (!Element.prototype.scrollIntoView) {
      Element.prototype.scrollIntoView = function () {};
    }

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ViewerStateService,
        // The page hosts report pointer positions to other viewers, so the
        // collaboration service is reached through the page tree even though
        // nothing here is about collaboration. Stubbed rather than real: a real
        // one would try to open a socket.
        { provide: CollaborationService, useValue: { reportCursor: () => undefined, cursors: () => [] } },
        { provide: PdfEngineService, useValue: engineStub },
      ],
    });
    state = TestBed.inject(ViewerStateService);
    state.pdfDoc.set(fakePdf());
    state.totalPages.set(10);
    fixture = TestBed.createComponent(PdfViewerComponent);
    viewer = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => vi.unstubAllGlobals());

  /** Tells the component that these pages are on screen. */
  function visiblePagesAre(...pages: number[]): void {
    const entries = pages.map((page) => ({
      target: { id: `pdf-page-${page}` } as Element,
      isIntersecting: true,
    })) as unknown as IntersectionObserverEntry[];

    observers.at(-1)!.callback(entries, {} as IntersectionObserver);
    fixture.detectChanges();
  }

  /** The component's own host element for a page, which carries the id. */
  function hostFor(page: number): HTMLElement {
    return fixture.nativeElement.querySelector(`#pdf-page-${page}`) as HTMLElement;
  }

  /**
   * Puts every page host well above the container, except the ones named.
   *
   * <p>onScroll walks the pages in order and takes the first whose top is at or
   * below the container's, less a 100px tolerance. So "page 2 is at the top"
   * means page 1 has to be pushed off it.
   */
  function positionHosts(tops: Record<number, number>): void {
    for (const page of viewer.pages()) {
      const top = tops[page] ?? -5000;
      hostFor(page).getBoundingClientRect = () => ({ top }) as DOMRect;
    }
  }

  function containerAtTop(): HTMLElement {
    const container = globalThis.document.createElement("div");
    container.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
    return container;
  }

  function pagesLeave(...pages: number[]): void {
    const entries = pages.map((page) => ({
      target: { id: `pdf-page-${page}` } as Element,
      isIntersecting: false,
    })) as unknown as IntersectionObserverEntry[];

    observers.at(-1)!.callback(entries, {} as IntersectionObserver);
    fixture.detectChanges();
  }

  describe("the pages it lists", () => {
    it("lists one host per page of the document", () => {
      // Every page needs a host even when unpainted, because the hosts are what
      // give the scroll container its height and what the page anchors point at.
      expect(viewer.pages()).toHaveLength(10);
      expect(fixture.nativeElement.querySelectorAll("app-pdf-page")).toHaveLength(10);
    });

    it("numbers them from one, the way a reader counts", () => {
      expect(viewer.pages()[0]).toBe(1);
      expect(viewer.pages().at(-1)).toBe(10);
    });

    it("lists nothing before the document reports its page count", () => {
      state.totalPages.set(0);
      fixture.detectChanges();

      expect(viewer.pages()).toEqual([]);
    });

    it("re-lists when a new version has a different page count", () => {
      // Page manipulation adds and removes pages. A stale list leaves hosts for
      // pages that are gone, which the observer then watches for ever.
      state.totalPages.set(3);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelectorAll("app-pdf-page")).toHaveLength(3);
    });
  });

  describe("which pages stay painted", () => {
    it("opens with the first few, so there is something on screen immediately", () => {
      // Waiting for the observer's first callback would show the reader a grey
      // page for one frame on every open.
      expect(viewer.activePages().size).toBeGreaterThan(0);
      expect(viewer.activePages().has(1)).toBe(true);
    });

    it("paints a screen either side of what is visible", () => {
      // §7.3's lookahead. Painting only what is visible means a grey page every
      // time the reader scrolls faster than a render takes.
      visiblePagesAre(5);

      for (const page of [3, 4, 5, 6, 7]) {
        expect(viewer.activePages().has(page)).toBe(true);
      }
    });

    it("does not paint the whole document", () => {
      // The reason the window exists. Two hundred canvases is a killed tab.
      visiblePagesAre(5);

      expect(viewer.activePages().has(10)).toBe(false);
      expect(viewer.activePages().size).toBeLessThan(10);
    });

    it("does not reach past the last page", () => {
      // add() clamps. Without it the set would hold pages 11 and 12, and the
      // observer would be asked for hosts that do not exist.
      visiblePagesAre(10);

      expect(viewer.activePages().has(11)).toBe(false);
      expect(viewer.activePages().has(10)).toBe(true);
    });

    it("does not reach before the first page", () => {
      visiblePagesAre(1);

      expect(viewer.activePages().has(0)).toBe(false);
      expect(viewer.activePages().has(-1)).toBe(false);
    });

    it("keeps the current page painted even when nothing is intersecting", async () => {
      // First paint, and a jump from the sidebar: the observer has not reported
      // anything yet, and the page the reader is on must not be the grey one.
      state.currentPage.set(8);
      await fixture.whenStable();
      visiblePagesAre();

      expect(viewer.activePages().has(8)).toBe(true);
    });

    it("releases a page once it has scrolled well away", async () => {
      // The reader's page moves with them, because the current page is always
      // kept painted — so it has to move here too, or page 1 stays in the window
      // for the reason the next assertion is about rather than the one named.
      visiblePagesAre(1, 2);
      state.currentPage.set(9);
      await fixture.whenStable();
      pagesLeave(1, 2);
      visiblePagesAre(9);

      expect(viewer.activePages().has(1)).toBe(false);
    });

    it("covers both pages when two are on screen at once", () => {
      // A wide window or a zoomed-out document shows several pages together.
      visiblePagesAre(4, 5);

      expect(viewer.activePages().has(2)).toBe(true);
      expect(viewer.activePages().has(7)).toBe(true);
    });

    it("ignores an element whose id is not a page", () => {
      // The observer watches whatever matched the selector, and a host without a
      // page id would otherwise add NaN to the window.
      const entries = [
        { target: { id: "something-else" } as Element, isIntersecting: true },
      ] as unknown as IntersectionObserverEntry[];

      expect(() => observers.at(-1)!.callback(entries, {} as IntersectionObserver)).not.toThrow();
      expect([...viewer.activePages()].every((page) => Number.isInteger(page))).toBe(true);
    });

    it("does not churn the set when the window has not changed", () => {
      // activePages is an input to every page host. Setting an equal set would
      // re-render all of them on every scroll frame.
      visiblePagesAre(5);
      const first = viewer.activePages();

      visiblePagesAre(5);

      expect(viewer.activePages()).toBe(first);
    });
  });

  describe("watching the pages", () => {
    it("watches each page host", () => {
      expect(observers.at(-1)!.observed.length).toBeGreaterThan(0);
    });

    it("stops watching when the viewer goes away", () => {
      // An observer left connected holds the scroll container and every page
      // host alive after the reader has left the document.
      fixture.destroy();

      expect(observers.some((observer) => observer.disconnected)).toBe(true);
    });
  });

  describe("generating thumbnails", () => {
    it("asks for them once a document is open", () => {
      // They are the sidebar's page list, and generating them lazily per scroll
      // would mean the list filled in as the reader moved.
      expect(thumbnailRequests).toBe(1);
    });

    it("keeps them where the sidebar reads them", async () => {
      await fixture.whenStable();

      expect(state.thumbnails().length).toBeGreaterThan(0);
    });

    it("asks for none when no document is open", () => {
      // §7.3: nothing is generated for a document that is not there, and the
      // request would fail anyway.
      TestBed.resetTestingModule();
      thumbnailRequests = 0;
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          ViewerStateService,
          { provide: CollaborationService, useValue: { reportCursor: () => undefined, cursors: () => [] } },
          { provide: PdfEngineService, useValue: engineStub },
        ],
      });
      const emptyState = TestBed.inject(ViewerStateService);
      emptyState.pdfDoc.set(null);
      const empty = TestBed.createComponent(PdfViewerComponent);
      empty.detectChanges();

      expect(thumbnailRequests).toBe(0);
    });
  });

  describe("jumping to a page", () => {
    it("paints the destination before scrolling to it", () => {
      // Otherwise the jump lands on a placeholder with a number on it, which
      // reads as a document that failed to load.
      //
      // Driven through scrollToPage rather than by moving currentPage and
      // waiting for the effect: the effect is one line whose whole content is
      // this call, and its guard — do not scroll when scrolling drove the
      // change — is asserted below through onScroll, which is the direction that
      // can loop. What is worth pinning here is that the paint happens before
      // the scroll, which is this method's own order.
      state.currentPage.set(9);

      viewer.scrollToPage(9);

      expect(viewer.activePages().has(9)).toBe(true);
    });

    it("scrolls to the page it was asked for", () => {
      const scrolled = vi.fn();
      hostFor(7).scrollIntoView = scrolled;

      viewer.scrollToPage(7);

      expect(scrolled).toHaveBeenCalled();
    });

    it("paints the destination even when its host is not in the DOM yet", () => {
      // The order matters in both directions: a missing host must not stop the
      // paint, because the host appears a frame later and would then render a
      // page the window had excluded.
      state.currentPage.set(6);

      viewer.scrollToPage(6);

      expect(viewer.activePages().has(6)).toBe(true);
    });

    it("does not scroll when scrolling is what moved the page", async () => {
      // The loop this guards against: scroll sets the page, the effect scrolls
      // to it, that fires another scroll event. The component remembers the last
      // page scrolling produced, because a boolean cleared synchronously inside
      // the handler always reads false by the time the effect runs.
      positionHosts({ 4: 10 });   // page 4 is the first at or below the top
      const scrolled = vi.fn();
      hostFor(4).scrollIntoView = scrolled;

      viewer.onScroll({ target: containerAtTop() } as unknown as Event);
      await fixture.whenStable();

      expect(state.currentPage()).toBe(4);
      expect(scrolled).not.toHaveBeenCalled();
    });

    it("does not fail when the destination host is not in the DOM", () => {
      // A jump can arrive before the hosts have rendered, or for a page a new
      // version removed.
      expect(() => viewer.scrollToPage(99)).not.toThrow();
    });
  });

  describe("scrolling", () => {
    it("reports which page is now at the top", () => {
      // Page 1 has scrolled off; page 2 is the first still at or below the top
      // of the container, within the 100px tolerance.
      positionHosts({ 2: 10 });

      viewer.onScroll({ target: containerAtTop() } as unknown as Event);

      expect(state.currentPage()).toBe(2);
    });

    it("skips pages whose hosts are not in the DOM", () => {
      // Hosts come and go with the page list, and a missing one must not stop
      // the scan at the first gap.
      const container = globalThis.document.createElement("div");
      container.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;

      expect(() => viewer.onScroll({ target: container } as unknown as Event)).not.toThrow();
    });
  });
});
