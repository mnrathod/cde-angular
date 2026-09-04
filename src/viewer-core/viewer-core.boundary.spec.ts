/// <reference types="vite/client" />

/**
 * Whether the viewer core is still independent of the application.
 *
 * <p>ADR 12 ships the viewer as its own product. These services are the part
 * with nothing to sever — they render, measure, search and hold state without
 * knowing a backend exists — and the value of that is entirely in it staying
 * true. One `inject(AuthService)` added in a hurry turns a copy into an
 * untangling, and nothing else in the build would notice: the application
 * compiles perfectly well with the dependency pointing the wrong way.
 *
 * <p>So it is asserted rather than intended. This is the same reasoning as
 * the backend's converter-URL check — a rule that only holds while everyone
 * remembers it is not a rule.
 *
 * <p>Sources are read through Vite's `import.meta.glob` rather than
 * `node:fs`. The spec tsconfig declares `types: ["vitest/globals"]` and no
 * Node types, so a filesystem read would mean adding `@types/node` — a new
 * dependency (§0.3) for a test that can just as well ask the bundler for the
 * text it already has.
 */

/**
 * Every TypeScript file in this directory, as raw source, keyed by path.
 *
 * <p>Written as a literal `import.meta.glob` call because Vite replaces it at
 * transform time by matching that exact expression — assigning `import.meta`
 * to a variable first, or casting it inline, leaves the call intact at
 * runtime and it fails with "statically replaced during file transformation".
 *
 * <p>Its type comes from the reference above rather than from the spec
 * tsconfig's `types` array, which is shared by every spec in the repository:
 * one test needing one type is a poor reason to widen what all of them see.
 */
const SOURCES = import.meta.glob('./*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

describe('viewer-core boundary', () => {

  /**
   * Relative imports that reach one of the application's directories.
   *
   * <p>Anchored to `./` or `../` deliberately. An unanchored version matched
   * `@angular/core/testing` — the package path contains `core/` — and flagged
   * all five specs as boundary violations. Bare specifiers are npm packages:
   * a library may depend on its framework, on `rxjs`, on `pdfjs-dist`, and
   * that is not a dependency on this application.
   */
  const FORBIDDEN =
    /from\s+['"]\.{1,2}\/(?:[^'"]*\/)?(?:app|core|features|shared|environments)\//;

  /**
   * The one path outside this directory that is allowed, and only from a
   * spec: `src/testing` holds a 24-line assertion helper with no dependency
   * on the application. It is workspace-level test scaffolding rather than
   * app code, and it travels with the directory when it is extracted —
   * duplicating it to satisfy a rule would be the rule wagging the design.
   */
  const PERMITTED_OUTSIDE = '../testing/';

  function importLines(source: string): string[] {
    return source.split('\n').filter(line => line.startsWith('import'));
  }

  function filesWhere(
    predicate: (line: string) => boolean,
    include: (path: string) => boolean = () => true,
  ): string[] {
    return Object.entries(SOURCES)
      .filter(([path]) => include(path))
      .filter(([, source]) => importLines(source).some(predicate))
      .map(([path]) => path)
      .sort();
  }

  it('has source files to check, so a wrong glob cannot pass silently', () => {
    // Without this, renaming the directory turns every assertion below into
    // a vacuous truth over an empty set.
    expect(Object.keys(SOURCES).length).toBeGreaterThanOrEqual(6);
  });

  it('imports nothing from the application', () => {
    expect(filesWhere(line => FORBIDDEN.test(line))).toEqual([]);
  });

  it('reaches nothing above its own directory but the test helper', () => {
    // `../` from here lands in `src`, and everything there other than this
    // directory and `testing` belongs to the application. Catches what the
    // name-based rule above would miss if a folder were renamed.
    expect(filesWhere(line =>
      /from\s+['"]\.\.\//.test(line) && !line.includes(PERMITTED_OUTSIDE),
    )).toEqual([]);
  });

  it('lets no production file reach outside at all, helper included', () => {
    // The exemption above is for specs. Nothing that ships may use it —
    // otherwise `../testing/` becomes a hole the next import walks through.
    expect(filesWhere(
      line => /from\s+['"]\.\.\//.test(line),
      path => !path.endsWith('.spec.ts'),
    )).toEqual([]);
  });
});
