/**
 * The shared vocabulary of the markup layer: a point, and the measurement
 * palette.
 *
 * Extracted so `svg-primitives.ts` and `markup-engine.service.ts` can both use
 * them without importing each other — the service delegates to the primitives,
 * so a dependency the other way would be a cycle.
 */

export interface PointerPoint { x: number; y: number; }

/**
 * Measurements are drawn in a fixed palette so they stay distinct from markup.
 *
 * A measurement is a readout rather than an annotation, and has to stay
 * legible over whatever markup is already on the drawing.
 */
export const MEASURE_COLOUR = '#34d399';
export const MEASURE_COLOUR_DIM = '#6ee7b7';
export const MEASURE_FILL = 'rgba(52,211,153,0.10)';
export const CALIBRATION_COLOUR = '#fbbf24';
