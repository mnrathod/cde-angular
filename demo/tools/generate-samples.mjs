#!/usr/bin/env node
/**
 * Regenerate the demo's sample documents.
 *
 *   node demo/tools/generate-samples.mjs          # write demo/public/files
 *   node demo/tools/generate-samples.mjs --check  # fail if they are stale
 *
 * The outputs are committed *and* generated. Committing them means the demo
 * runs from a fresh clone with no build step; generating them means the
 * provenance of every byte is a script in this repository rather than a claim
 * in a document (§17.1). `--check` is what keeps those two facts the same
 * fact, and it works because the generators are deterministic.
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drawingPdf, specificationDocx, modelIfc } from './lib/samples.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outputDirectory = join(here, '..', 'public', 'files');

const SAMPLES = [
  { name: 'sample-drawing.pdf', build: drawingPdf },
  { name: 'sample-specification.docx', build: specificationDocx },
  { name: 'sample-model.ifc', build: modelIfc },
];

const checkOnly = process.argv.includes('--check');
mkdirSync(outputDirectory, { recursive: true });

let stale = 0;
for (const { name, build } of SAMPLES) {
  const path = join(outputDirectory, name);
  const generated = build();

  if (checkOnly) {
    const current = existsSync(path) ? readFileSync(path) : Buffer.alloc(0);
    if (!current.equals(generated)) {
      console.error(`stale: ${name} does not match its generator`);
      stale += 1;
    }
    continue;
  }

  writeFileSync(path, generated);
  console.log(`${name}  ${generated.length.toLocaleString()} bytes`);
}

if (checkOnly) {
  if (stale) {
    console.error(
      `\n${stale} sample file(s) differ from the generator. ` +
      'Run: node demo/tools/generate-samples.mjs',
    );
    process.exit(1);
  }
  console.log('samples match their generator');
}
