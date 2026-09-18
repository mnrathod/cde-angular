#!/usr/bin/env node
/**
 * Fails on user-facing text that no translator will ever see.
 *
 * <p>§1.4 says "no hardcoded user-facing strings". A rule like that decays
 * the moment it stops being checked — one unmarked label per pull request and
 * within a quarter the catalogue is fiction and the next translation costs as
 * much as the first. So every component template is parsed with Angular's own
 * parser and checked for text carrying no `i18n`.
 *
 * <p>**This is a script rather than a spec, and that is load-bearing.** It
 * began as one, reading sources through `import.meta.glob(..., '?raw')`. That
 * silently destroyed the coverage measurement: a source file pulled into the
 * test bundle as raw text resolves to a one-line string module, so every
 * component no test loads dropped to zero countable lines and reported
 * coverage rose from 43.7% to 69.7% without a single new test. Reading the
 * files from disk, outside the bundle, is what keeps both gates honest.
 *
 * <p>**It ships with a baseline**, because turning this on across an
 * application that was never internationalised would fail on day one and get
 * switched off by the second. The baseline only shrinks: a file not on it
 * must be clean, and a file on it must still be dirty, so it cannot decay
 * into a permanent exemption nobody revisits. Same ratcheting floor as the
 * coverage gates.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { extractInlineTemplate } from './i18n/component-templates.mjs';
import { findUnmarkedStrings } from './i18n/template-strings.mjs';

/** Where component sources live. */
const ROOTS = ['src/app', 'src/viewer-core'];

/**
 * Templates that predate internationalisation and are not marked up yet.
 *
 * <p>Delete an entry when its component is marked up. The staleness check
 * below will tell you if you forget.
 */
const NOT_YET_TRANSLATED = new Set([
]);

/** Every non-spec TypeScript file under a directory, recursively. */
function sourcesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourcesUnder(path);
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.spec.ts')) return [];
    return [relative('.', path).split(sep).join('/')];
  });
}

/** Path to inline template, for every component that declares one. */
const templates = new Map(
  ROOTS.flatMap(sourcesUnder)
    .map(path => [path, extractInlineTemplate(readFileSync(path, 'utf8'))])
    .filter(([, template]) => template !== undefined),
);

const problems = [];

// A sweep that finds nothing because it read nothing would pass for the worst
// possible reason, so say out loud how much was actually examined.
if (templates.size < 20) {
  problems.push(
    `Only ${templates.size} component templates were found under ${ROOTS.join(
      ', ',
    )}. That is too few to be right — the scan is not reading what it should.`,
  );
}

const stale = [...NOT_YET_TRANSLATED].filter(path => !templates.has(path));
if (stale.length > 0) {
  problems.push(
    'The baseline names templates that no longer exist. Delete these lines ' +
      `from ${relative('.', new URL(import.meta.url).pathname)}:\n` +
      stale.map(path => `  ${path}`).join('\n'),
  );
}

const nowClean = [...NOT_YET_TRANSLATED]
  .filter(path => templates.has(path))
  .filter(path => findUnmarkedStrings(templates.get(path), path).length === 0);
if (nowClean.length > 0) {
  problems.push(
    'These are marked up now, so they must come off the baseline — it is ' +
      'only allowed to shrink:\n' +
      nowClean.map(path => `  ${path}`).join('\n'),
  );
}

const unmarked = [...templates.keys()]
  .filter(path => !NOT_YET_TRANSLATED.has(path))
  .sort()
  .flatMap(path =>
    findUnmarkedStrings(templates.get(path), path).map(
      found =>
        `  ${path}:${found.line}  ` +
        (found.attribute ? `${found.attribute}="${found.text}"` : found.text),
    ),
  );
if (unmarked.length > 0) {
  problems.push(
    'User-facing text with no i18n marking:\n' +
      unmarked.join('\n') +
      '\n\nAdd i18n (or i18n-<attribute>) with a stable @@id, then run ' +
      '`npm run i18n:extract`.',
  );
}

if (problems.length > 0) {
  console.error(problems.join('\n\n'));
  process.exit(1);
}

console.log(
  `${templates.size} component templates checked; ` +
    `${NOT_YET_TRANSLATED.size} still on the baseline.`,
);
