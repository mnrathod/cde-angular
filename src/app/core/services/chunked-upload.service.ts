import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpEventType, HttpRequest } from '@angular/common/http';
import { Observable, from, concatMap, tap, catchError, throwError } from 'rxjs';
import { problemDetail } from '../handlers/problem-detail';

export interface UploadProgress {
  fileName:   string;
  progress:   number;     // 0–100
  status:     'pending' | 'uploading' | 'processing' | 'done' | 'error';
  message?:   string;
  documentId?: number;
}

const CHUNK_SIZE   = 2 * 1024 * 1024;   // 2 MB per chunk
const DIRECT_LIMIT = 10 * 1024 * 1024;  // files <10 MB go direct

@Injectable({ providedIn: 'root' })
export class ChunkedUploadService {
  private http = inject(HttpClient);

  readonly uploads = signal<UploadProgress[]>([]);

  /**
   * Upload a file — direct for small files, chunked for large ones.
   * Returns an Observable that emits the final Document.
   */
  upload(
    file:      File,
    projectId: number,
    meta:      Record<string, string>
  ): Observable<any> {
    if (file.size <= DIRECT_LIMIT) {
      return this.directUpload(file, projectId, meta);
    }
    return this.chunkedUpload(file, projectId, meta);
  }

  // ── Direct upload (small files) ──────────────────────────────
  private directUpload(
    file:      File,
    projectId: number,
    meta:      Record<string, string>
  ): Observable<any> {
    const fd = new FormData();
    fd.append('file', file);
    Object.entries(meta).forEach(([k, v]) => fd.append(k, v));
    fd.append('projectId', String(projectId));

    this.setProgress(file.name, { status: 'uploading', progress: 0 });

    const req = new HttpRequest('POST', '/api/documents/upload', fd, {
      reportProgress: true
    });

    return new Observable(observer => {
      this.http.request(req).subscribe({
        next: event => {
          if (event.type === HttpEventType.UploadProgress && event.total) {
            const progress = Math.round(100 * event.loaded / event.total);
            this.setProgress(file.name, { progress, status: 'uploading' });
          }
          if (event.type === HttpEventType.Response) {
            this.setProgress(file.name, { progress: 100, status: 'done', documentId: (event.body as any)?.id });
            observer.next(event.body);
            observer.complete();
          }
        },
        error: err => {
          // The server's own sentence, not Angular's "Http failure response
          // for /api/documents/upload: 422" — which tells the user nothing
          // about the limit they hit.
          this.setProgress(file.name, { status: 'error',
            message: problemDetail(err, 'The upload could not be completed.') });
          observer.error(err);
        }
      });
    });
  }

  // ── Chunked upload (large files) ─────────────────────────────
  private chunkedUpload(
    file:      File,
    projectId: number,
    meta:      Record<string, string>
  ): Observable<any> {
    const chunks    = Math.ceil(file.size / CHUNK_SIZE);
    const uploadId  = crypto.randomUUID();
    let uploaded    = 0;

    this.setProgress(file.name, { status: 'uploading', progress: 0,
      message: `Uploading in ${chunks} parts...` });

    // Create array of chunk observables
    const chunkObs = Array.from({ length: chunks }, (_, i) => {
      const start = i * CHUNK_SIZE;
      const end   = Math.min(start + CHUNK_SIZE, file.size);
      const blob  = file.slice(start, end);

      const fd = new FormData();
      fd.append('chunk',      blob, file.name);
      fd.append('uploadId',   uploadId);
      fd.append('chunkIndex', String(i));
      fd.append('totalChunks', String(chunks));
      fd.append('fileName',   file.name);

      // On the LAST chunk, not the first. The server assembles the file on the
      // chunk that completes the set, and it needs a project to file the
      // document under at that moment. Sent with chunk zero instead, a
      // single-chunk upload worked and every larger one uploaded every byte,
      // reported success on each part, and quietly never produced a document.
      if (i === chunks - 1) {
        Object.entries(meta).forEach(([k, v]) => fd.append(k, v));
        fd.append('projectId', String(projectId));
      }

      return this.http.post<any>('/api/documents/upload/chunk', fd).pipe(
        tap(() => {
          uploaded++;
          const progress = Math.round((uploaded / chunks) * 90);  // 90% for upload
          this.setProgress(file.name, { progress, status: 'uploading' });
        })
      );
    });

    // Uploaded one at a time, in order. The server accepts them in any order,
    // but sending them sequentially is what makes "the last one completes the
    // set" true, and it keeps one slow upload from opening N connections.
    return from(chunkObs).pipe(
      concatMap(obs => obs),
      tap(response => {
        // Only the final chunk answers with a document; the rest report
        // progress. Reading the reply's shape is how a client tells them
        // apart, which is what the endpoint documents.
        if (response && response.id) {
          this.setProgress(file.name, { progress: 100, status: 'done',
            documentId: response.id });
        }
      }),
      catchError(err => {
        // Without this the entry stayed at "uploading" for ever, so a refused
        // upload looked like a stalled one. The server explains a refusal —
        // a chunk over the limit, a file past the maximum — and that sentence
        // is what the user needs.
        this.setProgress(file.name, { status: 'error',
          message: problemDetail(err, 'The upload could not be completed.') });
        return throwError(() => err);
      })
    );
    // There was a finalize here setting "Assembling file…" at 95%, left over
    // from a polling step that was never built. It ran after the stream
    // completed, so on a successful upload it overwrote the finished state
    // with a permanent in-progress one — the upload showed as stuck at the
    // moment it actually succeeded.
  }

  removeUpload(fileName: string) {
    this.uploads.update(list => list.filter(u => u.fileName !== fileName));
  }

  private setProgress(fileName: string, patch: Partial<UploadProgress>) {
    this.uploads.update(list => {
      const existing = list.find(u => u.fileName === fileName);
      if (existing) {
        return list.map(u => u.fileName === fileName ? { ...u, ...patch } : u);
      }
      return [...list, { fileName, progress: 0, status: 'pending', ...patch }];
    });
  }
}
