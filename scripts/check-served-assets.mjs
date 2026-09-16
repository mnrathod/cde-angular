#!/usr/bin/env node
/**
 * Fails the build if the browser bundle serves code the application cannot
 * reach.
 *
 * pdf.js ships a JavaScript interpreter — `quickjs-eval.wasm`, half a
 * megabyte of it — so that a PDF's own embedded scripts can run in a sandbox.
 * Only `pdf.sandbox.mjs` loads it, and nothing here imports that entry point,
 * so the file was being copied into every deployment and served from the
 * application origin without a single code path able to fetch it.
 *
 * That is worth a gate rather than a one-off deletion, for reasons that
 * outlast the fix. A PDF is untrusted input arriving from a stranger (§5.13),
 * and an interpreter parked on the origin is exactly the kind of thing a
 * later "just enable forms" change reaches for without anyone re-reading the
 * threat model. It is also dead weight in an air-gapped image, where every
 * megabyte is carried in by hand.
 *
 * The check runs against the built output rather than against `angular.json`,
 * because the artifact is what ships. Reading the config back would only
 * prove that the config says what it says.
 *
 * Run with: npm run check:served-assets
 */

import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const BUNDLE = join(process.cwd(), 'dist', 'cde-web', 'browser');

/**
 * Assets that must not reach the origin, and why each one is refused.
 *
 * Keyed by a filename test rather than a path, because the output layout is
 * angular.json's to decide and this should keep holding if it moves.
 */
const REFUSED = [
  {
    matches: (name) => name.startsWith('quickjs-eval.'),
    reason:
      'a JavaScript interpreter for PDF-embedded scripts. Nothing imports ' +
      'pdf.sandbox.mjs, so it is unreachable; serving it anyway puts an ' +
      'eval engine on the application origin (§5.13.9).',
  },
];

function filesUnder(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

if (!existsSync(BUNDLE)) {
  console.error(
    `\nNo bundle at ${relative(process.cwd(), BUNDLE)}.\n\n` +
    'This gate reads the built output, so it has nothing to check until\n' +
    '`ng build` has run. Failing rather than passing: a check that skips\n' +
    'itself when the artifact is missing reports success for every build\n' +
    'that never produced one.\n'
  );
  process.exit(1);
}

const files = filesUnder(BUNDLE);
const failures = [];

for (const path of files) {
  const name = path.slice(path.lastIndexOf('/') + 1);
  for (const { matches, reason } of REFUSED) {
    if (matches(name)) {
      failures.push(`${relative(process.cwd(), path)} — ${reason}`);
    }
  }
}

if (failures.length > 0) {
  console.error('\nThe bundle serves code the application cannot reach:\n');
  for (const failure of failures) console.error(`  ${failure}`);
  console.error(
    '\nExclude it from the copy in angular.json (the asset patterns take an\n' +
    '`ignore` array), or, if a feature now genuinely needs it, say so here\n' +
    'and record the threat model that permits it.\n'
  );
  process.exit(1);
}

console.log(`Bundle serves no unreachable code: ${files.length} files checked.`);
