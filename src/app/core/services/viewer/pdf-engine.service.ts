import { Injectable } from '@angular/core';
import * as pdfjsLib from 'pdfjs-dist';

const THUMBNAIL_DPI = 0.3;   // zoom factor for thumbnail generation

@Injectable({ providedIn: 'root' })
export class PdfEngineService {

  private workerConfigured = false;

  // ── Configure the pdf.js worker from the bundled package (no external
  //    CDN dependency — pdfjs-dist ships in node_modules/dist already) ───
  async ensureLoaded(): Promise<void> {
    if (this.workerConfigured) return;
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString();
    this.workerConfigured = true;
  }

  /**
   * Where pdf.js fetches the data files it does not bundle into its worker.
   *
   * These are not optional extras. pdf.js decodes JPEG 2000 and JBIG2 images
   * in WebAssembly, and both are loaded from `wasmUrl` at the moment an image
   * needing them is met. With the parameter unset it concatenates `undefined`
   * into the path and gives up — as a console *warning*, so the page loads
   * looking fine and the image is simply absent. JBIG2 in particular is what
   * most scanners emit for black and white, which is most of the scanned
   * drawings a CDE is asked to hold.
   *
   * cMaps decode CJK text and standard_fonts substitute for the fourteen
   * fonts a PDF is allowed to omit; both fail the same quiet way. The ICC
   * profile converts DeviceCMYK, which is what a drawing exported for print
   * is coloured in — without it pdf.js falls back to an arithmetic
   * approximation and every CMYK colour on the sheet comes out wrong rather
   * than missing, which is harder to notice and worse to review against.
   *
   * Resolved against `document.baseURI` so the paths survive being served
   * from a sub-path, which is how this application is deployed behind an
   * ingress.
   */
  private assetUrl(folder: string): string {
    return new URL(`assets/pdfjs/${folder}/`, document.baseURI).toString();
  }

  // ── Open PDF from ArrayBuffer or URL ────────────────────────
  async openDocument(src: ArrayBuffer | string): Promise<any> {
    await this.ensureLoaded();

    const assets = {
      wasmUrl:             this.assetUrl('wasm'),
      cMapUrl:             this.assetUrl('cmaps'),
      cMapPacked:          true,
      standardFontDataUrl: this.assetUrl('standard_fonts'),
      iccUrl:              this.assetUrl('iccs'),
    };

    const loadingTask = typeof src === 'string'
      ? pdfjsLib.getDocument({ url: src, ...assets })
      : pdfjsLib.getDocument({ data: src, ...assets });
    return loadingTask.promise;
  }

  // ── Render a page to a canvas element ───────────────────────
  async renderPage(
    pdfDoc:     any,
    pageNum:    number,
    canvas:     HTMLCanvasElement,
    zoom:       number = 1.0
  ): Promise<{ width: number; height: number; viewport: any }> {
    const page     = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: zoom });
    canvas.width   = viewport.width;
    canvas.height  = viewport.height;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    return { width: viewport.width, height: viewport.height, viewport };
  }

  // ── Generate thumbnails for all pages ───────────────────────
  async generateThumbnails(pdfDoc: any): Promise<Array<{ pageNumber: number; dataUrl: string }>> {
    const total = pdfDoc.numPages;
    const thumbs: Array<{ pageNumber: number; dataUrl: string }> = [];
    const canvas = document.createElement('canvas');
    for (let i = 1; i <= total; i++) {
      await this.renderPage(pdfDoc, i, canvas, THUMBNAIL_DPI);
      thumbs.push({ pageNumber: i, dataUrl: canvas.toDataURL('image/jpeg', 0.7) });
    }
    return thumbs;
  }

  // ── Extract text from a page for search ─────────────────────
  async getPageText(pdfDoc: any, pageNum: number): Promise<string> {
    const page    = await pdfDoc.getPage(pageNum);
    const content = await page.getTextContent();
    return content.items.map((item: any) => item.str).join(' ');
  }

  // ── Search all pages ─────────────────────────────────────────
  async searchDocument(
    pdfDoc: any,
    query:  string
  ): Promise<Array<{ pageIndex: number; matchIndex: number; text: string }>> {
    if (!query.trim()) return [];
    const results: Array<{ pageIndex: number; matchIndex: number; text: string }> = [];
    const q = query.toLowerCase();
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const text = await this.getPageText(pdfDoc, i);
      let idx = 0;
      let pos = text.toLowerCase().indexOf(q, idx);
      while (pos !== -1) {
        results.push({
          pageIndex:  i,
          matchIndex: pos,
          text:       text.slice(Math.max(0, pos - 20), pos + query.length + 20)
        });
        idx = pos + 1;
        pos = text.toLowerCase().indexOf(q, idx);
      }
    }
    return results;
  }

  // ── Page dimensions without painting ─────────────────────────
  // Lets the viewer size a page placeholder before (or without) rendering
  // it, which is what makes windowed rendering possible: off-screen pages
  // still occupy correct scroll height without costing a canvas.
  async getPageSize(pdfDoc: any, pageNum: number, zoom = 1.0):
    Promise<{ width: number; height: number; viewport: any }> {
    const page     = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: zoom });
    return { width: viewport.width, height: viewport.height, viewport };
  }

  // ── Render the selectable text layer for a page ──────────────
  // Delegates to pdf.js's own TextLayer rather than positioning spans by
  // hand: item.transform is in PDF user space (origin bottom-left,
  // unscaled), so it has to be composed with the viewport transform and
  // corrected for font ascent before it means anything in CSS pixels.
  // TextLayer already does all of that, including rotation and per-glyph
  // horizontal scaling.
  async renderTextLayer(
    pdfDoc:    any,
    pageNum:   number,
    container: HTMLElement,
    viewport:  any
  ): Promise<HTMLElement[]> {
    const page = await pdfDoc.getPage(pageNum);
    container.replaceChildren();
    const textLayer = new (pdfjsLib as any).TextLayer({
      textContentSource: page.streamTextContent(),
      container,
      viewport
    });
    await textLayer.render();
    return textLayer.textDivs ?? [];
  }

  // ── Convert PDF page to image for print ─────────────────────
  async pageToDataUrl(pdfDoc: any, pageNum: number, zoom = 1.5): Promise<string> {
    const canvas = document.createElement('canvas');
    await this.renderPage(pdfDoc, pageNum, canvas, zoom);
    return canvas.toDataURL('image/png');
  }

  // ── Print all pages with annotations rendered in ─────────────
  async printWithAnnotations(
    pdfDoc:    any,
    getSvgForPage: (page: number) => string
  ): Promise<void> {
    const total = pdfDoc.numPages;
    const win   = window.open('', '_blank')!;
    win.document.write('<html><head><title>Print</title><style>');
    win.document.write('body{margin:0} .page{page-break-after:always;position:relative} img{display:block;width:100%} svg{position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none}');
    win.document.write('</style></head><body>');

    for (let p = 1; p <= total; p++) {
      const imgUrl = await this.pageToDataUrl(pdfDoc, p, 2);
      const svg    = getSvgForPage(p);
      // Alt text on a print view still matters: the window is real HTML that
      // a screen reader can be pointed at before the print dialog opens.
      win.document.write(
        `<div class="page"><img src="${imgUrl}" alt="Page ${p} of ${total}"/>${svg}</div>`);
    }
    win.document.write('</body></html>');
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 800);
  }
}
