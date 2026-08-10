import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

/**
 * The processing step that produced a version. Mirrors
 * DocumentVersion.DocumentOperation on the server — a value missing here
 * still renders, but as the raw enum name, so the history panel showed
 * "PAGES" and "SIGN" where every other row read as a sentence.
 */
export type DocumentOperation =
  | 'UPLOAD' | 'REDACT' | 'OCR' | 'FLATTEN'
  | 'FORM_FILL' | 'FORM_DESIGN'
  | 'PAGES' | 'SIGN' | 'RESTORE';

export interface DocumentVersion {
  version:     number;
  operation:   DocumentOperation;
  summary:     string;
  fileName:    string;
  fileSize:    number | null;
  contentHash: string | null;
  createdBy:   string | null;
  createdAt:   string;
  /** True for the version the document currently points at. */
  current:     boolean;
}

/**
 * Reply from any operation that rewrites the document — redact, OCR, flatten,
 * form-fill. These used to return the new PDF as a download, which meant they
 * could not be combined: each one built its result from the untouched original
 * and handed back a detached file. They now commit a version and report it, so
 * the next operation starts from the previous one's output.
 */
export interface ProcessingResult {
  success:    boolean;
  documentId: number;
  version:    number;
  operation:  DocumentOperation;
  summary:    string;
  fileSize:   number | null;
  createdAt:  string;
  /** Per-operation counts, e.g. `ocrPages`, `redactedPages`, `filledFields`. */
  details:    Record<string, unknown>;
}

/** Labels for the history panel, keyed by the server's operation names. */
const OPERATION_LABELS: Record<DocumentOperation, string> = {
  UPLOAD:      'Uploaded',
  REDACT:      'Redacted',
  OCR:         'OCR',
  FLATTEN:     'Flattened',
  FORM_FILL:   'Form filled',
  FORM_DESIGN: 'Form fields changed',
  PAGES:       'Pages changed',
  SIGN:        'Signed',
  RESTORE:     'Restored'
};

@Injectable({ providedIn: 'root' })
export class DocumentVersionService {
  private http = inject(HttpClient);

  listVersions(documentId: number): Observable<DocumentVersion[]> {
    return this.http.get<DocumentVersion[]>(`/api/documents/${documentId}/versions`);
  }

  /**
   * Makes an earlier version current by copying it forward. History is never
   * truncated, so a signature taken against a later version keeps the bytes
   * it attests to.
   */
  restore(documentId: number, version: number): Observable<DocumentVersion> {
    return this.http.post<DocumentVersion>(
      `/api/documents/${documentId}/versions/${version}/restore`, {});
  }

  downloadVersion(documentId: number, version: number): Observable<Blob> {
    return this.http.get(
      `/api/documents/${documentId}/versions/${version}/file`,
      { responseType: 'blob' });
  }

  operationLabel(operation: DocumentOperation): string {
    return OPERATION_LABELS[operation] ?? operation;
  }

  /** Compact size for the history list, e.g. "1.4 MB". */
  formatSize(bytes: number | null): string {
    if (bytes === null || bytes === undefined) return '';
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB'];
    let size = bytes / 1024;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit++; }
    return `${size.toFixed(1)} ${units[unit]}`;
  }
}
