import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ViewerData } from '../models';

@Injectable({ providedIn: 'root' })
export class ViewerService {
  private http = inject(HttpClient);

  getViewerData(documentId: number): Observable<ViewerData | ArrayBuffer> {
    return this.http.get<ViewerData>(`/api/viewer/${documentId}`);
  }

  get3DData(documentId: number): Observable<ViewerData | ArrayBuffer> {
    return this.http.get<ViewerData>(`/api/viewer3d/${documentId}`);
  }

  getAnnotations(documentId: number) {
    return this.http.get<any[]>(`/api/annotations/document/${documentId}`);
  }

  saveAnnotation(annotation: any) {
    return this.http.post('/api/annotations', annotation);
  }

  exportXfdf(documentId: number): Observable<Blob> {
    return this.http.get(`/api/annotations/document/${documentId}/xfdf`, {
      responseType: 'blob'
    });
  }
}
