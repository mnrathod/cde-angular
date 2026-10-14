/**
 * Tests for the endpoint count.
 *
 * <p>The figure this produces has been wrong three times, and each time the
 * bug was in one of the two places tested hardest here: the import resolver,
 * and what the counter does with a call it cannot read. Both failures were
 * silent — a smaller number and a clean exit — which is why most of these
 * assert that something *throws* rather than that it returns.
 */
import { describe, it, expect } from 'vitest';

import {
  endpointsIn,
  groupOf,
  importsIn,
  resolveImport,
} from './count-viewer-endpoints.mjs';

describe('resolving an import', () => {
  /**
   * A disk holding only files whose path ends one of these ways.
   *
   * <p>By suffix because the resolver returns an absolute path built from the
   * working directory, and a fixture that pinned the whole path would be
   * testing where the suite happens to run from.
   */
  const diskWith = (...endings) => candidate =>
    endings.some(ending => candidate.endsWith(ending));

  it('appends an extension rather than replacing one', () => {
    // The second wrong count in full: './role.service' is role.service.ts, and
    // replacing the extension asks for role.ts, which is not there. Every
    // *.service.ts import failed this way and everything behind them went
    // uncounted — 26 endpoints reported where there were far more.
    expect(
      resolveImport(
        'src/app/a.ts',
        './role.service',
        diskWith('src/app/role.service.ts'),
      ),
    ).toContain('role.service.ts');
  });

  it('does not find a file whose extension was replaced instead', () => {
    // The same bug stated the other way round: on a disk holding only role.ts,
    // './role.service' must resolve to nothing rather than to it.
    expect(() =>
      resolveImport('src/app/a.ts', './role.service', diskWith('src/app/role.ts')),
    ).toThrow(/resolves to nothing/);
  });

  it('finds a directory index', () => {
    const resolved = resolveImport('src/app/a.ts', './viewer', candidate =>
      candidate.endsWith(`viewer${'/'}index.ts`),
    );

    expect(resolved).toContain('index.ts');
  });

  it('ignores a package import, which is not ours to walk', () => {
    expect(resolveImport('src/app/a.ts', '@angular/core', () => false)).toBeNull();
  });

  it('throws when a relative import resolves to nothing', () => {
    // Not null, not a warning. A resolver that shrugs reports the surface it
    // could see as the surface that exists, and the report looks clean.
    expect(() =>
      resolveImport('src/app/a.ts', './missing', diskWith()),
    ).toThrow(/resolves to nothing/);
  });
});

describe('reading imports out of a file', () => {
  it('finds a plain import', () => {
    expect(importsIn("import { A } from './a';")).toEqual(['./a']);
  });

  it('finds an import split over several lines, as the long ones are', () => {
    expect(
      importsIn("import {\n  A,\n  B,\n} from './long';"),
    ).toEqual(['./long']);
  });

  it('finds a re-export, which pulls a file in just as an import does', () => {
    expect(importsIn("export type { P } from './palette';")).toEqual([
      './palette',
    ]);
  });
});

describe('finding endpoints in a file', () => {
  it('reads a call with its path written out', () => {
    expect(endpointsIn("this.http.get<Doc>('/api/documents/4')")).toEqual([
      'GET /api/documents/4',
    ]);
  });

  it('collapses an interpolation, so one route is one endpoint', () => {
    const found = endpointsIn(
      'this.http.get(`/api/documents/${a}`); this.http.get(`/api/documents/${b}`)',
    );

    expect(new Set(found)).toEqual(new Set(['GET /api/documents/{}']));
  });

  it('takes the method from a request() call rather than the path', () => {
    // `http.request('delete', '/api/x')` reads as DELETE /api/x. Counting the
    // first literal as the path invented an endpoint named `delete` and lost
    // the real one — two errors from one call site.
    expect(
      endpointsIn(
        "this.http.request<R>(\n  'delete', `/api/documents/${id}/form-fields`, { body: {} })",
      ),
    ).toEqual(['DELETE /api/documents/{}/form-fields']);
  });

  it('reads a path that is not the first argument', () => {
    expect(
      endpointsIn('this.http.get(data.pdfUrl || `/api/viewer/${id}/pdf`, {})'),
    ).toEqual(['GET /api/viewer/{}/pdf']);
  });

  it('throws on a call whose URL came from a variable and is not declared', () => {
    // The alternative is widening the search until some nearby literal
    // matches, which answers confidently and wrongly.
    expect(() => endpointsIn('this.http.get(url, { responseType: "arraybuffer" })'))
      .toThrow(/builds its URL in a variable/);
  });

  it('uses the declared endpoint for such a call', () => {
    expect(
      endpointsIn('this.http.get(url, {})', ['GET /api/viewer/{}/pdf']),
    ).toEqual(['GET /api/viewer/{}/pdf']);
  });

  it('throws when a declaration no longer matches any call', () => {
    // How this goes wrong a fourth time: the call is rewritten to use a
    // literal, the declaration stays, and the endpoint is counted twice.
    expect(() =>
      endpointsIn("this.http.get('/api/a')", ['GET /api/stale']),
    ).toThrow(/stale entries/);
  });

  it('says nothing about a file that calls nothing', () => {
    expect(endpointsIn('export const a = 1;')).toEqual([]);
  });
});

describe('which group an endpoint belongs to', () => {
  it('counts document bytes and model geometry as content', () => {
    // What an embedding host's ingress replaces, which is the number that
    // sizes the integration work.
    expect(groupOf('GET /api/viewer/{}')).toBe('content');
    expect(groupOf('GET /api/viewer/{}/pdf')).toBe('content');
    expect(groupOf('GET /api/viewer3d/{}/geometry')).toBe('content');
  });

  it('counts the document resource as a document operation', () => {
    expect(groupOf('PATCH /api/documents/{}/status')).toBe('document');
    expect(groupOf('POST /api/documents/upload')).toBe('document');
  });

  it("counts markup, identity and flattening as the viewer's own", () => {
    expect(groupOf('POST /api/annotations')).toBe('viewer');
    expect(groupOf('GET /api/auth/session')).toBe('viewer');
    // On /api/viewer/ but not content — it writes markup into the file.
    expect(groupOf('POST /api/viewer/{}/flatten')).toBe('viewer');
  });
});
