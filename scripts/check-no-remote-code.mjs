#!/usr/bin/env node
/**
 * Fails the build if any source file fetches executable code from another
 * origin.
 *
 * This guards a regression that had already happened twice here: the PDF
 * viewer and the 3D viewer each injected a <script> tag pointing at a public
 * CDN, even though both libraries were already declared in package.json and
 * bundled. Four things go wrong at once, which is why this is a gate rather
 * than a review comment:
 *
 *   - Whoever controls the CDN executes arbitrary code on this origin with
 *     the user's session. Neither call site used SRI, so nothing bounded the
 *     damage.
 *   - The CDN copy drifts from the bundled version. Both were several major
 *     versions behind, so already-patched bugs were being loaded over the top
 *     of a fixed library.
 *   - The strict CSP (default-src 'self', no unsafe-inline) refuses the
 *     request, so the feature is broken in any correctly configured
 *     deployment.
 *   - Air-gapped installations have no route to the CDN at all, and those are
 *     most of the sovereign and Defence scope.
 *
 * Run with: npm run check:no-remote-code
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/** Hosts whose purpose is serving executable third-party code. */
const CODE_HOSTS = [
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'unpkg.com',
  'cdn.skypack.dev',
  'esm.sh',
  'ajax.googleapis.com',
  'code.jquery.com',
  'stackpath.bootstrapcdn.com'
];

const SOURCE_ROOT = join(process.cwd(), 'src');
const SCANNED_EXTENSIONS = /\.(ts|html|css|scss)$/;

function sourceFiles(directory) {
  return readdirSync(directory).flatMap(entry => {
    const path = join(directory, entry);
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : (SCANNED_EXTENSIONS.test(entry) ? [path] : []);
  });
}

const files = sourceFiles(SOURCE_ROOT);
const failures = [];

// Without this, a wrong root would make every check below pass vacuously,
// which is the worst kind of green: a gate that reports success precisely
// because it inspected nothing.
if (files.length < 20) {
  failures.push(
    `Only ${files.length} source files found under ${SOURCE_ROOT}. ` +
    'That is too few to be right — the scan root is probably wrong, and a ' +
    'scan that inspects nothing passes everything.'
  );
}

for (const path of files) {
  const source = readFileSync(path, 'utf8');
  const shown = relative(process.cwd(), path);

  for (const host of CODE_HOSTS) {
    if (source.includes(host)) {
      failures.push(`${shown} references ${host}`);
    }
  }

  if (/createElement\(\s*['"]script['"]\s*\)/.test(source) && /https?:\/\//.test(source)) {
    failures.push(`${shown} injects a <script> element and contains an absolute URL`);
  }
}

if (failures.length > 0) {
  console.error('\nRemotely loaded code is not permitted:\n');
  for (const failure of failures) console.error(`  ${failure}`);
  console.error(
    '\nAdd the library to package.json and import it. If it is large enough ' +
    'to blow the route-chunk budget, use a dynamic import() so it gets its ' +
    'own lazily fetched chunk.\n'
  );
  process.exit(1);
}

console.log(`No remotely loaded code: ${files.length} source files scanned.`);
