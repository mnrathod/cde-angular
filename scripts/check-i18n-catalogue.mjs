#!/usr/bin/env node
/**
 * Fails if the committed message catalogue has drifted from the source.
 *
 * <p>The catalogue at `src/locale/messages.json` is generated, and generated
 * files rot the moment nothing compares them to their source. A stale one is
 * worse than none: translators work from it, so a missing entry ships an
 * untranslated string to every language at once, and a deleted entry leaves
 * a translation nobody can reach.
 *
 * <p>Same shape as the backend's OpenAPI gate — regenerate, compare, fail on
 * a difference, and print the diff so the fix is obvious. The fix is always
 * `npm run i18n:extract`.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const COMMITTED = 'src/locale/messages.json';

/** Message ID to source text, from a catalogue file. */
function readCatalogue(path) {
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  if (!parsed.translations || typeof parsed.translations !== 'object') {
    throw new Error(`${path} has no translations object`);
  }
  return parsed.translations;
}

const scratch = mkdtempSync(join(tmpdir(), 'i18n-catalogue-'));
try {
  execFileSync(
    'npx',
    ['ng', 'extract-i18n', '--output-path', scratch, '--out-file', 'messages.json'],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );

  const fresh = readCatalogue(join(scratch, 'messages.json'));
  const committed = readCatalogue(COMMITTED);

  const ids = [...new Set([...Object.keys(fresh), ...Object.keys(committed)])].sort();
  const problems = ids.flatMap(id => {
    if (!(id in committed)) return [`  + ${id}: ${JSON.stringify(fresh[id])}`];
    if (!(id in fresh)) return [`  - ${id}: ${JSON.stringify(committed[id])}`];
    if (fresh[id] !== committed[id]) {
      return [
        `  ~ ${id}`,
        `      committed: ${JSON.stringify(committed[id])}`,
        `      extracted: ${JSON.stringify(fresh[id])}`,
      ];
    }
    return [];
  });

  if (problems.length > 0) {
    console.error(`${COMMITTED} does not match the source:\n`);
    console.error(problems.join('\n'));
    console.error('\nRun `npm run i18n:extract` and commit the result.');
    process.exit(1);
  }

  console.log(`${COMMITTED} is up to date (${ids.length} messages).`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
