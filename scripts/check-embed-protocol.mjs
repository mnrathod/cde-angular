#!/usr/bin/env node
/**
 * Holds the embed protocol's three statements of itself to each other.
 *
 * <p>The viewer → host protocol is written down in three places: the
 * `ViewerMessageType` union in `src/app/features/embed/embed-protocol.ts`, the
 * `send(...)` calls that actually post messages, and the event table in
 * `docs/viewer-embed-protocol.md` — which that source file names as the
 * authority. Nothing compared them, and they had drifted:
 * **`viewer.resized` was declared in the union and documented in the table,
 * with a payload shape and advice on when to ignore it, and was sent by no
 * code path at all.** A host implementing the published protocol would wire a
 * handler, size its frame to content, and wait for an event that never comes.
 * Nothing errors; the feature silently does not work.
 *
 * <p>That is the failure this gate exists to prevent, and it is not the kind a
 * test of the viewer would catch: every test passed, because the event nothing
 * sends is also the event nothing asserts. Only a comparison between the three
 * lists finds it.
 *
 * <p>A script rather than a spec, for the reason `check-i18n-markup.mjs` gives:
 * a source file pulled into the test bundle as raw text collapses to a
 * one-line module and silently empties the coverage denominator. The pure
 * functions below are unit-tested in `check-embed-protocol.spec.mjs`; this
 * file's own `main` only supplies the real inputs.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Where the union lives. */
export const PROTOCOL_SOURCE = 'src/app/features/embed/embed-protocol.ts';

/** The document that source file calls the authority. */
export const PROTOCOL_DOC = 'docs/viewer-embed-protocol.md';

/** Where to look for the calls that post messages. */
export const SOURCE_ROOT = 'src';

/**
 * The message types the `ViewerMessageType` union declares.
 *
 * <p>Reads the union by name rather than scanning the file for anything that
 * looks like an event, so an unrelated string elsewhere in the file cannot
 * add a phantom member.
 */
export function declaredTypes(source) {
  const union = /export type ViewerMessageType\s*=([\s\S]*?);/.exec(source);
  if (!union) return [];
  return [...new Set(union[1].match(/'viewer\.[A-Za-z]+'/g) ?? [])]
    .map((quoted) => quoted.slice(1, -1))
    .sort();
}

/**
 * The message types some production code path actually sends.
 *
 * <p>Spec files are excluded by filename. They send events the protocol does
 * not have on purpose — `protocol-conversation.spec.ts` posts a
 * `viewer.futureEvent` to prove a host tolerates one it does not know — and
 * counting those would let a declared-but-unsent event be "covered" by the
 * test that proves it is unknown.
 */
export function sentTypes(files) {
  const sent = new Set();
  for (const file of files) {
    if (file.path.endsWith('.spec.ts')) continue;
    for (const match of file.text.matchAll(/send\(\s*'(viewer\.[A-Za-z]+)'/g)) {
      sent.add(match[1]);
    }
  }
  return [...sent].sort();
}

/**
 * The message types the authority's event table documents.
 *
 * <p>Table rows only. The document discusses events in prose as well, and a
 * mention in a caveat is not the same as a row telling a host what the payload
 * is — treating prose as documentation would let a removed row pass.
 */
export function documentedTypes(markdown) {
  const documented = new Set();
  for (const line of markdown.split('\n')) {
    const row = /^\|\s*`(viewer\.[A-Za-z]+)`\s*\|/.exec(line.trim());
    if (row) documented.add(row[1]);
  }
  return [...documented].sort();
}

/**
 * Every disagreement between the three lists, as sentences.
 *
 * <p>Each rule names a failure a host would hit rather than a tidiness
 * complaint, which is why all three are errors and none is a warning.
 */
export function assessProtocol({ declared, sent, documented }) {
  const problems = [];

  for (const type of declared) {
    if (!sent.includes(type)) {
      problems.push(
        `${type} is declared in ViewerMessageType but sent by no production code. ` +
          'A host that handles it waits for an event that never arrives. Either ' +
          'send it or remove it from the union and the document.',
      );
    }
    if (!documented.includes(type)) {
      problems.push(
        `${type} is declared in ViewerMessageType but has no row in ${PROTOCOL_DOC}. ` +
          'A host cannot handle an event it cannot discover.',
      );
    }
  }

  for (const type of documented) {
    if (!declared.includes(type)) {
      problems.push(
        `${type} has a row in ${PROTOCOL_DOC} but is not in ViewerMessageType. ` +
          'The document promises an event the code has no name for.',
      );
    }
  }

  for (const type of sent) {
    if (!declared.includes(type)) {
      problems.push(
        `${type} is sent by production code but is not in ViewerMessageType. ` +
          'An event outside the union is outside the protocol.',
      );
    }
  }

  return problems;
}

/** Every `.ts` file under a directory, read. */
function readTypeScriptFiles(root) {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith('.ts')) files.push({ path, text: readFileSync(path, 'utf8') });
    }
  };
  walk(root);
  return files;
}

function main() {
  const declared = declaredTypes(readFileSync(PROTOCOL_SOURCE, 'utf8'));
  const documented = documentedTypes(readFileSync(PROTOCOL_DOC, 'utf8'));
  const sent = sentTypes(readTypeScriptFiles(SOURCE_ROOT));

  // A union that parsed to nothing would make every other check pass
  // vacuously, which is the way this gate could silently stop working.
  if (declared.length === 0) {
    console.error(
      `Could not read the ViewerMessageType union from ${PROTOCOL_SOURCE}. ` +
        'Refusing to pass: with no declared types every comparison below is empty.',
    );
    process.exit(1);
  }

  const problems = assessProtocol({ declared, sent, documented });
  if (problems.length > 0) {
    console.error('\nThe embed protocol disagrees with itself:\n');
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error('');
    process.exit(1);
  }

  console.log(
    `Embed protocol consistent: ${declared.length} viewer → host message types, ` +
      'each sent by the viewer and documented for hosts.',
  );
}

if (process.argv[1] && process.argv[1].endsWith('check-embed-protocol.mjs')) main();
