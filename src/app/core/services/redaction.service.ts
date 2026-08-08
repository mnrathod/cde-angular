import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { RedactionRegion } from './viewer/viewer-state.service';
import { ProcessingResult } from './document-version.service';

/**
 * Calls the server-side redaction pipeline (DocumentProcessingController ->
 * Python converter). Redaction is PDF-only: the backend rasterizes each
 * affected page and burns opaque black boxes over the given regions,
 * permanently destroying the underlying content.
 *
 * The result is committed as a new version of the document rather than
 * returned as a download, so redaction can be combined with OCR, flattening
 * and form-filling instead of each producing its own detached copy.
 */
@Injectable({ providedIn: 'root' })
export class RedactionService {
  private http = inject(HttpClient);

  redact(documentId: number, regions: RedactionRegion[]): Observable<ProcessingResult> {
    const payload = regions.map(r => ({
      page: r.page, x: r.x, y: r.y, width: r.width, height: r.height, reason: r.reason
    }));
    return this.http.post<ProcessingResult>(
      `/api/documents/${documentId}/redact`,
      { regions: payload }
    );
  }
}
