import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ShapeData } from '../../../../viewer-core/viewer-state.service';
import { ProcessingResult } from '../document-version.service';

export interface FlattenRequest {
  documentId: number;
  shapes:     ShapeData[];
  quality:    'screen' | 'print';
}

@Injectable({ providedIn: 'root' })
export class FlattenService {
  private http = inject(HttpClient);

  /**
   * Bake annotations into the page content server-side (Spring Boot forwards
   * to the Python converter) and commit the result as a new document version.
   *
   * There was also a client-side path that composited pages with jsPDF and
   * saved a file. It has been removed: it produced a download detached from
   * the document, so the flattened markup existed only in whatever copy the
   * user happened to keep, and no later operation could build on it.
   */
  flattenToPdf(req: FlattenRequest): Observable<ProcessingResult> {
    return this.http.post<ProcessingResult>(
      `/api/viewer/${req.documentId}/flatten`,
      { shapes: req.shapes, quality: req.quality }
    );
  }
}
