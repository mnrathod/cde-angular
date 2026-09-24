#!/usr/bin/env node
/**
 * Fails the build when the shipped JavaScript exceeds §7.1's size budgets.
 *
 * §7.1 states two numbers: the initial bundle is under 250 kB gzipped, and a
 * route chunk is under 100 kB. Neither was enforced. `angular.json` carried
 * the CLI's default budgets — 500 kB warning, 1 MB error — which are measured
 * on the *raw* bytes, so the configured gate sat roughly eight times looser
 * than the standard it was supposed to represent and had never once fired.
 *
 * This measures what the browser actually pulls down, which is the gzipped
 * size, and reads it off the built artifact rather than off the config,
 * because the artifact is what ships and the config only says what it says.
 *
 * Sizes here are kB of 1000 bytes, matching how the standard and the Angular
 * CLI both report them. That is the tighter reading of the two — 250 kB is
 * 250,000 bytes, not 256,000 — so a bundle that passes this passes either.
 *
 * Run with: npm run check:bundle-budget
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, relative } from 'node:path';

const BUNDLE = join(process.cwd(), 'dist', 'cde-web', 'browser');

export const INITIAL_BUDGET_BYTES = 250_000;
export const ROUTE_CHUNK_BUDGET_BYTES = 100_000;

/**
 * The two dependencies that cannot fit inside a route-chunk budget, and the
 * ceiling each one is held to instead.
 *
 * <p>three.js and pdf.js are the 3D and PDF engines. They are the viewer, so
 * "make them smaller" is not an available move, and both are already loaded
 * lazily and only on the route that needs one — a user who never opens a
 * model never fetches three.js. Writing them off with a blanket waiver would
 * leave the largest two things we ship completely ungated, so each gets its
 * own ceiling set just above its measured size: a patch release can grow a
 * little, a careless import of the whole library cannot.
 *
 * <p>Identified by a fragment of their own source rather than by filename.
 * Chunk filenames carry a content hash and change on every build, so a
 * filename-keyed exception would silently stop matching — and a stale
 * exception that matches nothing reads exactly like a passing check.
 */
export const VENDOR_ENGINES = [
  {
    name: 'three.js',
    // GLSL from three's own shader library. Nothing we author contains it.
    identifiedBy: /varying vec3 vViewPosition/,
    ceilingBytes: 200_000,
    measured: '187 kB gzipped on 2026-09-24',
    servesRoute: 'viewer3d',
  },
  {
    name: 'pdf.js',
    identifiedBy: /PDFWorker/,
    ceilingBytes: 160_000,
    measured: '149 kB gzipped on 2026-09-24',
    servesRoute: 'viewer',
  },
];

/**
 * Which files the browser fetches before it can render anything.
 *
 * <p>Read out of `index.html` rather than inferred from filenames: the entry
 * points and their preloaded chunks are precisely what the document asks for,
 * and that stays true however the CLI decides to name or split them.
 */
export function initialScriptsFrom(indexHtml) {
  const referenced = indexHtml.matchAll(/(?:src|href)="([^"]+\.js)"/g);
  return [...new Set([...referenced].map((match) => match[1]))];
}

export function gzippedSize(source) {
  return gzipSync(source).length;
}

/**
 * Applies both budgets to one built bundle.
 *
 * <p>Takes the already-read chunks so the rules can be tested without a
 * build: a gate whose logic is only reachable by producing a 400 kB artifact
 * first is a gate nobody writes a failing case for.
 */
export function assessBundle({ initialNames, chunks }) {
  const failures = [];
  const notes = [];

  const initial = chunks.filter((chunk) => initialNames.includes(chunk.name));
  const missing = initialNames.filter(
    (name) => !chunks.some((chunk) => chunk.name === name)
  );
  for (const name of missing) {
    failures.push(
      `index.html asks for ${name}, which is not in the bundle. Either the ` +
      'build is incomplete or this check is reading the wrong directory.'
    );
  }

  const initialBytes = initial.reduce((sum, chunk) => sum + chunk.gzipBytes, 0);
  if (initialBytes > INITIAL_BUDGET_BYTES) {
    failures.push(
      `The initial bundle is ${kb(initialBytes)} gzipped, over §7.1's ` +
      `${kb(INITIAL_BUDGET_BYTES)} budget, across ${initial.length} files: ` +
      initial.map((chunk) => `${chunk.name} ${kb(chunk.gzipBytes)}`).join(', ')
    );
  }
  notes.push(`initial ${kb(initialBytes)} / ${kb(INITIAL_BUDGET_BYTES)}`);

  for (const chunk of chunks) {
    if (initialNames.includes(chunk.name)) continue;

    const engine = VENDOR_ENGINES.find((candidate) =>
      candidate.identifiedBy.test(chunk.source)
    );

    if (!engine) {
      if (chunk.gzipBytes > ROUTE_CHUNK_BUDGET_BYTES) {
        failures.push(
          `${chunk.name} is ${kb(chunk.gzipBytes)} gzipped, over §7.1's ` +
          `${kb(ROUTE_CHUNK_BUDGET_BYTES)} route-chunk budget. Split the ` +
          'route, defer what first paint does not need, or — if this is a ' +
          'third-party engine that genuinely cannot be smaller — add it to ' +
          'VENDOR_ENGINES with its own ceiling and say which route needs it.'
        );
      }
      continue;
    }

    if (chunk.gzipBytes > engine.ceilingBytes) {
      failures.push(
        `${engine.name} (${chunk.name}) is ${kb(chunk.gzipBytes)} gzipped, ` +
        `over its ${kb(engine.ceilingBytes)} ceiling — it was ` +
        `${engine.measured}. It is exempt from the route-chunk budget ` +
        `because it is the ${engine.servesRoute} engine, not because it is ` +
        'allowed to grow without anyone noticing.'
      );
    }
    notes.push(
      `${engine.name} ${kb(chunk.gzipBytes)} / ${kb(engine.ceilingBytes)}`
    );
  }

  const unmatched = VENDOR_ENGINES.filter(
    (engine) => !chunks.some((chunk) => engine.identifiedBy.test(chunk.source))
  );
  for (const engine of unmatched) {
    failures.push(
      `No chunk matches the ${engine.name} exception any more. Either it is ` +
      'no longer bundled, in which case delete the exception, or its source ' +
      'changed and the exception now silently matches nothing — which would ' +
      'leave the largest chunk in the bundle ungated.'
    );
  }

  return { failures, notes };
}

function kb(bytes) {
  return `${(bytes / 1000).toFixed(1)} kB`;
}

function readBundle(directory) {
  return readdirSync(directory)
    .filter((name) => name.endsWith('.js'))
    .map((name) => {
      const source = readFileSync(join(directory, name), 'utf8');
      return { name, source, gzipBytes: gzippedSize(source) };
    });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!existsSync(BUNDLE)) {
    console.error(
      `\nNo bundle at ${relative(process.cwd(), BUNDLE)}.\n\n` +
      'This gate measures the built output, so it has nothing to weigh until\n' +
      '`ng build` has run. Failing rather than passing: a size check that\n' +
      'skips itself when the artifact is missing reports every unbuilt\n' +
      'branch as within budget.\n'
    );
    process.exit(1);
  }

  const chunks = readBundle(BUNDLE);
  const initialNames = initialScriptsFrom(
    readFileSync(join(BUNDLE, 'index.html'), 'utf8')
  );
  const { failures, notes } = assessBundle({ initialNames, chunks });

  if (failures.length > 0) {
    console.error('\nThe bundle is over budget (§7.1):\n');
    for (const failure of failures) console.error(`  ${failure}\n`);
    process.exit(1);
  }

  console.log(`Bundle within budget — ${notes.join(', ')}.`);
}
