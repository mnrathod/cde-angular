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

  getAiSummary(prompt: string): Observable<any> {
    return this.http.post('/api/ai/messages/stream', {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      stream: true,
      messages: [{ role: 'user', content: prompt }]
    }, { responseType: 'text', observe: 'response' });
  }
}
