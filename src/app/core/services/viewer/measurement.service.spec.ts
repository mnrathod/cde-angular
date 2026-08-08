import { TestBed } from '@angular/core/testing';
import { MeasurementService, UNCALIBRATED, MeasurementScale } from './measurement.service';
import { ShapeData } from './viewer-state.service';

/**
 * The arithmetic here is what a quantity surveyor would act on, so the
 * assertions use figures that are checkable by hand — a 3-4-5 triangle, a
 * unit square, a 10x20 rectangle — rather than whatever the code happens to
 * return.
 */
describe('MeasurementService', () => {
  let service: MeasurementService;

  const metres = (unitsPerPixel: number): MeasurementScale => ({ unitsPerPixel, unit: 'm' });

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [MeasurementService] });
    service = TestBed.inject(MeasurementService);
  });

  describe('distance', () => {
    it('measures a 3-4-5 triangle hypotenuse', () => {
      expect(service.distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    });

    it('is zero for a point measured against itself', () => {
      expect(service.distance({ x: 7, y: 7 }, { x: 7, y: 7 })).toBe(0);
    });
  });

  describe('pathLength', () => {
    it('sums the segments of an open path', () => {
      expect(service.pathLength([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 14 }])).toBe(15);
    });

    it('is zero for fewer than two points', () => {
      expect(service.pathLength([])).toBe(0);
      expect(service.pathLength([{ x: 1, y: 1 }])).toBe(0);
    });
  });

  describe('perimeter', () => {
    it('closes the ring — a 10x20 rectangle is 60 around', () => {
      const rectangle = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }, { x: 0, y: 20 }];
      expect(service.perimeter(rectangle)).toBe(60);
    });

    it('falls back to path length when there is no ring to close', () => {
      expect(service.perimeter([{ x: 0, y: 0 }, { x: 3, y: 4 }])).toBe(5);
    });
  });

  describe('polygonArea', () => {
    it('measures a unit square', () => {
      expect(service.polygonArea(
        [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }])).toBe(1);
    });

    it('measures a 10x20 rectangle', () => {
      expect(service.polygonArea(
        [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }, { x: 0, y: 20 }])).toBe(200);
    });

    it('measures a triangle as half its bounding box', () => {
      expect(service.polygonArea([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }])).toBe(50);
    });

    it('does not depend on winding direction', () => {
      const clockwise = [{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 0 }];
      const anticlock = [...clockwise].reverse();
      expect(service.polygonArea(clockwise)).toBe(service.polygonArea(anticlock));
    });

    it('handles a concave polygon', () => {
      // An L-shape: a 10x10 square with a 5x5 bite taken out of it.
      const lShape = [
        { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 },
        { x: 5, y: 5 }, { x: 5, y: 10 }, { x: 0, y: 10 }
      ];
      expect(service.polygonArea(lShape)).toBe(75);
    });

    it('is zero for a degenerate polygon', () => {
      expect(service.polygonArea([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(0);
    });
  });

  describe('calibrate', () => {
    it('derives units per pixel from a reference line', () => {
      // 100px drawn over a known 5m span.
      expect(service.calibrate(100, 5, 'm')).toEqual({ unitsPerPixel: 0.05, unit: 'm' });
    });

    it('rejects a zero-length reference line', () => {
      expect(service.calibrate(0, 5, 'm')).toBeNull();
    });

    it('rejects a non-positive real-world distance', () => {
      expect(service.calibrate(100, 0, 'm')).toBeNull();
      expect(service.calibrate(100, -5, 'm')).toBeNull();
    });
  });

  describe('formatLength', () => {
    it('reports pixels when uncalibrated', () => {
      expect(service.formatLength(123.456, UNCALIBRATED)).toBe('123.5 px');
    });

    it('applies the scale once', () => {
      expect(service.formatLength(100, metres(0.05))).toBe('5 m');
    });

    it('trims trailing zeros', () => {
      expect(service.formatLength(40, metres(0.05))).toBe('2 m');
    });
  });

  describe('formatArea', () => {
    it('reports square pixels when uncalibrated', () => {
      expect(service.formatArea(2500, UNCALIBRATED)).toBe('2500 px²');
    });

    it('squares the scale — this is the easy one to get wrong', () => {
      // 10000 px² at 1px = 0.05m is 10000 * 0.05² = 25 m², not 500 m².
      expect(service.formatArea(10000, metres(0.05))).toBe('25 m²');
    });
  });

  describe('describe', () => {
    const shape = (tool: ShapeData['tool'], points: Array<{ x: number; y: number }>): ShapeData =>
      ({ id: 'm1', tool, pageNumber: 1, color: '#000', strokeWidth: 2, opacity: 0, points });

    it('reports total length and per-segment labels for a linear measurement', () => {
      const result = service.describe(
        shape('dimension', [{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 14 }]),
        UNCALIBRATED, 1);

      expect(result.shape.measurement).toBe('15.0 px');
      expect(result.shape.segmentLabels).toEqual(['5.0 px', '10.0 px']);
      expect(result.entry.kind).toBe('Linear');
    });

    it('reports area with perimeter as its detail', () => {
      const result = service.describe(
        shape('area', [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }, { x: 0, y: 20 }]),
        UNCALIBRATED, 1);

      expect(result.shape.measurement).toBe('200 px²');
      expect(result.shape.measurementDetail).toBe('60.0 px');
      expect(result.entry.kind).toBe('Area');
    });

    it('reports radius with diameter as its detail', () => {
      const result = service.describe(
        shape('radius', [{ x: 0, y: 0 }, { x: 3, y: 4 }]), UNCALIBRATED, 1);

      expect(result.shape.measurement).toBe('5.0 px');
      expect(result.shape.measurementDetail).toBe('10.0 px');
      expect(result.entry.kind).toBe('Radius');
    });

    it('divides lengths by zoom so the result is zoom-independent', () => {
      const points = [{ x: 0, y: 0 }, { x: 0, y: 100 }];
      const atOne = service.describe(shape('dimension', points), UNCALIBRATED, 1);
      // At 2x zoom the same real span is drawn twice as long in screen px.
      const doubled = [{ x: 0, y: 0 }, { x: 0, y: 200 }];
      const atTwo = service.describe(shape('dimension', doubled), UNCALIBRATED, 2);

      expect(atTwo.shape.measurement).toBe(atOne.shape.measurement);
    });

    it('divides area by zoom squared, matching its two dimensions', () => {
      const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
      const scaled = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }];

      expect(service.describe(shape('area', scaled), UNCALIBRATED, 2).shape.measurement)
        .toBe(service.describe(shape('area', square), UNCALIBRATED, 1).shape.measurement);
    });

    it('applies calibration to a real-world reading', () => {
      const result = service.describe(
        shape('dimension', [{ x: 0, y: 0 }, { x: 0, y: 100 }]), metres(0.05), 1);

      expect(result.shape.measurement).toBe('5 m');
    });
  });
});
