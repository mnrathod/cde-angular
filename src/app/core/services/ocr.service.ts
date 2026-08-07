import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpResponse } from '@angular/common/http';
import { Observable } from 'rxjs';

/** Options accepted by the server-side OCR pipeline. */
export interface OcrOptions {
  /** Tesseract language code, e.g. 'eng', 'deu', 'fra'. Defaults to 'eng'. */
  lang?: string;
  /** Rasterisation DPI. Server clamps to 150–600; below 150 wrecks accuracy. */
  dpi?: number;
  /** Leave pages that already have a text layer untouched. Defaults to true. */
  skipTextPages?: boolean;
}

/** Per-run page counts, read back from the response headers. */
export interface OcrResult {
  blob:         Blob;
  ocrPages:     number;
  skippedPages: number;
}

/**
 * Runs the server-side OCR pipeline (DocumentProcessingController -> Python
 * converter -> Tesseract), turning a scanned/image PDF into a searchable one
 * by adding an invisible text layer. The visible page is unchanged.
 *
 * OCR is PDF-only. The original document on the server is left untouched —
 * this produces a separate searchable copy for download, not an in-place edit.
 */
@Injectable({ providedIn: 'root' })
export class OcrService {
  private http = inject(HttpClient);

  makeSearchable(documentId: number, options: OcrOptions = {}): Observable<HttpResponse<Blob>> {
    return this.http.post(
      `/api/documents/${documentId}/ocr`,
      {
        lang:          options.lang          ?? 'eng',
        dpi:           options.dpi           ?? 300,
        skipTextPages: options.skipTextPages ?? true
      },
      { responseType: 'blob', observe: 'response' }
    );
  }

  /**
   * Page counts are returned as headers alongside the PDF body, since the
   * body itself is the binary file and can't also carry a JSON summary.
   */
  readCounts(response: HttpResponse<Blob>): Omit<OcrResult, 'blob'> {
    return {
      ocrPages:     Number(response.headers.get('X-OCR-Pages')   ?? 0),
      skippedPages: Number(response.headers.get('X-OCR-Skipped') ?? 0)
    };
  }
}
