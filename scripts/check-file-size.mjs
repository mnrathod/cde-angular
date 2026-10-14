#!/usr/bin/env node
/**
 * Fails on a source file over §3.3's length limits.
 *
 * <p>§3.3 sets two: 400 lines for any file, 200 for an Angular component.
 * Nothing checked either, and the consequence was not hypothetical — the
 * keyboard route added for SC 2.5.7 pushed `markup-drawing-session.ts` to 460
 * lines and `markup-engine.service.ts` to 434, both hard limits crossed, and
 * the only thing that noticed was a later reading of the architecture document
 * against the code. A limit nothing measures is a limit that holds until
 * somebody is in a hurry.
 *
 * <p>**It ships with a baseline, and the baseline is large.** Seventeen files
 * were already over when this was written. Failing all of them on day one is
 * how a gate gets switched off, so each is recorded at its measured length and
 * may only shrink: a file on the baseline that grows fails, and a file that
 * comes back inside the limit fails until its entry is deleted. Same ratcheting
 * floor as `check-i18n-markup.mjs` and the coverage gates.
 *
 * <p>**Twelve of the seventeen are spec files, and whether §3.3's limit is
 * meant to bind them is a question for the team rather than for this script**
 * (§0.7 — flag the conflict, do not quietly pick). The limit as written says
 * "files", so that is what this measures; if the team decides a spec file of
 * independent cases is not the hazard a 500-line service is, the exclusion
 * belongs in §3.3 and then here, not as a silent condition.
 *
 * <p>A script rather than a spec, for the reason `check-i18n-markup.mjs` gives:
 * a source file pulled into the test bundle as raw text collapses to a one-line
 * module and empties the coverage denominator. The pure functions here are
 * unit-tested in `check-file-size.spec.mjs`.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Where code lives. Documentation and generated output are not code. */
export const ROOTS = ['src', 'scripts', 'tools', 'demo'];

/** Extensions that carry code. */
const CODE = ['.ts', '.mjs', '.js'];

/** Directories that hold someone else's code, or a build's output. */
const SKIP = ['node_modules', 'dist', '.angular', 'coverage', 'test-results'];

/** §3.3: files ≤ 400 lines; Angular components ≤ 200. */
export const FILE_LIMIT = 400;
export const COMPONENT_LIMIT = 200;

/**
 * The limit that applies to one path.
 *
 * <p>A component's spec is not a component — it is a file, and gets the file
 * limit. Matching on `.component.ts` alone would have given a 600-line spec a
 * 200-line limit and made the gate look absurd, which is its own way of getting
 * switched off.
 */
export function limitFor(path) {
  const isSpec = path.endsWith('.spec.ts') || path.endsWith('.spec.mjs');
  return !isSpec && path.endsWith('.component.ts') ? COMPONENT_LIMIT : FILE_LIMIT;
}

/**
 * Files already over the limit when this gate was introduced.
 *
 * <p>Delete an entry when its file comes inside the limit; lower it when the
 * file shrinks. The checks below will tell you if you forget either.
 */
export const OVER_LIMIT_BASELINE = new Map([
  // Production code. These are the debt that matters.
  ['src/app/features/embed/embed-viewer.component.ts', 245],
  ['src/app/features/viewer/pdf-viewer/pdf-markup-layer.component.ts', 218],
  ['src/app/features/viewer/markup/pdf-form-design.component.ts', 213],
  ['src/app/features/auth/login.component.ts', 201],
  ['demo/public/host.js', 401],
  // Specs. See the header: whether §3.3 binds these is an open question.
  ['src/viewer-core/markup-engine.service.spec.ts', 691],
  ['src/app/features/embed/host-commands.spec.ts', 569],
  ['src/app/features/viewer/toolbar/markup-toolbar.component.spec.ts', 499],
  ['src/app/features/viewer/markup/version-history.component.spec.ts', 497],
  ['src/app/features/embed/embed-viewer.component.spec.ts', 492],
  ['src/app/features/viewer/markup/pdf-form-design.component.spec.ts', 473],
  ['src/app/features/viewer/viewer-shell.component.spec.ts', 448],
  ['src/app/core/services/document.service.spec.ts', 441],
  ['src/app/features/viewer/pdf-viewer/pdf-viewer.component.spec.ts', 439],
  ['src/app/features/viewer/viewer3d/model-canvas.spec.ts', 424],
  ['src/app/features/viewer/markup/pdf-form.component.spec.ts', 421],
  ['src/viewer-core/markup-engine.interaction.spec.ts', 412],
]);

/**
 * Everything wrong with a set of measurements, as sentences.
 *
 * <p>Takes the measurements rather than reading the disk so the rules can be
 * tested without a fixture tree on disk — the rules are the part that decides
 * whether a build passes.
 */
export function assessSizes(measured, baseline = OVER_LIMIT_BASELINE) {
  const problems = [];

  const stale = [...baseline.keys()].filter(path => !measured.has(path));
  if (stale.length > 0) {
    problems.push(
      'The baseline names files that no longer exist. Delete these entries ' +
        'from scripts/check-file-size.mjs:\n' +
        stale.map(path => `  ${path}`).join('\n'),
    );
  }

  const nowInside = [...baseline.keys()]
    .filter(path => measured.has(path))
    .filter(path => measured.get(path) <= limitFor(path));
  if (nowInside.length > 0) {
    problems.push(
      'These are inside the limit now, so they must come off the baseline — ' +
        'it is only allowed to shrink:\n' +
        nowInside
          .map(path => `  ${path} (${measured.get(path)} ≤ ${limitFor(path)})`)
          .join('\n'),
    );
  }

  const grown = [...baseline.entries()]
    .filter(([path]) => measured.has(path))
    .filter(([path, allowed]) => measured.get(path) > allowed)
    .map(([path, allowed]) => `  ${path}: ${measured.get(path)}, was ${allowed}`);
  if (grown.length > 0) {
    problems.push(
      'These are already over the limit and have grown. The baseline only ' +
        'shrinks — split the file, or take the part you are adding elsewhere:\n' +
        grown.join('\n'),
    );
  }

  const over = [...measured.entries()]
    .filter(([path]) => !baseline.has(path))
    .filter(([path, lines]) => lines > limitFor(path))
    .sort(([, a], [, b]) => b - a)
    .map(([path, lines]) => `  ${path}: ${lines} lines, limit ${limitFor(path)}`);
  if (over.length > 0) {
    problems.push(
      'Over §3.3\'s length limit:\n' +
        over.join('\n') +
        '\n\nSplit it. A component extracts a child component or a service; a ' +
        'service extracts the cohesive piece its longest comment is about.',
    );
  }

  return problems;
}

/** Every code file under a directory, recursively. */
function codeUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (SKIP.includes(entry.name)) return [];
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return codeUnder(path);
    if (!CODE.some(extension => entry.name.endsWith(extension))) return [];
    return [relative('.', path).split(sep).join('/')];
  });
}

/**
 * Lines in a file, counting the way `wc -l` does.
 *
 * <p>A trailing newline ends the last line rather than starting an empty one,
 * so a file of one line with a newline is one line, not two. Getting this wrong
 * would put every baseline figure out by one and make the ratchet look broken
 * the first time anyone checked a number by hand.
 */
export function countLines(contents) {
  if (contents === '') return 0;
  const lines = contents.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines.length;
}

function main() {
  const measured = new Map(
    ROOTS.flatMap(codeUnder).map(path => [
      path,
      countLines(readFileSync(path, 'utf8')),
    ]),
  );

  // A sweep that measured almost nothing would pass for the worst possible
  // reason, so say out loud how much was read.
  if (measured.size < 200) {
    console.error(
      `Only ${measured.size} code files were found under ${ROOTS.join(', ')}. ` +
        'Refusing to pass: a sweep that reads almost nothing reports almost ' +
        'nothing.',
    );
    process.exit(1);
  }

  const problems = assessSizes(measured);
  if (problems.length > 0) {
    console.error(problems.join('\n\n'));
    process.exit(1);
  }

  console.log(
    `${measured.size} code files measured against §3.3's limits; ` +
      `${OVER_LIMIT_BASELINE.size} still on the baseline.`,
  );
}

if (process.argv[1] && process.argv[1].endsWith('check-file-size.mjs')) main();
