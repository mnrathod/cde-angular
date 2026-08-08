import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ProcessingResult } from './document-version.service';
import { FormFieldDraft } from './viewer/viewer-state.service';

/** Reply from placing or removing form fields. */
export interface FormChangeResult {
  success:    boolean;
  documentId: number;
  version:    number;
  summary:    string;
  fields:     string[];
}

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
   * Places new fields, making a flat PDF fillable.
   *
   * Geometry is sent in PDF points with a bottom-left origin, so a field
   * lands where it was drawn whatever zoom it was drawn at.
   */
  addFields(documentId: number, drafts: FormFieldDraft[]): Observable<FormChangeResult> {
    return this.http.post<FormChangeResult>(
      `/api/documents/${documentId}/form-fields`,
      {
        fields: drafts.map(draft => ({
          name:     draft.name.trim(),
          kind:     draft.kind,
          page:     draft.page,
          x:        draft.x,
          y:        draft.y,
          width:    draft.width,
          height:   draft.height,
          required: draft.required,
          options:  draft.kind === 'DROPDOWN'
            ? draft.options.split(',').map(option => option.trim()).filter(Boolean)
            : []
        }))
      });
  }

  removeFields(documentId: number, names: string[]): Observable<FormChangeResult> {
    return this.http.request<FormChangeResult>(
      'delete', `/api/documents/${documentId}/form-fields`, { body: { names } });
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
