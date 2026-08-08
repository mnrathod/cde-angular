import { Injectable } from '@angular/core';
import { PointerPoint } from './markup-engine.service';
import { ShapeData, MeasurementEntry } from './viewer-state.service';

/** Units a drawing can be calibrated to. */
export type MeasurementUnit = 'px' | 'mm' | 'cm' | 'm' | 'km' | 'in' | 'ft' | 'yd' | 'mi';

export const MEASUREMENT_UNITS: MeasurementUnit[] =
  ['mm', 'cm', 'm', 'km', 'in', 'ft', 'yd', 'mi'];

/**
 * A drawing's scale: how much real-world length one screen pixel represents.
 * `unitsPerPixel === 1` with unit 'px' means uncalibrated.
 */
export interface MeasurementScale {
  unitsPerPixel: number;
  unit:          MeasurementUnit;
}

export const UNCALIBRATED: MeasurementScale = { unitsPerPixel: 1, unit: 'px' };

/**
 * Geometry and formatting for the measurement tools.
 *
 * Kept free of Angular state and DOM so the arithmetic — which is what
 * actually has to be right on a construction drawing — can be tested
 * directly.
 */
@Injectable({ providedIn: 'root' })
export class MeasurementService {

  distance(a: PointerPoint, b: PointerPoint): number {
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  /** Total length along an open path. */
  pathLength(points: PointerPoint[]): number {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      total += this.distance(points[i - 1], points[i]);
    }
    return total;
  }

  /** Length around a closed ring — the path plus the closing segment. */
  perimeter(points: PointerPoint[]): number {
    if (points.length < 3) return this.pathLength(points);
    return this.pathLength(points) + this.distance(points[points.length - 1], points[0]);
  }

  /**
   * Area of a simple polygon by the shoelace formula. The absolute value
   * makes it independent of whether the points were clicked clockwise or
   * anticlockwise, which the user has no reason to think about.
   */
  polygonArea(points: PointerPoint[]): number {
    if (points.length < 3) return 0;
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
      const current = points[i];
      const next    = points[(i + 1) % points.length];
      sum += current.x * next.y - next.x * current.y;
    }
    return Math.abs(sum) / 2;
  }

  /**
   * Scale derived from a drawn reference line of known real-world length.
   * @param pixels length of the drawn line, in screen pixels
   */
  calibrate(pixels: number, realLength: number, unit: MeasurementUnit): MeasurementScale | null {
    if (!(pixels > 0) || !(realLength > 0)) return null;
    return { unitsPerPixel: realLength / pixels, unit };
  }

  formatLength(pixels: number, scale: MeasurementScale = UNCALIBRATED): string {
    if (scale.unit === 'px') return `${pixels.toFixed(1)} px`;
    return `${this.trim(pixels * scale.unitsPerPixel)} ${scale.unit}`;
  }

  /**
   * Area scales with the square of the linear scale — a factor easy to omit,
   * and wrong by orders of magnitude when omitted.
   */
  formatArea(squarePixels: number, scale: MeasurementScale = UNCALIBRATED): string {
    if (scale.unit === 'px') return `${squarePixels.toFixed(0)} px²`;
    const factor = scale.unitsPerPixel * scale.unitsPerPixel;
    return `${this.trim(squarePixels * factor)} ${scale.unit}²`;
  }

  /**
   * Three decimals is enough precision for a scaled drawing, but trailing
   * zeros make a readout look noisier than it is.
   */
  private trim(value: number): string {
    return Number(value.toFixed(3)).toString();
  }

  /**
   * Turns a drawn measurement into its readouts.
   *
   * Lengths are divided by zoom first so a measurement means the same thing
   * whatever zoom it was taken at, and area by zoom squared since it has two
   * dimensions. Shared by both viewers rather than reimplemented in each —
   * the scaling is exactly the part worth getting wrong only once.
   */
  describe(shape: ShapeData, scale: MeasurementScale, zoom: number): {
    shape: ShapeData;
    entry: Omit<MeasurementEntry, 'id' | 'page'>;
  } {
    const points = shape.points ?? [];
    const toPage = (pixels: number) => pixels / zoom;

    if (shape.tool === 'area') {
      const measurement = this.formatArea(this.polygonArea(points) / (zoom * zoom), scale);
      const detail      = this.formatLength(toPage(this.perimeter(points)), scale);
      return {
        shape: { ...shape, measurement, measurementDetail: detail },
        entry: { kind: 'Area', value: measurement, detail }
      };
    }

    if (shape.tool === 'radius') {
      const radius      = toPage(this.distance(points[0], points[1]));
      const measurement = this.formatLength(radius, scale);
      const detail      = this.formatLength(radius * 2, scale);
      return {
        shape: { ...shape, measurement, measurementDetail: detail },
        entry: { kind: 'Radius', value: measurement, detail }
      };
    }

    const measurement   = this.formatLength(toPage(this.pathLength(points)), scale);
    const segmentLabels = points.slice(1).map((p, i) =>
      this.formatLength(toPage(this.distance(points[i], p)), scale));
    const detail = `${Math.max(points.length - 1, 0)} segment(s)`;
    return {
      shape: { ...shape, measurement, measurementDetail: detail, segmentLabels },
      entry: { kind: 'Linear', value: measurement, detail }
    };
  }
}
