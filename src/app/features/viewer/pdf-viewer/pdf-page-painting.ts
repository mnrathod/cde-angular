/**
 * Keeping a page's canvas and text layer in step with the document.
 *
 * <p>Out of the component because painting is not laying out. The component
 * decides how much space a page takes and where it sits; this decides what
 * gets drawn into it and — just as importantly — when to give the memory
 * back. A long document holds hundreds of pages at roughly 1.9 MB of canvas
 * backing store each, so the release path is the part that has to be right,
 * and it had no test of its own while it sat inside a 400-line component.
 */
import { signal } from "@angular/core";

import { PdfEngineService } from "../../../../viewer-core/pdf-engine.service";

/** What a page is being asked to show. */
export interface PageRequest {
  pdfDoc: unknown;
  pageNumber: number;
  zoom: number;
  searchQuery: string;
  /** Whether the page is near enough the viewport to be worth painting. */
  active: boolean;
}

/** The elements a page paints into. Absent until the view exists. */
export interface PageElements {
  canvas?: HTMLCanvasElement;
  textLayer?: HTMLElement;
}

export class PdfPagePainting {
  /** The page's size at the current zoom, known even when it is not painted. */
  readonly width = signal(0);
  readonly height = signal(0);
  /** Whether the canvas currently holds a painted page. */
  readonly painted = signal(false);

  private viewport: unknown = null;

  /**
   * The elements arrive as a thunk rather than a value: a page is asked to
   * paint before its view exists, and a stale reference captured at
   * construction would be the wrong canvas or none at all.
   */
  constructor(
    private readonly engine: PdfEngineService,
    private readonly elements: () => PageElements,
  ) {}

  /**
   * Sizes the page and, when it is close enough to be worth it, paints it.
   *
   * <p>The size is set either way, so an unpainted page still occupies the
   * right scroll height and the annotation geometry over it stays valid.
   */
  async repaint(request: PageRequest): Promise<void> {
    const canvas = this.elements().canvas;
    if (!request.pdfDoc || !canvas) return;

    const size = await this.engine.getPageSize(
      request.pdfDoc,
      request.pageNumber,
      request.zoom,
    );
    this.width.set(size.width);
    this.height.set(size.height);
    this.viewport = size.viewport;

    if (!request.active) {
      this.release();
      return;
    }

    await this.engine.renderPage(
      request.pdfDoc,
      request.pageNumber,
      canvas,
      request.zoom,
    );
    this.painted.set(true);
    await this.markSearchMatches(request);
  }

  /**
   * Rebuilds the text layer and marks the search term in it.
   *
   * <p>Separate from repainting because a new search term does not need the
   * canvas drawn again — only the text over it looked at.
   */
  async markSearchMatches(request: PageRequest): Promise<void> {
    const textLayer = this.elements().textLayer;
    if (!textLayer || !request.pdfDoc || !this.viewport || !request.active) {
      return;
    }

    const elements = await this.engine.renderTextLayer(
      request.pdfDoc,
      request.pageNumber,
      textLayer,
      this.viewport,
    );
    this.engine.markMatches(elements, request.searchQuery);
  }

  /**
   * Gives the canvas backing store back.
   *
   * <p>Setting the dimensions to zero is what actually frees the memory;
   * merely clearing the 2D context keeps the full buffer allocated.
   */
  release(): void {
    const { canvas, textLayer } = this.elements();
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
    textLayer?.replaceChildren();
    this.painted.set(false);
  }
}
