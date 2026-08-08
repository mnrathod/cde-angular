import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ProcessingResult } from './document-version.service';

/** Control type resolved server-side from the field's /FT plus its flag bits. */
export type PdfFormFieldKind =
  | 'text' | 'textarea' | 'password'
  | 'checkbox' | 'radio' | 'button'
  | 'dropdown' | 'listbox'
  | 'signature';

export interface PdfFormChoice {
  value: string;
  label: string;
}

export interface PdfFormField {
  name:         string;
  kind:         PdfFormFieldKind;
  /** Raw AcroForm type, e.g. '/Tx'. Kept for diagnostics. */
  type:         string;
  flags:        number;
  readOnly:     boolean;
  required:     boolean;
  page:         number;
  value:        string;
  checked?:     boolean;
  /** Appearance-state name a checkbox/radio uses for "on" (often /Yes). */
  onState?:     string;
  options?:     PdfFormChoice[];
  multiSelect?: boolean;
  multiline?:   boolean;
  maxLength?:   number;
}

export interface PdfFormFieldsResponse {
  success:   boolean;
  fields:    PdfFormField[];
  count:     number;
  pageCount: number;
  error?:    string;
}

/**
 * Reads and fills PDF AcroForm fields via the backend, which proxies to the
 * Python converter (pypdf).
 *
 * Filling commits a new version of the document rather than returning a
 * separate copy, matching Redact/OCR/Flatten — so a form can be filled on a
 * document that was already OCR'd or redacted, and the values persist for
 * whoever opens it next.
 */
@Injectable({ providedIn: 'root' })
export class PdfFormService {
  private http = inject(HttpClient);

  getFields(documentId: number): Observable<PdfFormFieldsResponse> {
    return this.http.get<PdfFormFieldsResponse>(`/api/documents/${documentId}/form-fields`);
  }

  /**
   * @param values field name -> value. Checkboxes accept booleans; the
   *   server maps them onto the field's own on/off appearance states.
   * @param flatten bake the values in and drop the interactive fields.
   */
  fillForm(
    documentId: number,
    values: Record<string, string | boolean>,
    flatten = false
  ): Observable<ProcessingResult> {
    return this.http.post<ProcessingResult>(
      `/api/documents/${documentId}/form-fill`,
      { fields: values, flatten }
    );
  }
}
