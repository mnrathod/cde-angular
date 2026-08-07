import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { RedactionRegion } from './viewer/viewer-state.service';

/**
 * Calls the server-side redaction pipeline (DocumentProcessingController ->
 * Python converter). Redaction is PDF-only: the backend rasterizes each
 * affected page and burns opaque black boxes over the given regions,
 * permanently destroying the underlying content, then returns the new PDF.
 * The original document/file on the server is left untouched — this
 * produces a separate redacted copy for download, not an in-place edit.
 */
@Injectable({ providedIn: 'root' })
export class RedactionService {
  private http = inject(HttpClient);

  redact(documentId: number, regions: RedactionRegion[]): Observable<Blob> {
    const payload = regions.map(r => ({
      page: r.page, x: r.x, y: r.y, width: r.width, height: r.height, reason: r.reason
    }));
    return this.http.post(
      `/api/documents/${documentId}/redact`,
      { regions: payload, burn: true },
      { responseType: 'blob' }
    );
  }
}
