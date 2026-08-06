import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ShapeData } from './viewer-state.service';

export interface FlattenRequest {
  documentId: number;
  shapes:     ShapeData[];
  quality:    'screen' | 'print';
}

@Injectable({ providedIn: 'root' })
export class FlattenService {
  private http = inject(HttpClient);

  /**
   * Flatten annotations into a PDF and return as downloadable blob.
   * Calls Spring Boot which forwards to Python converter.
   */
  flattenToPdf(req: FlattenRequest): Observable<Blob> {
    return this.http.post(`/api/viewer/${req.documentId}/flatten`, req, {
      responseType: 'blob'
    });
  }

  /**
   * Client-side flatten: render PDF pages with SVG annotation overlay
   * using canvas compositing — no server call needed.
   */
  async flattenClientSide(
    pdfEngine: any,
    pdfDoc:    any,
    shapes:    ShapeData[],
    markupEngine: any,
    filename:  string
  ): Promise<void> {
    const { jsPDF } = await this.loadJsPDF();
    const total     = pdfDoc.numPages;
    const SCALE     = 2;

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

    for (let p = 1; p <= total; p++) {
      if (p > 1) pdf.addPage();

      // Render PDF page to canvas
      const canvas  = document.createElement('canvas');
      const result  = await pdfEngine.renderPage(pdfDoc, p, canvas, SCALE);

      // Draw annotation SVG onto the same canvas
      const pageShapes = shapes.filter(s => s.pageNumber === p);
      if (pageShapes.length > 0) {
        const svgStr  = markupEngine.shapesToSvgContent(pageShapes, result.width, result.height);
        await this.drawSvgOnCanvas(canvas, svgStr, result.width, result.height);
      }

      // Add canvas to PDF
      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, pdfH);
    }

    pdf.save(filename.replace(/\.pdf$/i, '') + '_annotated.pdf');
  }

  private drawSvgOnCanvas(
    canvas: HTMLCanvasElement,
    svgStr: string,
    width:  number,
    height: number
  ): Promise<void> {
    return new Promise(resolve => {
      const ctx = canvas.getContext('2d')!;
      const img = new Image();
      const blob = new Blob([svgStr], { type: 'image/svg+xml' });
      const url  = URL.createObjectURL(blob);
      img.onload = () => {
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        resolve();
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(); };
      img.src = url;
    });
  }

  private async loadJsPDF(): Promise<{ jsPDF: any }> {
    if ((window as any).jspdf) return (window as any).jspdf;
    await new Promise<void>((res, rej) => {
      const s   = document.createElement('script');
      s.src     = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s.onload  = () => res();
      s.onerror = rej;
      document.head.appendChild(s);
    });
    return (window as any).jspdf;
  }
}
