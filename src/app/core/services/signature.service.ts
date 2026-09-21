import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface SignatureRecord {
  id:          number;
  signatureId: string;
  signerName:  string;
  signerEmail: string;
  role:        string;
  reason:      string;
  status:      'VALID' | 'INVALID' | 'TAMPERED' | 'EXPIRED';
  signedAt:    string;
  /** Document version this signature attests to. */
  version:     number | null;
}

/**
 * Reply from signing: the signature that was created, plus what signing did to
 * the document.
 *
 * The signature is nested rather than merged into this shape, so one schema
 * describes a signature everywhere it appears rather than two that have to be
 * kept in step.
 */
export interface SignResult {
  signature:      SignatureRecord;
  /**
   * The stamp as the server draws it into the document.
   *
   * <p>Not for display here. Angular's sanitiser drops every `<svg>` element
   * and keeps their bare text, so `[innerHTML]` renders the stamp as one
   * unstyled run-together line rather than as a stamp — and a sanitiser
   * bypass is banned (§5.12). `DocumentSignatureComponent` builds its preview
   * from {@link signature} instead, which is the same information as text.
   */
  stampSvg:       string;
  /** Version number this signing committed. */
  version:        number;
  /**
   * True when the signature was written into the PDF itself, so any reader
   * can check it. False for documents that cannot carry one, where the
   * signature exists only in this application's records.
   */
  embedded:       boolean;
  documentStatus: string;
}

export interface VerifyResult {
  valid:    boolean;
  /** Same enum the record carries, so the outcome can be worded client-side. */
  status:   SignatureRecord['status'];
  message:  string;
  /** Whether the check read the document itself or only our record of it. */
  embedded: boolean;
}

export interface SignRequest {
  role:     'Author' | 'Reviewer' | 'Approver';
  reason:   string;
  location?: string;
}

@Injectable({ providedIn: 'root' })
export class SignatureService {
  private http = inject(HttpClient);

  getSignatures(documentId: number): Observable<SignatureRecord[]> {
    return this.http.get<SignatureRecord[]>(`/api/signatures/document/${documentId}`);
  }

  /**
   * Signs the document. For a PDF this writes the signature into the file
   * and commits a new version, so the signature travels with the document.
   */
  sign(documentId: number, req: SignRequest): Observable<SignResult> {
    return this.http.post<SignResult>(`/api/signatures/document/${documentId}/sign`, req);
  }

  verify(signatureId: string): Observable<VerifyResult> {
    return this.http.post<VerifyResult>(`/api/signatures/${signatureId}/verify`, {});
  }

  revoke(signatureId: string): Observable<void> {
    return this.http.delete<void>(`/api/signatures/${signatureId}`);
  }
}
