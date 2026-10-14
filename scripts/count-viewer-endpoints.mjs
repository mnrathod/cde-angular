#!/usr/bin/env node
/**
 * Counts the platform endpoints the viewer reaches, by walking imports.
 *
 * <p>**This exists because the figure has been wrong three times, always an
 * undercount.** The architecture document quotes it to size the ingress an
 * external CDE would have to implement, so an undercount understates the work
 * and is the most expensive direction to be wrong in. The three attempts:
 *
 * <ul>
 *   <li>"seven" — from grepping directories rather than following imports.</li>
 *   <li>"26 across 9" — from a resolver that turned `./role.service` into
 *       `role.ts` by *replacing* the extension instead of appending one, so
 *       every `*.service.ts` import silently failed to resolve and everything
 *       behind it went uncounted.</li>
 *   <li>"35 across 15, 11 services and 4 components" — a hand count that was
 *       never re-run, and was wrong on three of its four numbers.</li>
 * </ul>
 *
 * <p>Two rules follow from that history, and both are tested:
 *
 * <ul>
 *   <li>**An import that does not resolve stops the count.** A resolver that
 *       shrugs reports the surface it could see as the surface that exists.</li>
 *   <li>**A call whose URL is not a literal stops the count.** Both of ours
 *       read `data.pdfUrl || \`/api/viewer/${id}/pdf\``, where the literal is
 *       not the first argument; a regex anchored to the opening bracket misses
 *       it and silently drops an endpoint.</li>
 * </ul>
 *
 * <p>A script rather than a spec, for the reason `check-i18n-markup.mjs` gives:
 * a source file pulled into the test bundle as raw text collapses to a one-line
 * module and empties the coverage denominator. The pure functions here are
 * unit-tested in `count-viewer-endpoints.spec.mjs`.
 *
 * <p>Reporting only — it prints and exits 0. It is not a gate, because the
 * count is a fact about the design rather than a limit on it; what it replaces
 * is somebody retyping a number from memory.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

/**
 * Where the walk starts: every viewer surface and everything `viewer-core` is.
 *
 * <p>The seed set is part of the figure. Widening it to the whole application
 * would count the project picker and the comparison report, which are not what
 * an embedding host replaces, so it is written down here rather than left to
 * whoever reruns this.
 */
export const SEED_ROOTS = [
  'src/app/features/viewer',
  'src/app/features/embed',
  'src/viewer-core',
];

const isSource = path =>
  path.endsWith('.ts') && !path.endsWith('.spec.ts') && !path.endsWith('.d.ts');

/**
 * Where a relative import points, or null for a package import.
 *
 * <p>**Appends an extension rather than replacing one**, which is the whole
 * lesson of the second wrong count: `./role.service` is a file named
 * `role.service.ts`, and `replace(/\.[^.]+$/, '.ts')` turns it into `role.ts`,
 * which does not exist. It throws rather than returning null when a relative
 * import resolves to nothing, because the alternative is a smaller number and
 * no indication that anything went wrong.
 */
export function resolveImport(fromFile, specifier, exists = existsSync) {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), specifier);
  for (const candidate of [`${base}.ts`, `${base}.mjs`, join(base, 'index.ts')]) {
    if (exists(candidate)) return relative('.', candidate).split(sep).join('/');
  }
  throw new Error(
    `${fromFile} imports '${specifier}', which resolves to nothing. Refusing ` +
      'to report a count that silently skips whatever is behind it.',
  );
}

const IMPORT = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]/g;

/** Every relative import in a source file. */
export function importsIn(contents) {
  return [...contents.matchAll(IMPORT)].map(match => match[1]);
}

/** Any `http.<verb>(` call, so the total can be checked against the parsed set. */
const ANY_CALL = /\bhttp\s*\.\s*(get|post|put|patch|delete|head|options|request)\s*[<(]/g;

/**
 * Call sites whose URL is held in a variable, and the endpoint each reaches.
 *
 * <p>One call qualifies. It reads `data.pdfUrl || \`/api/viewer/${id}/pdf\`` —
 * a host-supplied URL if the record carries one, our own route otherwise — and
 * assigns it a line before the call, so no literal is in reach. The comparison
 * loader does the same thing inline and needs no entry here, which the
 * staleness check below established by rejecting the entry I first wrote for
 * it. Stated rather than guessed from nearby text: the point of this script is
 * that it stops when it cannot see something.
 */
export const URL_FROM_VARIABLE = new Map([
  ['src/app/features/viewer/viewer-document-loader.ts',
    ['GET /api/viewer/{}/pdf']],
]);

/**
 * A call site's method and path, for every `HttpClient` call in a file.
 *
 * <p>Handles the three shapes this codebase actually uses, and refuses the
 * rest:
 *
 * <ul>
 *   <li>`http.get('/api/thing')` — the ordinary case.</li>
 *   <li>`http.request('delete', '/api/thing', …)` — where the first literal is
 *       the *method*, not the path. Counting it as a path produced a phantom
 *       endpoint called `delete` and lost the real one.</li>
 *   <li>`http.get(fallback || \`/api/thing\`)` — where the literal is not the
 *       first argument.</li>
 * </ul>
 *
 * <p>Interpolations collapse to `{}` so `/api/documents/${a}` and
 * `/api/documents/${b}` are one endpoint, which is what "endpoint" means here.
 */
export function endpointsIn(contents, declared = []) {
  const remaining = [...declared];
  const found = [];
  for (const match of contents.matchAll(ANY_CALL)) {
    const verb = match[1].toUpperCase();
    // From the opening bracket onwards is enough to hold the arguments that
    // carry a URL, for the calls that carry one at all.
    const tail = contents.slice(match.index, match.index + 400);
    const literals = [...tail.matchAll(/[`'"]([^`'"]*)[`'"]/g)].map(m => m[1]);
    const path = literals.find(value => value.startsWith('/'));
    if (path === undefined) {
      // The URL came from a variable. Take the next declared endpoint for this
      // file rather than guessing from the surrounding lines, and refuse when
      // there is none — a widened window would read whichever literal happened
      // to be nearby, which is a worse answer than stopping.
      const stated = remaining.shift();
      if (stated === undefined) {
        throw new Error(
          `A http.${match[1]} call builds its URL in a variable:\n  ` +
            `${tail.split('\n')[0]}\nAdd the endpoint it reaches to ` +
            'URL_FROM_VARIABLE. Refusing to report a count that drops it.',
        );
      }
      found.push(stated);
      continue;
    }
    const method =
      verb === 'REQUEST' ? (literals[0] ?? '').toUpperCase() : verb;
    found.push(`${method} ${path.replace(/\$\{[^}]*\}/g, '{}')}`);
  }
  if (remaining.length > 0) {
    throw new Error(
      `URL_FROM_VARIABLE declares ${declared.length} endpoint(s) for this ` +
        `file but only ${declared.length - remaining.length} call(s) needed ` +
        'one. Delete the stale entries — a declaration nobody checks is how ' +
        'this count goes wrong a fourth time.',
    );
  }
  return found;
}

/**
 * Which group an endpoint falls in, which is the part the design turns on.
 *
 * <p>`content` is what an embedding host's ingress replaces; `document` is what
 * ADR 14 assigned to the host; the rest is the viewer's own.
 */
export function groupOf(endpoint) {
  const path = endpoint.slice(endpoint.indexOf(' ') + 1);
  if (/^\/api\/viewer3d\//.test(path)) return 'content';
  if (/^\/api\/viewer\/\{\}(\/pdf)?$/.test(path)) return 'content';
  if (/^\/api\/documents\//.test(path)) return 'document';
  return 'viewer';
}

/** Every source file under a directory, recursively. */
function sourcesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourcesUnder(path);
    return isSource(path) ? [relative('.', path).split(sep).join('/')] : [];
  });
}

function main() {
  const reached = new Set();
  const queue = SEED_ROOTS.flatMap(sourcesUnder);
  while (queue.length > 0) {
    const file = queue.shift();
    if (reached.has(file)) continue;
    reached.add(file);
    const contents = readFileSync(file, 'utf8');
    for (const specifier of importsIn(contents)) {
      const target = resolveImport(file, specifier, path =>
        existsSync(path) && statSync(path).isFile(),
      );
      if (target && !reached.has(target)) queue.push(target);
    }
  }

  const endpoints = new Set();
  const callers = [];
  let callSites = 0;
  for (const file of [...reached].sort()) {
    const found = endpointsIn(
      readFileSync(file, 'utf8'),
      URL_FROM_VARIABLE.get(file) ?? [],
    );
    if (found.length === 0) continue;
    callSites += found.length;
    callers.push([file, found.length]);
    for (const endpoint of found) endpoints.add(endpoint);
  }

  const counted = { content: 0, document: 0, viewer: 0 };
  for (const endpoint of endpoints) counted[groupOf(endpoint)] += 1;

  const services = callers.filter(([path]) => path.includes('.service.')).length;
  const components = callers.filter(([path]) => path.includes('.component.')).length;

  console.log(`${reached.size} files reachable from ${SEED_ROOTS.join(', ')}`);
  console.log(
    `${endpoints.size} distinct endpoints over ${callSites} call sites, in ` +
      `${callers.length} files — ${services} services, ${components} ` +
      `components, ${callers.length - services - components} other`,
  );
  console.log(
    `  content ${counted.content} · document operations ${counted.document} · ` +
      `viewer's own ${counted.viewer}`,
  );
  console.log('');
  for (const [file, count] of callers) {
    console.log(`  ${String(count).padStart(2)}  ${file}`);
  }
  console.log('');
  for (const endpoint of [...endpoints].sort()) console.log(`  ${endpoint}`);
}

if (process.argv[1] && process.argv[1].endsWith('count-viewer-endpoints.mjs')) {
  main();
}
