#!/usr/bin/env node
/**
 * Fails the build if THIRD-PARTY-NOTICES.txt does not match the dependencies
 * it describes, or is not committed.
 *
 * A generated file with no gate goes stale silently, and the failure mode is
 * specific: the notices keep naming the versions that were current when
 * someone last remembered to run the generator, while the build ships
 * different ones. The backend learned this the expensive way — Bouncy Castle
 * moved 1.78.1 -> 1.85 with the shipped attribution still naming 1.78.1 and
 * every gate green — which is why the check is "regenerate, then ask git
 * whether anything changed" rather than "does the file exist".
 *
 * git status --porcelain rather than git diff: diff only considers tracked
 * files, so a never-committed notices file would produce no diff and pass —
 * the gate reporting success in exactly the case it exists to catch.
 *
 * Run with: npm run check:attribution
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = join(repoRoot, 'THIRD-PARTY-NOTICES.txt');

// Regenerate first. The generator exits non-zero on a licence policy
// violation and writes nothing, which fails this check too — correctly, since
// a distribution with a forbidden licence in it is a worse problem than a
// stale notices file.
execFileSync('node', [join(repoRoot, 'scripts', 'generate-attribution.mjs')], {
  cwd: repoRoot,
  stdio: 'inherit'
});

if (!existsSync(outputPath)) {
  console.error('THIRD-PARTY-NOTICES.txt is missing (CLAUDE.md §17.2).');
  process.exit(1);
}

const status = execFileSync(
  'git', ['status', '--porcelain', '--', outputPath],
  { cwd: repoRoot, encoding: 'utf8' }
).trim();

if (status) {
  // The porcelain code says which of the three states this is, and they need
  // different fixes: regenerate and commit, or just commit.
  const state = status.startsWith('??') ? 'is not tracked by git'
              : status.startsWith(' M') ? 'has uncommitted changes'
              : 'is staged but not committed';
  console.error(
    `\nTHIRD-PARTY-NOTICES.txt ${state}. It ships with every distribution, so it ` +
    'has to be committed, and it has to match the dependencies it describes.\n\n' +
    'Run `npm run attribution` and commit the result in the same change as the ' +
    'dependency edit (CLAUDE.md §17.2).\n'
  );
  process.exit(1);
}

console.log('THIRD-PARTY-NOTICES.txt is current and committed.');
