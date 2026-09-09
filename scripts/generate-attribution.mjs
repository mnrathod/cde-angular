#!/usr/bin/env node
/**
 * Regenerates THIRD-PARTY-NOTICES.txt from the resolved production
 * dependency tree, and refuses to write one that attests to a forbidden
 * licence.
 *
 * Attribution is a licence obligation, not a courtesy: Apache-2.0 §4(d) and
 * the attribution clauses of MIT and BSD require that the notices travel with
 * the distribution, so shipping without this file is an actual breach
 * (CLAUDE.md §17.2). Enterprise, government and Defence procurement ask for
 * it by name alongside the SBOM.
 *
 * Reads package-lock.json rather than walking node_modules. The lockfile is
 * the resolved graph — the npm equivalent of the Gradle `runtimeClasspath`
 * the backend attributes from — and it records a `license` and a `dev` flag
 * per entry, so this needs no licence-scanning dependency (§0.3) and works on
 * a checkout that has not run `npm install`.
 *
 * Run with:  npm run attribution
 * Checked by: npm run check:attribution
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const lockPath = join(repoRoot, 'package-lock.json');
const outputPath = join(repoRoot, 'THIRD-PARTY-NOTICES.txt');

/**
 * CLAUDE.md §2.1, verbatim. Anything not on this list is not automatically
 * forbidden — it is unrecognised, which is a different failure and gets a
 * different message, because the fix is to read the licence rather than to
 * remove the package.
 */
const ALLOWED = new Set([
  'Apache-2.0', 'MIT', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC',
  'EPL-2.0', 'MPL-2.0', 'CDDL-1.0', 'CDDL-1.1',
  'PostgreSQL', 'Unlicense', 'CC0-1.0', '0BSD'
]);

/**
 * §2.1's hard "forbidden" list, plus the §2.2 re-licensing pattern. Matched
 * as substrings of the SPDX expression so `AGPL-3.0-or-later` and
 * `(MIT OR AGPL-3.0)` are both caught — a dual licence including AGPL is
 * still an AGPL grant we would be choosing not to take, and §2.1 excludes
 * AGPL in any version rather than in any particular spelling.
 */
const FORBIDDEN = ['AGPL', 'SSPL', 'BUSL', 'BSL-', 'Commons-Clause', 'Elastic-2.0'];

const lock = JSON.parse(readFileSync(lockPath, 'utf8'));

/**
 * What ships.
 *
 * npm's own `dev` flag decides: a package reachable from `dependencies` —
 * directly or transitively — is not marked dev, even when a devDependency
 * also reaches it. The root entry is this project and is excluded, the same
 * way the backend's scan skips its own modules; §17.2 is an obligation to
 * third parties, and our own code is covered by LICENSE.
 *
 * Optional dependencies are included. Twelve of these are the per-platform
 * native builds of @napi-rs/canvas, of which any given install resolves one —
 * but which one depends on the machine, and listing all of them is the safe
 * direction. Over-attributing costs a longer file; under-attributing is the
 * breach.
 *
 * This is deliberately the whole production closure rather than what survives
 * tree-shaking into dist/. Deriving the latter means parsing build output and
 * would silently under-report the moment the bundler changed.
 */
const components = Object.entries(lock.packages)
  .filter(([path, meta]) => path && !meta.dev)
  .map(([path, meta]) => ({
    name: path.replace(/^(?:.*\/)?node_modules\//, ''),
    version: meta.version,
    licence: meta.license ?? null
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

// ── Policy ────────────────────────────────────────────────────────────────
const undeclared = components.filter((c) => !c.licence);
const forbidden = components.filter(
  (c) => c.licence && FORBIDDEN.some((f) => c.licence.includes(f))
);
const unrecognised = components.filter(
  (c) => c.licence && !ALLOWED.has(c.licence) && !forbidden.includes(c)
);

const failures = [];
for (const c of forbidden) {
  failures.push(
    `FORBIDDEN   ${c.name}@${c.version} is ${c.licence}, which §2.1 excludes outright. ` +
    'It cannot ship. Replace it — see §2.2 for the substitutions already chosen.'
  );
}
for (const c of undeclared) {
  failures.push(
    `UNDECLARED  ${c.name}@${c.version} declares no licence in the lockfile. ` +
    'Read its LICENSE file, record the finding in docs/licences.md, and only ' +
    'then decide whether it can ship (§17.2).'
  );
}
for (const c of unrecognised) {
  failures.push(
    `UNRECOGNISED ${c.name}@${c.version} is ${c.licence}, which is on neither the ` +
    'allowed nor the forbidden list. Read it, then add it to ALLOWED here with ' +
    'a note in docs/licences.md, or replace the package.'
  );
}

if (failures.length > 0) {
  console.error('\nLicence policy violations (CLAUDE.md §2.1, §17.2):\n');
  for (const failure of failures) console.error(`  ${failure}`);
  console.error(
    '\nTHIRD-PARTY-NOTICES.txt has NOT been written. A notices file is an ' +
    'assertion that the licences in it are ones we may ship under, and ' +
    'generating one over a violation would make that assertion false.\n'
  );
  process.exit(1);
}

// ── Write ─────────────────────────────────────────────────────────────────
// Grouped by licence rather than listed flat, so the licence mix is legible
// at a glance during an audit instead of something the reader has to tally.
const byLicence = new Map();
for (const c of components) {
  if (!byLicence.has(c.licence)) byLicence.set(c.licence, []);
  byLicence.get(c.licence).push(c);
}

const lines = [];
lines.push('THIRD-PARTY NOTICES');
lines.push('===================');
lines.push('');
lines.push('This product includes software developed by third parties. The components');
lines.push('below are redistributed with the product; each remains under its own licence');
lines.push('and copyright, held by its respective authors.');
lines.push('');
lines.push('This file is generated from the resolved production dependency tree in');
lines.push('package-lock.json by scripts/generate-attribution.mjs. Do not edit it by');
lines.push('hand — edit the dependency declarations instead and regenerate. The build');
lines.push('fails if this file is stale.');
lines.push('');
lines.push(`Components: ${components.length}`);
lines.push('');

for (const licence of [...byLicence.keys()].sort()) {
  lines.push('-'.repeat(72));
  lines.push(licence);
  lines.push('-'.repeat(72));
  lines.push('');
  for (const c of byLicence.get(licence)) lines.push(`  ${c.name}@${c.version}`);
  lines.push('');
}

writeFileSync(outputPath, lines.join('\n') + '\n', 'utf8');
console.log(
  `Wrote THIRD-PARTY-NOTICES.txt (${components.length} components, ` +
  `${byLicence.size} licences: ${[...byLicence.keys()].sort().join(', ')})`
);
