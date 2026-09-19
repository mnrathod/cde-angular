/**
 * Painting a page, and giving the memory back.
 *
 * <p>The release path is the one that matters: a canvas is about 1.9 MB of
 * backing store and a long document has hundreds of them, so a page that
 * scrolls out of view and keeps its buffer is how the viewer runs a browser
 * out of memory. Setting the dimensions to zero is what frees it; clearing
 * the 2D context does not, and nothing here would notice the difference by
 * looking at the picture.
 */
import { PdfEngineService } from "../../../../viewer-core/pdf-engine.service";
import { PageRequest, PdfPagePainting } from "./pdf-page-painting";

/** An A4 page at 100%. */
const A4 = { width: 595, height: 842 };

interface EngineCalls {
  pagesSized: number[];
  pagesPainted: number[];
  textLayersBuilt: number[];
  marked: string[];
}

function fakeEngine(): { engine: PdfEngineService; calls: EngineCalls } {
  const calls: EngineCalls = {
    pagesSized: [],
    pagesPainted: [],
    textLayersBuilt: [],
    marked: [],
  };
  const engine = {
    async getPageSize(_doc: unknown, pageNumber: number, zoom: number) {
      calls.pagesSized.push(pageNumber);
      return {
        width: A4.width * zoom,
        height: A4.height * zoom,
        viewport: { scale: zoom },
      };
    },
    async renderPage(_doc: unknown, pageNumber: number) {
      calls.pagesPainted.push(pageNumber);
      return { width: A4.width, height: A4.height, viewport: {} };
    },
    async renderTextLayer(_doc: unknown, pageNumber: number) {
      calls.textLayersBuilt.push(pageNumber);
      return [] as HTMLElement[];
    },
    markMatches(_elements: readonly HTMLElement[], query: string) {
      calls.marked.push(query);
    },
  };
  return { engine: engine as unknown as PdfEngineService, calls };
}

function elements() {
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 1000;
  const textLayer = document.createElement("div");
  textLayer.appendChild(document.createElement("span"));
  return { canvas, textLayer };
}

function request(overrides: Partial<PageRequest> = {}): PageRequest {
  return {
    pdfDoc: { pages: 10 },
    pageNumber: 3,
    zoom: 1,
    searchQuery: "",
    active: true,
    ...overrides,
  };
}

describe("painting a PDF page", () => {
  it("sizes and paints a page that is on screen", async () => {
    const { engine, calls } = fakeEngine();
    const painting = new PdfPagePainting(engine, elements);

    await painting.repaint(request());

    expect(calls.pagesPainted).toEqual([3]);
    expect(painting.width()).toBe(A4.width);
    expect(painting.painted()).toBe(true);
  });

  it("sizes a page that is off screen without painting it", async () => {
    // The size still has to be right or the page's placeholder occupies the
    // wrong scroll height and every page anchor below it is off.
    const { engine, calls } = fakeEngine();
    const painting = new PdfPagePainting(engine, elements);

    await painting.repaint(request({ active: false }));

    expect(calls.pagesSized).toEqual([3]);
    expect(calls.pagesPainted).toEqual([]);
    expect(painting.height()).toBe(A4.height);
    expect(painting.painted()).toBe(false);
  });

  it("frees the canvas backing store when a page goes off screen", async () => {
    const { engine } = fakeEngine();
    const surface = elements();
    const painting = new PdfPagePainting(engine, () => surface);

    await painting.repaint(request());
    await painting.repaint(request({ active: false }));

    expect(surface.canvas.width).toBe(0);
    expect(surface.canvas.height).toBe(0);
  });

  it("empties the text layer it leaves behind", async () => {
    // Left in place, the spans of an unpainted page stay selectable and
    // findable over a blank placeholder.
    const { engine } = fakeEngine();
    const surface = elements();
    const painting = new PdfPagePainting(engine, () => surface);

    painting.release();

    expect(surface.textLayer.childElementCount).toBe(0);
  });

  it("does nothing at all before the view exists", async () => {
    const { engine, calls } = fakeEngine();
    const painting = new PdfPagePainting(engine, () => ({}));

    await painting.repaint(request());

    expect(calls.pagesSized).toEqual([]);
    expect(() => painting.release()).not.toThrow();
  });

  it("does nothing without a document", async () => {
    const { engine, calls } = fakeEngine();
    const painting = new PdfPagePainting(engine, elements);

    await painting.repaint(request({ pdfDoc: null }));

    expect(calls.pagesSized).toEqual([]);
  });

  it("marks the search term after painting", async () => {
    const { engine, calls } = fakeEngine();
    const painting = new PdfPagePainting(engine, elements);

    await painting.repaint(request({ searchQuery: "handrail" }));

    expect(calls.marked).toEqual(["handrail"]);
  });

  it("re-marks a new term without painting the canvas again", async () => {
    // Typing in the search box must not repaint every visible page.
    const { engine, calls } = fakeEngine();
    const painting = new PdfPagePainting(engine, elements);
    await painting.repaint(request());

    await painting.markSearchMatches(request({ searchQuery: "balustrade" }));

    expect(calls.pagesPainted).toEqual([3]);
    expect(calls.marked).toEqual(["", "balustrade"]);
  });

  it("will not mark a page it has never sized", async () => {
    // There is no viewport to build a text layer against until then, and
    // pdf.js positions every span from it.
    const { engine, calls } = fakeEngine();
    const painting = new PdfPagePainting(engine, elements);

    await painting.markSearchMatches(request({ searchQuery: "soffit" }));

    expect(calls.textLayersBuilt).toEqual([]);
  });

  it("tracks the zoom in the size it reports", async () => {
    const { engine } = fakeEngine();
    const painting = new PdfPagePainting(engine, elements);

    await painting.repaint(request({ zoom: 2 }));

    expect(painting.width()).toBe(A4.width * 2);
    expect(painting.height()).toBe(A4.height * 2);
  });
});
