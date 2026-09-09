#!/usr/bin/env node
/**
 * Serves `stub-viewer.html` on its own port, so the e2e test has a second
 * origin to frame. A different port is a different origin, which is the only
 * way the host's origin checks are actually exercised.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env['PORT'] ?? 4402);

createServer(async (_request, response) => {
  const body = await readFile(join(here, 'stub-viewer.html'));
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    // The real viewer sets this from per-tenant configuration (ADR 14). The
    // stub allows exactly the demo host, which is the shape of the real rule.
    'Content-Security-Policy': `frame-ancestors ${process.env['HOST_ORIGIN'] ?? 'http://localhost:4401'}`,
  });
  response.end(body);
}).listen(PORT, () => console.log(`Stub viewer http://localhost:${PORT}`));
