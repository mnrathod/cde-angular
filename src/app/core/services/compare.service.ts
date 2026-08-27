import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CompareRequest, CompareResult } from '../models';

@Injectable({ providedIn: 'root' })
export class CompareService {
  private http = inject(HttpClient);

  compare(req: CompareRequest): Observable<CompareResult> {
    return this.http.post<CompareResult>('/api/compare', req);
  }

  /**
   * Ask for an assisted review report on a comparison.
   *
   * <p>This used to build the whole prompt here, pin a model identifier, and
   * POST the lot to a passthrough endpoint that forwarded it verbatim to a
   * third-party provider. Three things were wrong with that and only one was
   * cosmetic: a browser decided what this deployment spent and on which model;
   * the payload could not be filtered on the server, because the server did not
   * define its shape; and document names and revisions went to an outside
   * service with nothing between them and it.
   *
   * <p>Now the client sends facts. The server builds the prompt from an
   * allow-list, replaces personal identifiers with placeholders, refuses
   * anything carrying a classification marking, and records the call in the
   * audit trail.
   */
  getComparisonReport(result: CompareResult): Observable<ComparisonReport> {
    return this.http.post<ComparisonReport>('/api/ai/comparison-report', {
      firstDocumentName:  result.doc1Name,
      secondDocumentName: result.doc2Name,
      firstRevision:      result.doc1Revision || 'unstated',
      secondRevision:     result.doc2Revision || 'unstated',
      documentKind:       result.fileType || 'document',
      changes: result.changes.map(change =>
        `${change.type.toUpperCase()} [${change.category}] ${change.change}`
        + (change.detail ? ' — ' + change.detail : ''))
    });
  }

  /** Whether this deployment offers assisted summaries at all. */
  isAssistanceAvailable(): Observable<{ available: boolean }> {
    return this.http.get<{ available: boolean }>('/api/ai/availability');
  }
}

export interface ComparisonReport {
  report: string;
}
