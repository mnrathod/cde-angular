import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { RedactionRegion } from '../../../viewer-core/viewer-state.service';
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
/** A category of sensitive content the server knows how to recognise. */
export type RedactionPreset =
  | 'email' | 'phone' | 'creditCard' | 'ssn' | 'niNumber' | 'postcode' | 'iban';

/** Labels for the preset buttons, in the order they are offered. */
export const REDACTION_PRESETS: ReadonlyArray<{ id: RedactionPreset; label: string }> = [
  { id: 'email',      label: 'Email' },
  { id: 'phone',      label: 'Phone' },
  { id: 'creditCard', label: 'Card number' },
  { id: 'iban',       label: 'IBAN' },
  { id: 'niNumber',   label: 'NI number' },
  { id: 'ssn',        label: 'SSN' },
  { id: 'postcode',   label: 'Postcode' }
];

/** What to search for. Any combination may be supplied. */
export interface TextSearch {
  terms?:     string[];
  presets?:   RedactionPreset[];
  regexes?:   string[];
  matchCase?: boolean;
  wholeWord?: boolean;
}

/** One place the search matched, in PDF points with a bottom-left origin. */
export interface TextMatch {
  page:    number;
  text:    string;
  /** Which rule found it, e.g. `preset:email`. */
  pattern: string;
  x:       number;
  y:       number;
  width:   number;
  height:  number;
}

export interface TextSearchResult {
  success:    boolean;
  matchCount: number;
  matches:    TextMatch[];
  /** Pages with no text layer, which cannot be searched until OCR has run. */
  pagesWithoutText: number;
  error?:     string;
}

@Injectable({ providedIn: 'root' })
export class RedactionService {
  private http = inject(HttpClient);

  /** Redacts regions someone drew by hand. */
  redact(documentId: number, regions: RedactionRegion[]): Observable<ProcessingResult> {
    const payload = regions.map(r => ({
      page: r.page, x: r.x, y: r.y, width: r.width, height: r.height, reason: r.reason
    }));
    return this.http.post<ProcessingResult>(
      `/api/documents/${documentId}/redact`,
      { regions: payload }
    );
  }

  /**
   * Finds matching text without changing anything.
   *
   * Redaction cannot be undone from inside the file, so the count and the
   * matched strings are shown before anything is destroyed.
   */
  findText(documentId: number, search: TextSearch): Observable<TextSearchResult> {
    return this.http.post<TextSearchResult>(
      `/api/documents/${documentId}/find-text`, search);
  }

  /**
   * Redacts every occurrence of a term, pattern or expression.
   *
   * The server searches again immediately before redacting rather than using
   * the preview's coordinates, so a version committed in between cannot cause
   * the wrong part of the page to be blacked out.
   */
  redactMatching(documentId: number, search: TextSearch): Observable<ProcessingResult> {
    return this.http.post<ProcessingResult>(
      `/api/documents/${documentId}/redact-matching`, search);
  }
}
