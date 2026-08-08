import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

/** A page as the document currently stores it. */
export interface PdfPageInfo {
  page:     number;
  width:    number;
  height:   number;
  /** Rotation already baked into the file, in degrees. */
  rotation: number;
}

export interface PdfPageInfoResponse {
  success:   boolean;
  pageCount: number;
  pages:     PdfPageInfo[];
  error?:    string;
}

/**
 * One page of the layout being requested.
 *
 * `page` names a page of the document as it stands now, so the same number
 * may appear more than once (a duplicate) or not at all (a deletion), and
 * `rotate` turns it relative to the rotation it already has.
 */
export interface PageArrangementEntry {
  page:   number;
  rotate: number;
}

/** Reply from an in-place page change. */
export interface PageArrangementResult {
  success:    boolean;
  documentId: number;
  version:    number;
  summary:    string;
  pageCount:  number;
  createdAt:  string;
}

/** Reply from extracting pages into a new document. */
export interface PageExtractionResult {
  success:    boolean;
  documentId: number;
  name:       string;
  pageCount:  number;
  fileSize:   number | null;
}

/**
 * Reads and rewrites a document's page tree.
 *
 * Reordering, deleting, duplicating and rotating all go through
 * {@link arrange}: the client sends the layout it wants and the server works
 * out what changed. That keeps a batch of edits in the page organiser to a
 * single committed version described by its net effect, rather than one
 * version per drag.
 */
@Injectable({ providedIn: 'root' })
export class PageService {
  private http = inject(HttpClient);

  getPages(documentId: number): Observable<PdfPageInfoResponse> {
    return this.http.get<PdfPageInfoResponse>(`/api/documents/${documentId}/pages`);
  }

  /** Applies a whole page layout, committing one version. */
  arrange(documentId: number, pages: PageArrangementEntry[]): Observable<PageArrangementResult> {
    return this.http.post<PageArrangementResult>(
      `/api/documents/${documentId}/pages/arrange`, { pages });
  }

  /**
   * Brings pages in from another document.
   *
   * @param position 1-based page the inserted block starts at; omit to append.
   */
  insert(
    documentId: number,
    sourceDocumentId: number,
    pages: number[],
    position?: number
  ): Observable<PageArrangementResult> {
    return this.http.post<PageArrangementResult>(
      `/api/documents/${documentId}/pages/insert`,
      { sourceDocumentId, pages, position });
  }

  /** Copies pages into a new document, leaving this one untouched. */
  extract(documentId: number, pages: number[], name?: string): Observable<PageExtractionResult> {
    return this.http.post<PageExtractionResult>(
      `/api/documents/${documentId}/pages/extract`, { pages, name });
  }
}
