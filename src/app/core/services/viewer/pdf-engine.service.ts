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

  // ── Open PDF from ArrayBuffer or URL ────────────────────────
  async openDocument(src: ArrayBuffer | string): Promise<any> {
    await this.ensureLoaded();
    const loadingTask = typeof src === 'string'
      ? pdfjsLib.getDocument({ url: src })
      : pdfjsLib.getDocument({ data: src });
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

  // ── Get text layer items for a page (for text selection) ────
  async getTextLayerItems(pdfDoc: any, pageNum: number, viewport: any): Promise<any[]> {
    const page    = await pdfDoc.getPage(pageNum);
    const content = await page.getTextContent();
    return content.items;
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
      win.document.write(`<div class="page"><img src="${imgUrl}"/>${svg}</div>`);
    }
    win.document.write('</body></html>');
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 800);
  }
}
