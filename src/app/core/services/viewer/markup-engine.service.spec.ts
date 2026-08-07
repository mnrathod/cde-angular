import { TestBed } from '@angular/core/testing';
import { MarkupEngineService } from './markup-engine.service';
import { ShapeData } from './viewer-state.service';

describe('MarkupEngineService', () => {
  let service: MarkupEngineService;

  const pt = { x: 100, y: 150 };
  const defaults = { pageNumber: 1, color: '#FF0000', strokeWidth: 2, opacity: 0.15 };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [MarkupEngineService] });
    service = TestBed.inject(MarkupEngineService);
  });

  // ── newId ─────────────────────────────────────────────────────
  it('newId() should return unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => service.newId()));
    expect(ids.size).toBe(100);
  });

  it('newId() should start with "s-"', () => {
    expect(service.newId()).toMatch(/^s-\d+-[a-z0-9]+$/);
  });

  // ── startShape ────────────────────────────────────────────────
  it('startShape line should set x1,y1,x2,y2', () => {
    const s = service.startShape(
      'line', pt, defaults.pageNumber, defaults.color, defaults.strokeWidth, defaults.opacity
    );
    expect(s.tool).toBe('line');
    expect(s.x1).toBe(100); expect(s.y1).toBe(150);
    expect(s.x2).toBe(100); expect(s.y2).toBe(150);
  });

  it('startShape rect should set x,y,width,height', () => {
    const s = service.startShape('rect', pt, 1, '#FF0000', 2, 0.15);
    expect(s.x).toBe(100); expect(s.y).toBe(150);
    expect(s.width).toBe(0); expect(s.height).toBe(0);
  });

  it('startShape circle should set cx,cy,r', () => {
    const s = service.startShape('circle', pt, 1, '#FF0000', 2, 0.15);
    expect(s.cx).toBe(100); expect(s.cy).toBe(150); expect(s.r).toBe(0);
  });

  it('startShape freehand should start with one point', () => {
    const s = service.startShape('freehand', pt, 1, '#FF0000', 2, 0.15);
    expect(s.points).toEqual([pt]);
  });

  // ── updateShape ───────────────────────────────────────────────
  it('updateShape line should update x2,y2', () => {
    const s  = service.startShape('line', pt, 1, '#FF0000', 2, 0.15);
    const s2 = service.updateShape(s, { x: 200, y: 300 });
    expect(s2.x2).toBe(200); expect(s2.y2).toBe(300);
    expect(s2.x1).toBe(100); // unchanged
  });

  it('updateShape rect should calculate width/height correctly', () => {
    const s  = service.startShape('rect', { x: 50, y: 50 }, 1, '#FF0000', 2, 0.15);
    const s2 = service.updateShape(s, { x: 150, y: 200 });
    expect(s2.width).toBe(100);
    expect(s2.height).toBe(150);
    expect(s2.x).toBe(50);  // min x
    expect(s2.y).toBe(50);  // min y
  });

  it('updateShape rect should handle negative drag direction', () => {
    const s  = service.startShape('rect', { x: 200, y: 200 }, 1, '#FF0000', 2, 0.15);
    const s2 = service.updateShape(s, { x: 50, y: 50 });
    expect(s2.x).toBe(50);   // min
    expect(s2.y).toBe(50);   // min
    expect(s2.width).toBe(150);
    expect(s2.height).toBe(150);
  });

  it('updateShape circle should compute radius', () => {
    const s  = service.startShape('circle', { x: 100, y: 100 }, 1, '#FF0000', 2, 0.15);
    const s2 = service.updateShape(s, { x: 103, y: 104 });
    expect(s2.r).toBeCloseTo(5, 0);  // sqrt(9+16) = 5
  });

  it('updateShape freehand should append points', () => {
    const s  = service.startShape('freehand', { x: 0, y: 0 }, 1, '#FF0000', 2, 0.15);
    const s2 = service.updateShape(s, { x: 10, y: 10 });
    const s3 = service.updateShape(s2, { x: 20, y: 20 });
    expect(s3.points?.length).toBe(3);
  });

  // ── shapeToSvg ────────────────────────────────────────────────
  it('shapeToSvg line should produce <line> element', () => {
    const s: ShapeData = { id:'t1', tool:'line', pageNumber:1, color:'#FF0000',
      strokeWidth:2, opacity:0, x1:0, y1:0, x2:100, y2:100 };
    const svg = service.shapeToSvg(s);
    expect(svg).toContain('<line');
    expect(svg).toContain('data-id="t1"');
    expect(svg).toContain('stroke="#FF0000"');
  });

  it('shapeToSvg rect should produce <rect> element', () => {
    const s: ShapeData = { id:'t2', tool:'rect', pageNumber:1, color:'#0000FF',
      strokeWidth:2, opacity:0.15, x:10, y:10, width:80, height:60 };
    const svg = service.shapeToSvg(s);
    expect(svg).toContain('<rect');
    expect(svg).toContain('width="80"');
    expect(svg).toContain('height="60"');
  });

  it('shapeToSvg circle should produce <circle> element', () => {
    const s: ShapeData = { id:'t3', tool:'circle', pageNumber:1, color:'#00FF00',
      strokeWidth:2, opacity:0, cx:50, cy:50, r:30 };
    const svg = service.shapeToSvg(s);
    expect(svg).toContain('<circle');
    expect(svg).toContain('r="30"');
  });

  it('shapeToSvg arrow should contain polygon for arrowhead', () => {
    const s: ShapeData = { id:'t4', tool:'arrow', pageNumber:1, color:'#FF0000',
      strokeWidth:2, opacity:0, x1:0, y1:0, x2:100, y2:0 };
    const svg = service.shapeToSvg(s);
    expect(svg).toContain('<polygon');
    expect(svg).toContain('<line');
  });

  it('shapeToSvg text should produce <text> element with escaped content', () => {
    const s: ShapeData = { id:'t5', tool:'text', pageNumber:1, color:'#000',
      strokeWidth:2, opacity:0, x:50, y:50, text:'Hello <World>' };
    const svg = service.shapeToSvg(s);
    expect(svg).toContain('<text');
    expect(svg).toContain('Hello &lt;World&gt;');
  });

  // ── hitTest ───────────────────────────────────────────────────
  it('hitTest should find rect at pointer inside it', () => {
    const shapes: ShapeData[] = [
      { id:'h1', tool:'rect', pageNumber:1, color:'#F00', strokeWidth:2, opacity:0,
        x:50, y:50, width:100, height:100 }
    ];
    expect(service.hitTest(shapes, { x: 100, y: 100 })).toBeTruthy();
    expect(service.hitTest(shapes, { x: 100, y: 100 })?.id).toBe('h1');
  });

  it('hitTest should miss rect at pointer outside it', () => {
    const shapes: ShapeData[] = [
      { id:'h2', tool:'rect', pageNumber:1, color:'#F00', strokeWidth:2, opacity:0,
        x:50, y:50, width:100, height:100 }
    ];
    expect(service.hitTest(shapes, { x: 200, y: 200 })).toBeNull();
  });

  it('hitTest should find circle at pointer inside radius', () => {
    const shapes: ShapeData[] = [
      { id:'h3', tool:'circle', pageNumber:1, color:'#00F', strokeWidth:2, opacity:0,
        cx:100, cy:100, r:40 }
    ];
    expect(service.hitTest(shapes, { x: 110, y: 110 })).toBeTruthy();
    expect(service.hitTest(shapes, { x: 200, y: 200 })).toBeNull();
  });

  // ── serialisation ─────────────────────────────────────────────
  it('shapesToJson / parseShapesJson should round-trip', () => {
    const shapes: ShapeData[] = [
      { id:'s1', tool:'line', pageNumber:1, color:'#F00', strokeWidth:2, opacity:0,
        x1:0, y1:0, x2:100, y2:100 }
    ];
    const json   = service.shapesToJson(shapes);
    const parsed = service.parseShapesJson(json);
    expect(parsed.length).toBe(1);
    expect(parsed[0].id).toBe('s1');
    expect(parsed[0].tool).toBe('line');
  });

  it('parseShapesJson should return [] for invalid JSON', () => {
    expect(service.parseShapesJson('not json')).toEqual([]);
    expect(service.parseShapesJson('')).toEqual([]);
  });
});
