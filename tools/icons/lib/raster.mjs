/**
 * A tiny anti-aliased polygon rasteriser.
 *
 * Written rather than taken from a library because the application icons have
 * to be provably our own work (CLAUDE.md §17.1, §17.4): the mark they replace
 * is a third-party trademark, and swapping one asset of uncertain provenance
 * for another would not fix the finding. Every pixel here comes from geometry
 * in this repository.
 *
 * It fills polygons and nothing else. That is enough for the mark, and a
 * general 2D renderer would be a dependency — which needs approval (§0.3) for
 * a build-time script that produces nine files.
 */

/** Supersampling factor per axis. 4 means 16 coverage samples per pixel. */
const SAMPLES_PER_AXIS = 4;

/**
 * Even-odd ray casting.
 *
 * @param {Array<[number, number]>} polygon vertices in pixel space
 */
function isInside(polygon, x, y) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    // The `!==` on the vertical comparison is what stops a vertex exactly on
    // the ray being counted twice, which would punch a hole in the fill.
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export class Canvas {

  constructor(size) {
    this.size = size;
    /** RGBA, 8 bits per channel, row major. */
    this.pixels = new Uint8ClampedArray(size * size * 4);
  }

  /** Fill every pixel — the opaque ground a maskable icon needs. */
  fill([red, green, blue]) {
    for (let index = 0; index < this.pixels.length; index += 4) {
      this.pixels[index] = red;
      this.pixels[index + 1] = green;
      this.pixels[index + 2] = blue;
      this.pixels[index + 3] = 255;
    }
  }

  /**
   * Composite one polygon over what is already there.
   *
   * Coverage is measured by supersampling rather than by an analytic area,
   * because a wrong analytic edge case shows up as a visible notch at 512px
   * and as nothing at all at 16px — the size where it would be found last.
   *
   * @param {Array<[number, number]>} polygon vertices in 0..1 of the canvas
   */
  fillPolygon(polygon, [red, green, blue]) {
    const scaled = polygon.map(([x, y]) => [x * this.size, y * this.size]);

    const xs = scaled.map(([x]) => x);
    const ys = scaled.map(([, y]) => y);
    const left = Math.max(0, Math.floor(Math.min(...xs)));
    const right = Math.min(this.size - 1, Math.ceil(Math.max(...xs)));
    const top = Math.max(0, Math.floor(Math.min(...ys)));
    const bottom = Math.min(this.size - 1, Math.ceil(Math.max(...ys)));

    const step = 1 / SAMPLES_PER_AXIS;
    const total = SAMPLES_PER_AXIS * SAMPLES_PER_AXIS;

    for (let pixelY = top; pixelY <= bottom; pixelY += 1) {
      for (let pixelX = left; pixelX <= right; pixelX += 1) {
        let hits = 0;
        for (let subY = 0; subY < SAMPLES_PER_AXIS; subY += 1) {
          for (let subX = 0; subX < SAMPLES_PER_AXIS; subX += 1) {
            const sampleX = pixelX + (subX + 0.5) * step;
            const sampleY = pixelY + (subY + 0.5) * step;
            if (isInside(scaled, sampleX, sampleY)) hits += 1;
          }
        }
        if (hits === 0) continue;

        const coverage = hits / total;
        const at = (pixelY * this.size + pixelX) * 4;
        this.pixels[at] = red * coverage + this.pixels[at] * (1 - coverage);
        this.pixels[at + 1] = green * coverage + this.pixels[at + 1] * (1 - coverage);
        this.pixels[at + 2] = blue * coverage + this.pixels[at + 2] * (1 - coverage);
        this.pixels[at + 3] = 255 * coverage + this.pixels[at + 3] * (1 - coverage);
      }
    }
  }
}

/**
 * A rectangle with independently rounded corners, as a polygon.
 *
 * Corners are approximated with `segments` line segments each. Sixteen is
 * indistinguishable from a true arc at 512px and far beyond what 16px can
 * show, so one value serves every size.
 *
 * @param {{corners?: {topLeft?: number, topRight?: number,
 *                     bottomRight?: number, bottomLeft?: number}}} options
 */
export function roundedRect(x, y, width, height, radius, options = {}) {
  const corners = {
    topLeft: radius, topRight: radius, bottomRight: radius, bottomLeft: radius,
    ...(options.corners ?? {}),
  };
  const segments = 16;
  const points = [];

  const arc = (centreX, centreY, cornerRadius, fromAngle) => {
    if (cornerRadius <= 0) {
      points.push([centreX, centreY]);
      return;
    }
    for (let step = 0; step <= segments; step += 1) {
      const angle = fromAngle + (Math.PI / 2) * (step / segments);
      points.push([
        centreX + cornerRadius * Math.cos(angle),
        centreY + cornerRadius * Math.sin(angle),
      ]);
    }
  };

  // Clockwise from the top-left, in screen coordinates (y grows downward).
  arc(x + corners.topLeft, y + corners.topLeft, corners.topLeft, Math.PI);
  arc(x + width - corners.topRight, y + corners.topRight, corners.topRight, -Math.PI / 2);
  arc(x + width - corners.bottomRight, y + height - corners.bottomRight,
    corners.bottomRight, 0);
  arc(x + corners.bottomLeft, y + height - corners.bottomLeft,
    corners.bottomLeft, Math.PI / 2);

  return points;
}
