import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ViewerData } from '../models';
import { IfcNode } from '../../../viewer-core/ifc-tree.component';

@Injectable({ providedIn: 'root' })
export class ViewerService {
  private http = inject(HttpClient);

  getViewerData(documentId: number): Observable<ViewerData | ArrayBuffer> {
    return this.http.get<ViewerData>(`/api/viewer/${documentId}`);
  }

  get3DData(documentId: number): Observable<ViewerData | ArrayBuffer> {
    return this.http.get<ViewerData>(`/api/viewer3d/${documentId}`);
  }

  /**
   * A model's geometry as bytes.
   *
   * Separate from `get3DData` because the media type differs, and a media
   * type is part of the published contract even where the body inside it is
   * documented as opaque (§3.4). The JSON route stays for anything already
   * calling it; this one exists so the arrays do not have to travel as
   * base64, which costs four bytes of transfer for every three of payload.
   *
   * `observe: 'response'` because the server answers a model it cannot read
   * with JSON rather than a buffer, and the content type is how the caller
   * tells a failure from a very short model.
   */
  getModelGeometry(documentId: number) {
    return this.http.get(`/api/viewer3d/${documentId}/geometry`, {
      responseType: 'arraybuffer',
      observe: 'response',
    });
  }

  /**
   * The model hierarchy for the IFC tree.
   *
   * <p>Lives here rather than in the component that renders it. `IfcTreeComponent`
   * is in `viewer-core`, which does no I/O — ADR 14 makes that a property of
   * the product rather than of this repository, because a host embedding the
   * viewer supplies the data and there is no `/api` for the component to call.
   */
  getModelTree(documentId: number): Observable<IfcNode[]> {
    return this.http.get<IfcNode[]>(`/api/viewer3d/${documentId}/tree`);
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
