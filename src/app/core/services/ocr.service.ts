import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ProcessingResult } from './document-version.service';

/** Options accepted by the server-side OCR pipeline. */
export interface OcrOptions {
  /** Tesseract language code, e.g. 'eng', 'deu', 'fra'. Defaults to 'eng'. */
  lang?: string;
  /** Rasterisation DPI. Server clamps to 150–600; below 150 wrecks accuracy. */
  dpi?: number;
  /** Leave pages that already have a text layer untouched. Defaults to true. */
  skipTextPages?: boolean;
}

/** Page counts for one OCR run, read from the committed version's details. */
export interface OcrCounts {
  ocrPages:     number;
  skippedPages: number;
}

/**
 * Runs the server-side OCR pipeline (DocumentProcessingController -> Python
 * converter -> Tesseract), turning a scanned/image PDF into a searchable one
 * by adding an invisible text layer. The visible page is unchanged.
 *
 * OCR is PDF-only. The searchable file is committed as a new version of the
 * document, so the text layer is there for every later operation — searching,
 * redacting, form-filling — rather than living in a separate download.
 */
@Injectable({ providedIn: 'root' })
export class OcrService {
  private http = inject(HttpClient);

  makeSearchable(documentId: number, options: OcrOptions = {}): Observable<ProcessingResult> {
    return this.http.post<ProcessingResult>(
      `/api/documents/${documentId}/ocr`,
      {
        lang:          options.lang          ?? 'eng',
        dpi:           options.dpi           ?? 300,
        skipTextPages: options.skipTextPages ?? true
      }
    );
  }

  /**
   * Page counts travel in the version's `details` rather than as response
   * headers, which is where they had to live while the body was the PDF
   * itself.
   */
  readCounts(result: ProcessingResult): OcrCounts {
    return {
      ocrPages:     Number(result.details?.['ocrPages']     ?? 0),
      skippedPages: Number(result.details?.['skippedPages'] ?? 0)
    };
  }
}
