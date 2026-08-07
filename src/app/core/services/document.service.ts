import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs/operators';
import { Document, DocumentStatus } from '../models';

@Injectable({ providedIn: 'root' })
export class DocumentService {
  private http = inject(HttpClient);

  readonly documents = signal<Document[]>([]);
  readonly totalDocs  = signal(0);
  readonly loading   = signal(false);

  loadByProject(projectId: number, page = 0, size = 50) {
    this.loading.set(true);
    const params = { page: String(page), size: String(size), sort: 'createdAt,desc' };
    // Try paginated endpoint first, fall back to list endpoint
    return this.http.get<any>(`/api/documents/project/${projectId}`, { params }).pipe(
      tap(resp => {
        // Handle both paginated (Page<Document>) and plain array responses
        const docs: Document[] = Array.isArray(resp) ? resp : (resp.content ?? []);
        this.documents.set(docs);
        this.totalDocs.set(Array.isArray(resp) ? docs.length : (resp.totalElements ?? docs.length));
        this.loading.set(false);
      })
    );
  }

  upload(projectId: number, file: File, meta: Partial<Document>) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('name',          meta.name || file.name.replace(/\.[^.]+$/, ''));
    fd.append('documentType',  meta.documentType || 'OTHER');
    fd.append('drawingNumber', meta.drawingNumber || '');
    fd.append('revision',      meta.revision || '');
    fd.append('projectId',     String(projectId));
    return this.http.post<Document>('/api/documents/upload', fd).pipe(
      tap(doc => this.documents.update(list => [...list, doc]))
    );
  }

  delete(id: number) {
    // Typed void to match the endpoint's 204 No Content.
    return this.http.delete<void>(`/api/documents/${id}`).pipe(
      tap(() => this.documents.update(list => list.filter(d => d.id !== id)))
    );
  }

  updateStatus(id: number, status: DocumentStatus) {
    return this.http.patch<Document>(`/api/documents/${id}/status`, null, {
      params: { status }
    }).pipe(
      tap(updated => this.documents.update(
        list => list.map(d => d.id === id ? updated : d)
      ))
    );
  }

  getFileIcon(doc: Document): string {
    const ext = doc.fileName?.split('.').pop()?.toLowerCase() || '';
    const map: Record<string, string> = {
      pdf: '📕', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊',
      ppt: '📽', pptx: '📽', ifc: '🏗', rvt: '🏗', rfa: '🏗',
      glb: '🎲', gltf: '🎲', obj: '🎲', stl: '🖨',
      dwg: '📐', dxf: '📐', png: '🖼', jpg: '🖼', svg: '🎨',
    };
    return map[ext] || '📄';
  }

  is3D(doc: Document): boolean {
    const ext = doc.fileName?.split('.').pop()?.toLowerCase() || '';
    return ['ifc','glb','gltf','obj','stl','ply','dae','3ds','rvt','rfa'].includes(ext);
  }
}
