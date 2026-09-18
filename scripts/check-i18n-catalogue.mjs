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
import { spawnSync } from 'node:child_process';
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
  // stderr is captured rather than inherited because the extractor reports
  // duplicate message IDs there and exits 0 regardless. Two different source
  // strings sharing an ID is not a warning in any useful sense: the extractor
  // keeps one of them arbitrarily, so the other ships the wrong words in
  // every translated language, and nothing downstream would ever notice.
  const extraction = spawnSync(
    'npx',
    ['ng', 'extract-i18n', '--output-path', scratch, '--out-file', 'messages.json'],
    { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' },
  );
  if (extraction.status !== 0) {
    console.error(extraction.stderr ?? 'Extraction failed with no diagnostics.');
    process.exit(1);
  }

  const diagnostics = extraction.stderr ?? '';
  if (diagnostics.includes('Duplicate messages')) {
    console.error('Two different messages share an ID:\n');
    console.error(diagnostics.trim());
    console.error(
      '\nGive them separate @@ids. The extractor keeps one and discards the ' +
        'other, so the discarded one ships untranslated everywhere.',
    );
    process.exit(1);
  }

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

  // A `$localize` description is delimited by colons, so a colon *inside* one
  // ends the metadata early and the rest of it lands in the message text.
  // This is invisible at the call site, compiles cleanly, and ships a message
  // reading "@@documentOperation.ocr:OCR" to every translator — so it is
  // caught here rather than by whoever opens the catalogue months later.
  const leakedMetadata = Object.entries(fresh)
    .filter(([, text]) => text.includes('@@'))
    .map(([id, text]) => `  ${id}: ${JSON.stringify(text)}`);

  if (leakedMetadata.length > 0) {
    console.error(
      'These messages contain `@@`, which means $localize metadata leaked ' +
        'into the text — usually a colon inside a description:\n',
    );
    console.error(leakedMetadata.join('\n'));
    console.error('\nEscape the colon as \\: or reword the description.');
    process.exit(1);
  }

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
