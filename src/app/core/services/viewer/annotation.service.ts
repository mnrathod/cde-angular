import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { Annotation, AnnotationRequest, AnnotationType } from '../../models';
import { ShapeData } from './viewer-state.service';
import { MarkupEngineService } from './markup-engine.service';

@Injectable({ providedIn: 'root' })
export class AnnotationService {
  private http   = inject(HttpClient);
  private markup = inject(MarkupEngineService);

  // ── Load all annotations for a document ─────────────────────
  loadAnnotations(documentId: number): Observable<Annotation[]> {
    return this.http.get<Annotation[]>(`/api/annotations/document/${documentId}`);
  }

  // ── Save shapes as annotations (batch save) ──────────────────
  saveShapes(documentId: number, shapes: ShapeData[]): Observable<Annotation[]> {
    if (!shapes.length) return of([]);

    // Group by page for efficient saving
    const requests: Observable<Annotation>[] = shapes.map(shape => {
      const req: AnnotationRequest = {
        documentId,
        type:       this.shapeToAnnotationType(shape.tool),
        shapeData:  JSON.stringify(shape),
        comment:    shape.text || '',
        pageNumber: shape.pageNumber
      };
      return shape.savedId
        ? this.http.put<Annotation>(`/api/annotations/${shape.savedId}`, req)
        : this.http.post<Annotation>('/api/annotations', req);
    });
    return forkJoin(requests);
  }

  // ── Delete a single annotation ───────────────────────────────
  deleteAnnotation(id: number): Observable<void> {
    return this.http.delete<void>(`/api/annotations/${id}`);
  }

  // ── Resolve an annotation ────────────────────────────────────
  resolveAnnotation(id: number): Observable<Annotation> {
    return this.http.patch<Annotation>(`/api/annotations/${id}/resolve`, {});
  }

  // ── XFDF Export ──────────────────────────────────────────────
  exportXfdf(documentId: number): Observable<Blob> {
    return this.http.get(`/api/annotations/document/${documentId}/xfdf`, {
      responseType: 'blob'
    });
  }

  // ── XFDF Import ──────────────────────────────────────────────
  importXfdf(documentId: number, file: File): Observable<Annotation[]> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<Annotation[]>(
      `/api/annotations/document/${documentId}/xfdf`,
      formData
    );
  }

  // ── Convert saved Annotation back to ShapeData ───────────────
  annotationToShape(ann: Annotation): ShapeData | null {
    try {
      const parsed = JSON.parse(ann.shapeData);
      // If it's already a ShapeData structure
      if (parsed.tool) {
        return { ...parsed, savedId: ann.id };
      }
      // Legacy format: try to convert
      return this.legacyToShape(ann, parsed);
    } catch {
      return null;
    }
  }

  annotationsToShapes(annotations: Annotation[]): ShapeData[] {
    return annotations
      .map(a => this.annotationToShape(a))
      .filter((s): s is ShapeData => s !== null);
  }

  private shapeToAnnotationType(tool: string): AnnotationType {
    const map: Record<string, AnnotationType> = {
      'text': 'COMMENT', 'note': 'COMMENT', 'highlight': 'HIGHLIGHT',
      'stamp': 'STAMP', 'dimension': 'DIMENSION',
      'cloud': 'CLOUD', 'arrow': 'ARROW',
      'underline': 'UNDERLINE', 'strikeout': 'STRIKEOUT', 'squiggly': 'SQUIGGLY',
      // rect, circle, ellipse, polygon, polyline, line, freehand, callout, redact
      // all fall through to 'MARKUP' — the backend dispatches the concrete
      // shape via the `tool` field embedded in shapeData (see XfdfService).
    };
    return map[tool] || 'MARKUP';
  }

  private legacyToShape(ann: Annotation, data: any): ShapeData {
    return {
      id:          this.markup.newId(),
      tool:        'rect',
      pageNumber:  ann.pageNumber || 1,
      color:       '#FF0000',
      strokeWidth: 2,
      opacity:     0.1,
      x: data.x || 0, y: data.y || 0,
      width: data.width || 100, height: data.height || 100,
      savedId: ann.id,
      author:  ann.authorName,
      createdAt: ann.createdAt
    };
  }
}
