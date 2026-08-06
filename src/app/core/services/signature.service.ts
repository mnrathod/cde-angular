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

  sign(documentId: number, req: SignRequest): Observable<any> {
    return this.http.post(`/api/signatures/document/${documentId}/sign`, req);
  }

  verify(signatureId: string): Observable<any> {
    return this.http.post(`/api/signatures/${signatureId}/verify`, {});
  }

  revoke(signatureId: string): Observable<void> {
    return this.http.delete<void>(`/api/signatures/${signatureId}`);
  }
}
