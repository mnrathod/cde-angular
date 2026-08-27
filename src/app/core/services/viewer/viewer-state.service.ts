import { Injectable, signal, computed } from '@angular/core';
import { Annotation, AnnotationType, ViewerData } from '../../models';
import { MeasurementScale, UNCALIBRATED } from './measurement.service';
import { DrawingTextItem } from './drawing-search.service';

export type MarkupTool =
  | 'pan' | 'select'
  | 'line' | 'arrow' | 'rect' | 'circle' | 'ellipse' | 'freehand' | 'cloud'
  | 'polygon' | 'polyline'
  | 'text' | 'highlight' | 'underline' | 'strikeout' | 'squiggly'
  | 'stamp' | 'note' | 'callout'
  // Measurement: 'dimension' is a multi-segment length, 'area' reports area
  // and perimeter, 'radius' reports radius and diameter, and 'calibrate'
  // draws the reference line that gives the drawing its scale.
  | 'dimension' | 'area' | 'radius' | 'calibrate'
  | 'redact' | 'formfield';

/** The panels available in the viewer's side bar. */
export type SidebarTab =
  | 'annotations' | 'threads' | 'thumbnails' | 'search' | 'signatures'
  | 'redact' | 'form' | 'measure' | 'versions' | 'outline';

/** A committed measurement, kept so the reader can review earlier results. */
export interface MeasurementEntry {
  id:      string;
  kind:    'Linear' | 'Area' | 'Radius';
  value:   string;
  detail:  string;
  page:    number;
}

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
  measurement?: string;                                  // dimension, area, radius
  /** Second readout on a measurement — perimeter for area, diameter for radius. */
  measurementDetail?: string;
  /** Per-segment lengths on a multi-segment linear measurement. */
  segmentLabels?: string[];
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

// A redaction region, in the backend's own coordinate system: PDF points,
// origin bottom-left (matches DocumentProcessingController/converter's
// /redact contract exactly). Deliberately NOT a ShapeData — that type is
// screen-pixel, top-left-origin, and zoom-dependent; redaction regions need
// to stay correct regardless of zoom, since they're sent to the server.
export interface RedactionRegion {
  id:      string;
  page:    number;
  x:       number;
  y:       number;
  width:   number;
  height:  number;
  reason?: string;
}

/** The control a placed form field should become. */
export type FormFieldKind = 'TEXT' | 'TEXTAREA' | 'CHECKBOX' | 'DROPDOWN';

/**
 * A form field drawn on a page but not yet added to the document. Geometry is
 * in PDF points with a bottom-left origin — the space the server places
 * fields in — so it stays correct across zoom changes.
 */
export interface FormFieldDraft {
  id:       string;
  page:     number;
  x:        number;
  y:        number;
  width:    number;
  height:   number;
  name:     string;
  kind:     FormFieldKind;
  required: boolean;
  /** Comma-separated choices, for a dropdown. */
  options:  string;
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

  /**
   * Text found in a converted CAD drawing, indexed when the drawing loads.
   * Empty for a PDF, whose text comes from the PDF itself.
   */
  readonly drawingText = signal<ReadonlyArray<DrawingTextItem>>([]);

  /**
   * The region a search result points at, in the drawing's own coordinates.
   * The viewer scrolls it into view and marks it; null clears the mark.
   */
  readonly searchFocus = signal<DrawingTextItem | null>(null);

  /**
   * False when the open document has no text to search at all — an image, say.
   * Distinguishes "nothing here matches" from "this cannot be searched", which
   * both used to read as "No matches found".
   */
  readonly searchable = computed(() =>
    this.viewerData()?.type === 'pdf' || this.drawingText().length > 0);
  readonly searchIndex  = signal(0);

  // ── Markup ───────────────────────────────────────────────────
  readonly activeTool   = signal<MarkupTool>('pan');
  readonly strokeColor  = signal('#FF0000');
  readonly strokeWidth  = signal(2);
  readonly fillOpacity  = signal(0.15);
  readonly shapes       = signal<ShapeData[]>([]);
  readonly undoStack    = signal<ShapeData[][]>([]);  // snapshots for undo
  readonly redoStack    = signal<ShapeData[][]>([]);  // snapshots undone, available to redo
  readonly selectedId   = signal<number | null>(null);
  readonly dirty        = signal(false);   // unsaved changes

  // ── Redaction (PDF only) ───────────────────────────────────────
  readonly redactionRegions = signal<RedactionRegion[]>([]);

  // ── Form design (PDF only) ─────────────────────────────────────
  /**
   * Fields drawn but not yet added to the document. Held here rather than in
   * the form panel because the rectangle is drawn on the page and named in
   * the panel — two components that would otherwise need a handle on each
   * other.
   */
  readonly formFieldDrafts = signal<FormFieldDraft[]>([]);

  addFormFieldDraft(draft: FormFieldDraft) {
    this.formFieldDrafts.update(drafts => [...drafts, draft]);
  }

  updateFormFieldDraft(id: string, patch: Partial<FormFieldDraft>) {
    this.formFieldDrafts.update(drafts =>
      drafts.map(draft => draft.id === id ? { ...draft, ...patch } : draft));
  }

  removeFormFieldDraft(id: string) {
    this.formFieldDrafts.update(drafts => drafts.filter(draft => draft.id !== id));
  }

  clearFormFieldDrafts() { this.formFieldDrafts.set([]); }

  // ── Measurement ──────────────────────────────────────────────
  readonly measurementScale = signal<MeasurementScale>(UNCALIBRATED);
  readonly measurements     = signal<MeasurementEntry[]>([]);
  /** Length in pixels of the last calibration line drawn, awaiting its real value. */
  readonly pendingCalibrationPixels = signal(0);

  readonly isCalibrated = computed(() => this.measurementScale().unit !== 'px');

  setScale(scale: MeasurementScale) { this.measurementScale.set(scale); }

  resetScale() {
    this.measurementScale.set(UNCALIBRATED);
    this.pendingCalibrationPixels.set(0);
  }

  addMeasurement(entry: MeasurementEntry) {
    // Newest first: the reader cares about what they just measured.
    this.measurements.update(list => [entry, ...list]);
  }

  removeMeasurement(id: string) {
    this.measurements.update(list => list.filter(m => m.id !== id));
  }

  clearMeasurements() { this.measurements.set([]); }

  // ── Annotations (saved) ──────────────────────────────────────
  readonly annotations  = signal<Annotation[]>([]);
  readonly showAnnotations = signal(true);

  // ── Sidebar ──────────────────────────────────────────────────
  readonly sidebarTab = signal<SidebarTab>('annotations');
  readonly sidebarOpen  = signal(true);

  // ── Versions ─────────────────────────────────────────────────
  /** Version of the document currently rendered. */
  readonly currentVersion = signal(1);

  /**
   * Incremented whenever a processing operation replaces the document's bytes
   * on the server. The shell watches this and re-fetches; going through a
   * counter rather than a direct call keeps the toolbar and form panel from
   * needing a handle on the shell to refresh it.
   */
  readonly reloadToken = signal(0);

  /**
   * Outcome of the last processing run, shown in the toolbar.
   *
   * <p>Lives here rather than in the toolbar because the reload that follows a
   * commit tears the toolbar down and rebuilds it — a message held in the
   * component was wiped at exactly the moment it had something to say.
   */
  readonly processingMessage = signal('');

  /**
   * Records that redact/OCR/flatten/form-fill committed a new version and
   * asks the shell to reload. This is what makes the operations compose: the
   * viewer picks up the new bytes, so the next operation runs against them.
   */
  applyVersionCommit(version: number, summary = '') {
    this.currentVersion.set(version);
    if (summary) this.processingMessage.set(`v${version} — ${summary}`);
    this.reloadToken.update(token => token + 1);
  }

  // ── Computed ─────────────────────────────────────────────────
  readonly shapesOnCurrentPage = computed(() =>
    this.shapes().filter(s => s.pageNumber === this.currentPage())
  );

  readonly annotationsOnCurrentPage = computed(() =>
    this.annotations().filter(a => a.pageNumber === this.currentPage())
  );

  readonly canUndo = computed(() => this.undoStack().length > 0);
  readonly canRedo = computed(() => this.redoStack().length > 0);

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
    const previous = stack[stack.length - 1];
    // The emptiness guard above makes this present; TypeScript does not carry
    // a length check into an index, so the fact is restated rather than
    // asserted with a `!`.
    if (!previous) return;
    this.undoStack.update(s => s.slice(0, -1));
    // Bank the state being left so redo can return to it.
    this.redoStack.update(s => [...s, this.shapes()]);
    this.shapes.set(previous);
    this.dirty.set(true);
  }

  redo() {
    const stack = this.redoStack();
    if (!stack.length) return;
    const next = stack[stack.length - 1];
    if (!next) return;
    this.redoStack.update(s => s.slice(0, -1));
    this.undoStack.update(s => [...s, this.shapes()]);
    this.shapes.set(next);
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

  addRedactionRegion(region: RedactionRegion) {
    this.redactionRegions.update(rs => [...rs, region]);
  }

  removeRedactionRegion(id: string) {
    this.redactionRegions.update(rs => rs.filter(r => r.id !== id));
  }

  clearRedactionRegions() {
    this.redactionRegions.set([]);
  }

  navigateTo(page: number) {
    const total = this.totalPages();
    this.currentPage.set(Math.max(1, Math.min(total, page)));
  }

  /**
   * View rotation in degrees. Applied as a transform over the page and its
   * markup overlay together, so annotations stay pinned to the drawing
   * rather than needing their coordinates rewritten.
   */
  readonly rotation = signal<0 | 90 | 180 | 270>(0);

  /** True when the rotation swaps the page's width and height. */
  readonly isQuarterTurned = computed(() => this.rotation() % 180 !== 0);

  rotateClockwise() {
    this.rotation.update(r => ((r + 90) % 360) as 0 | 90 | 180 | 270);
  }

  resetRotation() { this.rotation.set(0); }

  zoomIn()    { this.zoom.update(z => Math.min(z + 0.25, 5)); }
  zoomOut()   { this.zoom.update(z => Math.max(z - 0.25, 0.25)); }
  /**
   * Return to 1:1 and recentre.
   *
   * Zoom alone is not enough to restore the view: a drawing panned far off
   * screen stays off screen at 100%. Viewers that track their own pan offset
   * watch `fitRequests` and clear it, which is why this bumps a counter rather
   * than only setting the zoom — setting zoom to a value it already holds
   * notifies nobody.
   */
  zoomFit() {
    this.zoom.set(1.0);
    this.fitRequests.update(count => count + 1);
  }

  /** Incremented on every "fit to window". See `zoomFit`. */
  readonly fitRequests = signal(0);

  private pushUndoSnapshot() {
    const current = this.shapes();
    this.undoStack.update(s => [...s.slice(-19), current]);  // keep last 20
    // A fresh edit abandons the redo branch — the standard behaviour, and
    // without it redo would restore work the user has since diverged from.
    this.redoStack.set([]);
  }
}
