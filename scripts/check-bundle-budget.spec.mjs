import { describe, it, expect } from 'vitest';
import {
  assessBundle,
  initialScriptsFrom,
  INITIAL_BUDGET_BYTES,
  ROUTE_CHUNK_BUDGET_BYTES,
  VENDOR_ENGINES,
} from './check-bundle-budget.mjs';

const three = VENDOR_ENGINES.find((engine) => engine.name === 'three.js');
const pdf = VENDOR_ENGINES.find((engine) => engine.name === 'pdf.js');

/**
 * A bundle shaped like the real one: two entry points the document asks for,
 * a route chunk, and both vendor engines present so the "exception no longer
 * matches" rule is satisfied unless a case deliberately removes one.
 */
function bundle({
  initialBytes = 120_000,
  routeChunkBytes = 60_000,
  threeBytes = three.ceilingBytes - 10_000,
  pdfBytes = pdf.ceilingBytes - 10_000,
  omit = [],
} = {}) {
  const chunks = [
    { name: 'main.js', source: 'app()', gzipBytes: initialBytes },
    { name: 'route-viewer.js', source: 'viewer()', gzipBytes: routeChunkBytes },
    {
      name: 'chunk-three.js',
      source: 'varying vec3 vViewPosition;',
      gzipBytes: threeBytes,
    },
    { name: 'chunk-pdf.js', source: 'class PDFWorker {}', gzipBytes: pdfBytes },
  ].filter((chunk) => !omit.includes(chunk.name));

  return { initialNames: ['main.js'], chunks };
}

describe('reading which files the browser fetches first', () => {
  it('takes the entry points and preloads named by the document', () => {
    const html =
      '<link rel="modulepreload" href="chunk-abc.js">' +
      '<script src="polyfills-def.js" type="module"></script>' +
      '<script src="main-ghi.js" type="module"></script>';

    expect(initialScriptsFrom(html)).toEqual([
      'chunk-abc.js',
      'polyfills-def.js',
      'main-ghi.js',
    ]);
  });

  it('does not count a stylesheet as script weight', () => {
    expect(initialScriptsFrom('<link rel="stylesheet" href="styles.css">'))
      .toEqual([]);
  });

  it('counts a file asked for twice only once', () => {
    const html =
      '<link rel="modulepreload" href="main.js">' +
      '<script src="main.js" type="module"></script>';

    expect(initialScriptsFrom(html)).toEqual(['main.js']);
  });
});

describe('the initial bundle budget', () => {
  it('passes a bundle inside every budget', () => {
    expect(assessBundle(bundle()).failures).toEqual([]);
  });

  it('fails when the initial bundle exceeds 250 kB gzipped', () => {
    const { failures } = assessBundle(
      bundle({ initialBytes: INITIAL_BUDGET_BYTES + 1 })
    );

    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('initial bundle');
    expect(failures[0]).toContain('250.0 kB');
  });

  it('adds the initial files together rather than weighing each alone', () => {
    // Two files, each comfortably inside the budget, that are over it
    // together. Measuring them one at a time is the mistake this catches:
    // the browser fetches both before it renders anything.
    const half = INITIAL_BUDGET_BYTES / 2 + 1_000;
    const { failures } = assessBundle({
      initialNames: ['main.js', 'polyfills.js'],
      chunks: [
        { name: 'main.js', source: 'app()', gzipBytes: half },
        { name: 'polyfills.js', source: 'fill()', gzipBytes: half },
        {
          name: 'chunk-three.js',
          source: 'varying vec3 vViewPosition;',
          gzipBytes: 1_000,
        },
        { name: 'chunk-pdf.js', source: 'PDFWorker', gzipBytes: 1_000 },
      ],
    });

    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('initial bundle');
  });

  it('fails when the document asks for a file the bundle does not have', () => {
    const { failures } = assessBundle({
      ...bundle(),
      initialNames: ['main.js', 'vanished.js'],
    });

    expect(failures.some((line) => line.includes('vanished.js'))).toBe(true);
  });
});

describe('the route chunk budget', () => {
  it('fails a route chunk over 100 kB gzipped', () => {
    const { failures } = assessBundle(
      bundle({ routeChunkBytes: ROUTE_CHUNK_BUDGET_BYTES + 1 })
    );

    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('route-viewer.js');
    expect(failures[0]).toContain('route-chunk budget');
  });

  it('holds a route chunk to the budget even when it is not the largest', () => {
    // three.js is far bigger and exempt. A check that only looked at the
    // heaviest chunk, or that stopped at the first exception it matched,
    // would let this one through.
    const { failures } = assessBundle(
      bundle({ routeChunkBytes: ROUTE_CHUNK_BUDGET_BYTES + 1 })
    );

    expect(failures.some((line) => line.includes('route-viewer.js'))).toBe(true);
  });
});

describe('the vendor engines held to their own ceiling', () => {
  it('lets three.js past the route budget it cannot meet', () => {
    const { failures } = assessBundle(
      bundle({ threeBytes: ROUTE_CHUNK_BUDGET_BYTES * 1.5 })
    );

    expect(failures).toEqual([]);
  });

  it('fails three.js when it grows past its own ceiling', () => {
    const { failures } = assessBundle(
      bundle({ threeBytes: three.ceilingBytes + 1 })
    );

    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('three.js');
    expect(failures[0]).toContain('viewer3d');
  });

  it('fails pdf.js when it grows past its own ceiling', () => {
    const { failures } = assessBundle(
      bundle({ pdfBytes: pdf.ceilingBytes + 1 })
    );

    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('pdf.js');
  });

  it('fails when an exception stops matching anything', () => {
    // The failure mode this exists for: the exception is keyed on a fragment
    // of the engine's source, and if that fragment changes the exception
    // quietly matches nothing. Nothing else would report it — the engine
    // would just start failing the route budget, or, worse, a renamed chunk
    // would go unweighed while the check still printed a pass.
    const { failures } = assessBundle(bundle({ omit: ['chunk-three.js'] }));

    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('No chunk matches the three.js exception');
  });

  it('reports the measured size so the ceiling can be judged', () => {
    const { notes } = assessBundle(bundle());

    expect(notes.some((note) => note.startsWith('three.js'))).toBe(true);
    expect(notes.some((note) => note.startsWith('pdf.js'))).toBe(true);
  });
});
