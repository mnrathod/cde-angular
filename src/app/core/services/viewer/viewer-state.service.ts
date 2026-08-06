import { Injectable, signal, computed } from '@angular/core';
import { Annotation, AnnotationType, ViewerData } from '../../models';

export type MarkupTool =
  | 'pan' | 'select'
  | 'line' | 'arrow' | 'rect' | 'circle' | 'freehand' | 'cloud'
  | 'text' | 'highlight' | 'stamp' | 'dimension' | 'callout';

export interface ShapeData {
  id:          string;
  tool:        MarkupTool;
  pageNumber:  number;
  color:       string;
  strokeWidth: number;
  opacity:     number;
  // Geometry (type-specific)
  x1?: number; y1?: number; x2?: number; y2?: number;   // line, arrow
  x?: number;  y?: number;                               // origin
  width?: number; height?: number;                       // rect, highlight
  cx?: number; cy?: number; r?: number;                  // circle
  points?: Array<{x: number; y: number}>;               // freehand, cloud, polygon
  text?: string;                                         // text, stamp, freetext
  measurement?: string;                                  // dimension
  // Metadata
  author?: string;
  createdAt?: string;
  savedId?: number;    // backend annotation id once saved
}

export interface SearchResult {
  pageIndex: number;
  matchIndex: number;
  text: string;
}

export interface PageThumbnail {
  pageNumber: number;
  dataUrl:    string;
}

@Injectable()   // ← NOT providedIn root — scoped per viewer instance
export class ViewerStateService {

  // ── Document ─────────────────────────────────────────────────
  readonly documentId   = signal<number>(0);
  readonly viewerData   = signal<ViewerData | null>(null);
  readonly loading      = signal(true);
  readonly loadingMsg   = signal('Loading document...');
  readonly errorMsg     = signal('');

  // ── PDF specific ─────────────────────────────────────────────
  readonly pdfDoc       = signal<any>(null);   // pdfjsLib.PDFDocumentProxy
  readonly totalPages   = signal(0);
  readonly currentPage  = signal(1);
  readonly zoom         = signal(1.0);
  readonly thumbnails   = signal<PageThumbnail[]>([]);
  readonly searchQuery  = signal('');
  readonly searchResults = signal<SearchResult[]>([]);
  readonly searchIndex  = signal(0);

  // ── Markup ───────────────────────────────────────────────────
  readonly activeTool   = signal<MarkupTool>('pan');
  readonly strokeColor  = signal('#FF0000');
  readonly strokeWidth  = signal(2);
  readonly fillOpacity  = signal(0.15);
  readonly shapes       = signal<ShapeData[]>([]);
  readonly undoStack    = signal<ShapeData[][]>([]);  // snapshots for undo
  readonly selectedId   = signal<number | null>(null);
  readonly dirty        = signal(false);   // unsaved changes

  // ── Annotations (saved) ──────────────────────────────────────
  readonly annotations  = signal<Annotation[]>([]);
  readonly showAnnotations = signal(true);

  // ── Sidebar ──────────────────────────────────────────────────
  readonly sidebarTab   = signal<'annotations' | 'threads' | 'thumbnails' | 'search' | 'signatures'>('annotations');
  readonly sidebarOpen  = signal(true);

  // ── Computed ─────────────────────────────────────────────────
  readonly shapesOnCurrentPage = computed(() =>
    this.shapes().filter(s => s.pageNumber === this.currentPage())
  );

  readonly annotationsOnCurrentPage = computed(() =>
    this.annotations().filter(a => a.pageNumber === this.currentPage())
  );

  readonly canUndo = computed(() => this.undoStack().length > 0);

  // ── Mutations ────────────────────────────────────────────────
  addShape(shape: ShapeData) {
    this.pushUndoSnapshot();
    this.shapes.update(s => [...s, shape]);
    this.dirty.set(true);
  }

  updateShape(id: string, patch: Partial<ShapeData>) {
    this.shapes.update(s => s.map(sh => sh.id === id ? { ...sh, ...patch } : sh));
    this.dirty.set(true);
  }

  removeShape(id: string) {
    this.pushUndoSnapshot();
    this.shapes.update(s => s.filter(sh => sh.id !== id));
    this.dirty.set(true);
  }

  undo() {
    const stack = this.undoStack();
    if (!stack.length) return;
    const prev = stack[stack.length - 1];
    this.undoStack.update(s => s.slice(0, -1));
    this.shapes.set(prev);
    this.dirty.set(true);
  }

  clearAll() {
    this.pushUndoSnapshot();
    this.shapes.set([]);
    this.dirty.set(true);
  }

  setAnnotationsSaved(savedAnnotations: Annotation[]) {
    this.annotations.set(savedAnnotations);
    this.dirty.set(false);
  }

  navigateTo(page: number) {
    const total = this.totalPages();
    this.currentPage.set(Math.max(1, Math.min(total, page)));
  }

  zoomIn()    { this.zoom.update(z => Math.min(z + 0.25, 5)); }
  zoomOut()   { this.zoom.update(z => Math.max(z - 0.25, 0.25)); }
  zoomFit()   { this.zoom.set(1.0); }

  private pushUndoSnapshot() {
    const current = this.shapes();
    this.undoStack.update(s => [...s.slice(-19), current]);  // keep last 20
  }
}
