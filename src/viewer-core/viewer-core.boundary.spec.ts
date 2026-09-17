/// <reference types="vite/client" />

/**
 * Whether the viewer core is still independent of the application.
 *
 * <p>ADR 12 ships the viewer as its own product. What lives here is the part
 * with nothing to sever — services and components that render, measure,
 * search and hold state without knowing a backend exists — and the value of
 * that is entirely in it staying true. One `inject(AuthService)` added in a
 * hurry turns a copy into an untangling, and nothing else in the build would
 * notice: the application compiles perfectly well with the dependency
 * pointing the wrong way.
 *
 * <p>Components are the likelier place for that to happen, because reaching
 * for a service is the ordinary way to make one do something. The rules below
 * do not distinguish between a service file and a component file, and they
 * should not: the boundary is about direction, not about kind.
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

/** Where the package lives, as the glob below spells it. */
const PACKAGE_ROOT = '/src/viewer-core/';

/**
 * This file, excluded from its own rules.
 *
 * <p>It has to contain every string it forbids — that is what a list of
 * forbidden strings is — so including it makes the rules fail on their own
 * statement of themselves. That went unnoticed because Vite included this
 * file in the glob under coverage instrumentation and left it out without,
 * so the suite passed or failed depending on a flag. Excluded explicitly now,
 * which is deterministic either way.
 *
 * <p>Named exactly rather than skipping every spec: a spec is still part of
 * the package, and one that fetched something would still be worth knowing
 * about.
 */
const THIS_FILE = PACKAGE_ROOT + 'viewer-core.boundary.spec.ts';

/**
 * Every TypeScript file in this directory, as raw source, keyed by path.
 *
 * <p>Written as a literal `import.meta.glob` call because Vite replaces it at
 * transform time by matching that exact expression — assigning `import.meta`
 * to a variable first, or casting it inline, leaves the call intact at
 * runtime and it fails with "statically replaced during file transformation".
 *
 * <p>Rooted at the project rather than written `./*.ts`. The relative form
 * resolved against this file in an ordinary run and against the *project
 * root* once coverage instrumentation was switched on — where it matched a
 * single unrelated file, `playwright.config.ts`, and every rule below became
 * a statement about the wrong directory. The count guard is the only reason
 * that was not silent. An absolute pattern has no base to shift.
 *
 * <p>`?raw` returns the committed bytes in both modes; that was checked
 * rather than assumed, because a rule read off transformed output would be
 * asserting about something nobody wrote.
 *
 * <p>Its type comes from the reference above rather than from the spec
 * tsconfig's `types` array, which is shared by every spec in the repository:
 * one test needing one type is a poor reason to widen what all of them see.
 */
const SOURCES: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob('/src/viewer-core/*.ts', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>).filter(([path]) => path !== THIS_FILE),
);

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

  it('reads the files this package actually contains', () => {
    // The count alone said "too few" when the glob re-based itself and
    // matched the project root instead. That is the right answer to the wrong
    // question: what had gone wrong was *where it was looking*, and naming a
    // file it must contain says so directly.
    expect(Object.keys(SOURCES)).toContain(PACKAGE_ROOT + 'ifc-tree.component.ts');
    expect(Object.keys(SOURCES)).toContain(PACKAGE_ROOT + 'model-geometry.ts');
    expect(Object.keys(SOURCES)).not.toContain(THIS_FILE);
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

  /**
   * Network access, in any of the forms it actually takes.
   *
   * <p>The assertions above forbid imports from the *application*. That is not
   * the same property as "does no I/O", and the gap was real rather than
   * theoretical: `ifc-tree.component.ts` sat in this package injecting
   * Angular's HTTP client and fetching a model tree, and every assertion here
   * passed — the HTTP client is a framework import like any other.
   *
   * <p>The README's first claim is "it knows no backend exists". This is that
   * claim, asserted. Under ADR 14 it is a property of the product rather than
   * a tidy arrangement of this repository: a host embeds the viewer
   * cross-origin, so there is no same-origin API for anything here to reach,
   * and a fetch added later would not fail here — it would fail at a
   * customer's site.
   */
  const NETWORK: ReadonlyArray<{ pattern: RegExp; what: string }> = [
    { pattern: /@angular\/common\/http/,               what: "Angular's HTTP client" },
    { pattern: /\bHttpClient\b/,                       what: 'HttpClient' },
    { pattern: /\bfetch\s*\(/,                         what: 'fetch()' },
    { pattern: /\bXMLHttpRequest\b/,                   what: 'XMLHttpRequest' },
    { pattern: /\bnavigator\.sendBeacon\b/,           what: 'sendBeacon' },
    { pattern: /\bnew\s+(?:WebSocket|EventSource)\b/, what: 'a socket' },
    // Quoted or interpolated only, so prose in a comment does not trip it.
    // The doc comment above names the path this caught and must not fail its
    // own rule.
    { pattern: /['"`]\/api\//,                         what: 'an /api path' },
  ];

  // A loop rather than it.each: zone.js's Vitest patch does not wrap the
  // `.each` variants, so calling one throws while the module is still being
  // evaluated. That failure takes the whole file with it — Vitest reports the
  // suite as failed to load and runs none of it, while the summary line still
  // reads "N passed" for everything else. A boundary check that never
  // executes is worse than one that does not exist, because the file being
  // present is what stops anyone writing it again.
  for (const { pattern, what } of NETWORK) {
    it(`fetches nothing — no ${what} anywhere in the package`, () => {
      const offenders = Object.entries(SOURCES)
        .filter(([, source]) => pattern.test(source))
        .map(([path]) => path)
        .sort();

      expect(offenders).toEqual([]);
    });
  }

  it('lets no production file reach outside at all, helper included', () => {
    // The exemption above is for specs. Nothing that ships may use it —
    // otherwise `../testing/` becomes a hole the next import walks through.
    expect(filesWhere(
      line => /from\s+['"]\.\.\//.test(line),
      path => !path.endsWith('.spec.ts'),
    )).toEqual([]);
  });
});
