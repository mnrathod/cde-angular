import { TestBed } from '@angular/core/testing';
import { ViewerStateService, ShapeData } from './viewer-state.service';
import { definitely } from '../../../../testing/definitely';

const makeShape = (overrides: Partial<ShapeData> = {}): ShapeData => ({
  id: `s-${Math.random()}`, tool: 'rect', pageNumber: 1,
  color: '#FF0000', strokeWidth: 2, opacity: 0.15,
  x: 10, y: 10, width: 100, height: 50,
  ...overrides
});

describe('ViewerStateService version commits', () => {
  let state: ViewerStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ViewerStateService] });
    state = TestBed.inject(ViewerStateService);
  });

  it('starts on version 1 with no reload pending', () => {
    expect(state.currentVersion()).toBe(1);
    expect(state.reloadToken()).toBe(0);
  });

  it('records the committed version and asks for a reload', () => {
    state.applyVersionCommit(3);

    expect(state.currentVersion()).toBe(3);
    expect(state.reloadToken()).toBe(1);
  });

  it('advances the token on every commit so chained operations each reload', () => {
    state.applyVersionCommit(2);
    state.applyVersionCommit(3);
    state.applyVersionCommit(4);

    expect(state.currentVersion()).toBe(4);
    expect(state.reloadToken()).toBe(3);
  });

  it('keeps the outcome message where the post-commit reload cannot wipe it', () => {
    // The reload tears the toolbar down and rebuilds it, so a message held in
    // that component vanished exactly when it had something to report.
    state.applyVersionCommit(3, 'Recognised 2 page(s)');

    expect(state.processingMessage()).toBe('v3 — Recognised 2 page(s)');
  });

  it('leaves the previous message alone when a commit carries no summary', () => {
    state.processingMessage.set('v1 — earlier');
    state.applyVersionCommit(2);

    expect(state.processingMessage()).toBe('v1 — earlier');
  });

  it('reloads even when a commit reports the version already displayed', () => {
    // Restoring can land on a number the viewer is already showing; the token
    // is what triggers the refetch, so it must move regardless.
    state.applyVersionCommit(2);
    state.applyVersionCommit(2);

    expect(state.reloadToken()).toBe(2);
  });
});

describe('ViewerStateService', () => {
  let service: ViewerStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ViewerStateService] });
    service = TestBed.inject(ViewerStateService);
  });

  // ── Initial state ─────────────────────────────────────────────
  it('should initialise with defaults', () => {
    expect(service.currentPage()).toBe(1);
    expect(service.zoom()).toBe(1.0);
    expect(service.shapes()).toEqual([]);
    expect(service.activeTool()).toBe('pan');
    expect(service.dirty()).toBe(false);
    expect(service.canUndo()).toBe(false);
  });

  // ── Shape management ──────────────────────────────────────────
  it('addShape() should add to shapes and set dirty', () => {
    const s = makeShape();
    service.addShape(s);
    expect(service.shapes().length).toBe(1);
    expect(service.dirty()).toBe(true);
  });

  it('addShape() should push undo snapshot', () => {
    service.addShape(makeShape());
    expect(service.canUndo()).toBe(true);
  });

  it('removeShape() should remove by id', () => {
    const s = makeShape({ id: 'test-id' });
    service.addShape(s);
    service.removeShape('test-id');
    expect(service.shapes().length).toBe(0);
  });

  it('updateShape() should patch matching shape', () => {
    const s = makeShape({ id: 'upd-id', color: '#FF0000' });
    service.addShape(s);
    service.updateShape('upd-id', { color: '#0000FF' });
    expect(definitely(service.shapes()[0]).color).toBe('#0000FF');
  });

  it('clearAll() should remove all shapes', () => {
    service.addShape(makeShape());
    service.addShape(makeShape());
    service.clearAll();
    expect(service.shapes().length).toBe(0);
  });

  // ── Undo ──────────────────────────────────────────────────────
  it('undo() should restore previous state', () => {
    const s = makeShape();
    service.addShape(s);
    expect(service.shapes().length).toBe(1);
    service.undo();
    expect(service.shapes().length).toBe(0);
  });

  it('undo() should do nothing when stack is empty', () => {
    service.addShape(makeShape());
    service.undo();
    service.undo(); // second undo — stack is empty now
    expect(service.shapes().length).toBe(0); // no crash
  });

  // ── Computed: shapesOnCurrentPage ────────────────────────────
  it('shapesOnCurrentPage should filter by currentPage', () => {
    service.addShape(makeShape({ pageNumber: 1 }));
    service.addShape(makeShape({ pageNumber: 2 }));
    service.addShape(makeShape({ pageNumber: 1 }));
    service.currentPage.set(1);
    expect(service.shapesOnCurrentPage().length).toBe(2);
    service.currentPage.set(2);
    expect(service.shapesOnCurrentPage().length).toBe(1);
  });

  // ── Navigation ────────────────────────────────────────────────
  it('navigateTo() should clamp to valid page range', () => {
    service.totalPages.set(10);
    service.navigateTo(0);
    expect(service.currentPage()).toBe(1);
    service.navigateTo(999);
    expect(service.currentPage()).toBe(10);
    service.navigateTo(5);
    expect(service.currentPage()).toBe(5);
  });

  // ── Zoom ──────────────────────────────────────────────────────
  it('zoomIn/zoomOut should clamp', () => {
    service.zoom.set(4.9);
    service.zoomIn(); service.zoomIn();
    expect(service.zoom()).toBe(5);     // max

    service.zoom.set(0.3);
    service.zoomOut(); service.zoomOut(); service.zoomOut();
    expect(service.zoom()).toBe(0.25);  // min
  });

  it('zoomFit() should reset to 1.0', () => {
    service.zoom.set(2.5);
    service.zoomFit();
    expect(service.zoom()).toBe(1.0);
  });

  // ── Annotations saved ─────────────────────────────────────────
  it('setAnnotationsSaved() should clear dirty flag', () => {
    service.addShape(makeShape());
    expect(service.dirty()).toBe(true);
    service.setAnnotationsSaved([]);
    expect(service.dirty()).toBe(false);
  });

  // ── Undo stack cap ────────────────────────────────────────────
  it('undo stack should cap at 20 entries', () => {
    for (let i = 0; i < 25; i++) service.addShape(makeShape());
    // Stack cap is 19, so max 20 undos
    let undoCount = 0;
    while (service.canUndo()) { service.undo(); undoCount++; }
    expect(undoCount).toBeLessThanOrEqual(20);
  });
});

describe('ViewerStateService undo/redo', () => {
  let service: ViewerStateService;

  const shape = (id: string): ShapeData =>
    ({ id, tool: 'rect', pageNumber: 1, color: '#f00', strokeWidth: 2, opacity: 0 });

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ViewerStateService] });
    service = TestBed.inject(ViewerStateService);
  });

  it('cannot redo before anything has been undone', () => {
    service.addShape(shape('a'));
    expect(service.canRedo()).toBe(false);
  });

  it('redo restores what undo removed', () => {
    service.addShape(shape('a'));
    service.addShape(shape('b'));

    service.undo();
    expect(service.shapes().map(s => s.id)).toEqual(['a']);
    expect(service.canRedo()).toBe(true);

    service.redo();
    expect(service.shapes().map(s => s.id)).toEqual(['a', 'b']);
    expect(service.canRedo()).toBe(false);
  });

  it('walks back and forward through several steps', () => {
    ['a', 'b', 'c'].forEach(id => service.addShape(shape(id)));

    service.undo(); service.undo();
    expect(service.shapes().map(s => s.id)).toEqual(['a']);

    service.redo(); service.redo();
    expect(service.shapes().map(s => s.id)).toEqual(['a', 'b', 'c']);
  });

  it('a new edit after undo abandons the redo branch', () => {
    service.addShape(shape('a'));
    service.addShape(shape('b'));
    service.undo();
    expect(service.canRedo()).toBe(true);

    // Diverging from the undone state must not leave 'b' redoable.
    service.addShape(shape('c'));

    expect(service.canRedo()).toBe(false);
    expect(service.shapes().map(s => s.id)).toEqual(['a', 'c']);
  });

  it('redo is a no-op when there is nothing to redo', () => {
    service.addShape(shape('a'));
    const before = service.shapes();
    service.redo();
    expect(service.shapes()).toBe(before);
  });

  it('undo is a no-op on an empty history', () => {
    expect(() => service.undo()).not.toThrow();
    expect(service.shapes()).toEqual([]);
  });
});

describe('ViewerStateService rotation', () => {
  let service: ViewerStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ViewerStateService] });
    service = TestBed.inject(ViewerStateService);
  });

  it('steps through quarter turns and wraps back to zero', () => {
    expect(service.rotation()).toBe(0);
    service.rotateClockwise(); expect(service.rotation()).toBe(90);
    service.rotateClockwise(); expect(service.rotation()).toBe(180);
    service.rotateClockwise(); expect(service.rotation()).toBe(270);
    service.rotateClockwise(); expect(service.rotation()).toBe(0);
  });

  it('reports a swapped footprint only on quarter turns', () => {
    expect(service.isQuarterTurned()).toBe(false);
    service.rotateClockwise(); expect(service.isQuarterTurned()).toBe(true);
    service.rotateClockwise(); expect(service.isQuarterTurned()).toBe(false);
    service.rotateClockwise(); expect(service.isQuarterTurned()).toBe(true);
  });

  it('resets to zero', () => {
    service.rotateClockwise();
    service.resetRotation();
    expect(service.rotation()).toBe(0);
  });
});
