#!/usr/bin/env node
/**
 * The demo host's web server.
 *
 * Node's standard library only — no dependency, no build step, no lockfile.
 * The demo has to run from a fresh clone or it is not a demo, and a host that
 * needed `npm install` to prove "you can embed this in anything" would be
 * arguing against itself.
 *
 *   node demo/server.mjs            # http://localhost:4401
 *   PORT=5000 node demo/server.mjs
 *
 * It serves on a **different port from the viewer**, and that is the whole
 * point rather than a convenience: a different port is a different origin, so
 * the demo exercises the real cross-origin path — origin checks, CORS on the
 * document fetch, `frame-ancestors`. A demo on one origin would pass while
 * every one of those was broken.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, 'public');
const PORT = Number(process.env['PORT'] ?? 4401);
const VIEWER_ORIGIN = process.env['VIEWER_ORIGIN'] ?? 'http://localhost:4200';

const CONTENT_TYPES = new Map(Object.entries({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
  '.ifc': 'application/x-step',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.svg': 'image/svg+xml',
}));

/**
 * Resolve a request path inside ROOT, or reject it.
 *
 * `..` is stripped by normalising and then checking the result is still under
 * ROOT — §5.13.11's rule, and worth applying even to a demo server, because a
 * demo server is the thing most likely to be copied into something real.
 */
function resolveWithin(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0] ?? '/');
  const relative = normalize(decoded === '/' ? '/index.html' : decoded).replace(/^(\.\.[/\\])+/, '');
  const resolved = join(root, relative);
  return resolved === root || resolved.startsWith(root + sep) ? resolved : null;
}

const server = createServer(async (request, response) => {
  // One source of truth for where the viewer is.
  //
  // The page needs it to build the frame URL and the server needs it to set
  // Access-Control-Allow-Origin, and if those two disagree the demo fails in a
  // way that looks like a protocol problem: the frame loads, the document
  // fetch is blocked, and nothing says why. Serving the value the server is
  // actually using removes the possibility.
  if ((request.url ?? '').split('?')[0] === '/config.json') {
    response.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    response.end(JSON.stringify({ viewerOrigin: VIEWER_ORIGIN }));
    return;
  }

  const path = resolveWithin(ROOT, request.url ?? '/');
  if (!path) {
    response.writeHead(403, { 'Content-Type': 'text/plain' });
    response.end('Outside the served directory');
    return;
  }

  let body;
  try {
    const info = await stat(path);
    if (!info.isFile()) throw new Error('not a file');
    body = await readFile(path);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain' });
    response.end('Not found');
    return;
  }

  const contentType = CONTENT_TYPES.get(extname(path)) ?? 'application/octet-stream';
  /** @type {Record<string, string>} */
  const headers = {
    'Content-Type': contentType,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
  };

  // The sample documents are fetched by the viewer, which is a different
  // origin, so they need CORS. Only the files do — the host's own page and
  // scripts are same-origin to it, and widening this to everything would let
  // any site read the host page.
  if (path.startsWith(join(ROOT, 'files') + sep)) {
    headers['Access-Control-Allow-Origin'] = VIEWER_ORIGIN;
    headers['Content-Disposition'] = 'inline';
  }

  response.writeHead(200, headers);
  response.end(request.method === 'HEAD' ? undefined : body);
});

server.listen(PORT, () => {
  console.log(`Demo host          http://localhost:${PORT}`);
  console.log(`Framing viewer at  ${VIEWER_ORIGIN}`);
  console.log('');
  console.log('The viewer must allow this origin in frame-ancestors, and must be');
  console.log(`reachable at ${VIEWER_ORIGIN} — see demo/README.md.`);
});
