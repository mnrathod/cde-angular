import { TestBed } from '@angular/core/testing';
import { ViewerStateService, ShapeData } from '../../core/services/viewer/viewer-state.service';

const makeShape = (overrides: Partial<ShapeData> = {}): ShapeData => ({
  id: `s-${Math.random()}`, tool: 'rect', pageNumber: 1,
  color: '#FF0000', strokeWidth: 2, opacity: 0.15,
  x: 10, y: 10, width: 100, height: 50,
  ...overrides
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
    expect(service.dirty()).toBeFalse();
    expect(service.canUndo()).toBeFalse();
  });

  // ── Shape management ──────────────────────────────────────────
  it('addShape() should add to shapes and set dirty', () => {
    const s = makeShape();
    service.addShape(s);
    expect(service.shapes().length).toBe(1);
    expect(service.dirty()).toBeTrue();
  });

  it('addShape() should push undo snapshot', () => {
    service.addShape(makeShape());
    expect(service.canUndo()).toBeTrue();
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
    expect(service.shapes()[0].color).toBe('#0000FF');
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
    expect(service.dirty()).toBeTrue();
    service.setAnnotationsSaved([]);
    expect(service.dirty()).toBeFalse();
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
