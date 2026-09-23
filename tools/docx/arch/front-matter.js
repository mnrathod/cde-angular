/**
 * Title block, scope, and the contents page.
 *
 * <p>The document is assembled from one file per group of chapters because
 * it had grown to 631 lines in a single array, past the §3.3 limit. Each
 * file exports the elements of its own chapters and `arch.js` concatenates
 * them, so the order of the document is stated in one place and the prose of
 * a chapter is editable without scrolling through the rest.
 */
const B = require('../build.js');
const { p, lead, h1, h2, h3, bullet, code, note, table, caption,
        diagramBoundary, diagramIngress, diagramIdentity,
        titleBlock, makeDoc, section, Packer, Paragraph, TextRun,
        TableOfContents, PageBreak, HeadingLevel, AlignmentType, fs,
        TEAL, RED, GRAPHITE, HEAD_BG, TEAL_BG, RED_BG } = B;

module.exports = [
  ...titleBlock(
    'Technical Architecture',
    'The document viewer as a product a third-party common data environment embeds.',
    ['**Status.** The rendering core is built and boundary-enforced, and so is the integration '
   + 'surface: the `cde.viewer.v1` embed protocol is implemented on both sides and tested '
   + 'against an independent host, the backend carries the `frame-ancestors` allow-list that '
   + 'used to refuse every frame, and the image serves the embed document itself. The demo host '
   + 'drives the whole protocol against it end to end. What has not happened is a real CDE '
   + 'integrating it.',
     '**Since the last issue**, the work has been conformance and structure rather than '
   + 'features: every hardcoded user-facing string is now a translatable message behind two CI '
   + 'gates (section 9.4); two drag-only interactions have a keyboard route, and a set of '
   + 'controls that announced themselves as glyphs now have names (sections 9.2 and 9.3); and '
   + '`viewer-core` is inside the section 3.3 size limits throughout (section 3.2). **One claim '
   + 'in the last issue was wrong** and is corrected in section 12 — the environment note that '
   + 'qualified every statement about test results.',
     'Section 13 states exactly what is left — read it before quoting anything here to a '
   + 'customer.']),

  p('**Scope.** The viewer as described by ADR 12 (`cde-platform`, '
  + '`docs/adr/0012-viewer-as-a-standalone-product.md`).'),
  p('**Companions.** `viewer-integration-guide.md` for how a host uses it; '
  + '`viewer-extraction-inventory.md` for what still has to move; and the platform’s own '
  + '`docs/architecture.md`, which remains the authority on tenancy, the ISO 19650 state machine '
  + 'and the request lifecycle.'),

  new Paragraph({ children: [new PageBreak()] }),
  h1('Contents'),
  new TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-3' }),
  new Paragraph({ children: [new PageBreak()] }),

  h1('1.  What this is, and what it is not'),
  p('**It is** a browser-side viewer for construction documents — PDF, DXF/DWG drawings, and IFC '
  + 'models — with a markup, measurement, redaction and signature layer over the top, plus the '
  + 'server-side conversion needed to turn formats a browser cannot read into ones it can.'),
  p('**It is not** a document management system. It does not own documents, users, projects, '
  + 'permissions or an audit trail. The host CDE owns all of those, and the viewer’s job is to '
  + 'borrow a document briefly, render it, and hand back what the user drew on it.'),
  p('That distinction is the whole architecture. Every design decision below follows from '
  + '“the bytes belong to someone else”.'),

  h1('2.  Three layers, and the one that matters'),
  ...diagramBoundary(),
  p('**`src/viewer-core/` is the product.** 3,220 lines of production TypeScript across 15 source '
  + 'files, with 8 spec files beside them. Nothing in it imports anything from the application — '
  + 'not a service, not a model, not an environment constant. When the separate repository exists, '
  + 'this directory is **copied, not untangled**.'),
  p('It is now shaped as a library rather than a directory: `package.json`, `ng-package.json`, '
  + '`tsconfig.lib.json` and a curated `index.ts`, registered in `angular.json` as a second '
  + 'project built by `@angular/build:ng-packagr`. The name is `@cde/viewer-core` and the licence '
  + 'field reads `UNLICENSED` — deliberately, so an accidental `npm publish` fails rather than '
  + 'quietly shipping to a public registry with no licence position. Removing that marker is a '
  + 'commercial decision, not a cleanup.'),
  p('The application shell above it is this platform’s own consumer of the viewer. It is not part '
  + 'of the product; it is the first integrator, and useful precisely because an awkward contract '
  + 'will be awkward for us first. Since the embed shipped there is a **second** consumer — '
  + '`demo/`, a host application in plain JavaScript — and it is the more honest of the two, '
  + 'because it is the side an integrator actually writes.'),

  h2('2.1  The boundary is asserted, not intended'),
  p('`viewer-core.boundary.spec.ts` reads every `./*.ts` in the directory through Vite’s '
  + '`import.meta.glob` and fails on four conditions.'),
  table([4400, 5346], [
    { header: true, cells: [{ t: 'Assertion' }, { t: 'Why it exists' }] },
    { cells: [{ t: 'At least 6 source files present' },
              { t: 'A renamed directory would otherwise make every check below vacuously true' }] },
    { cells: [{ t: 'Nothing imports app/, core/, features/, shared/, environments/' },
              { t: 'The dependency that breaks extraction' }] },
    { cells: [{ t: 'Nothing reaches above the directory except ../testing/ from a spec' },
              { t: 'Catches the same thing if a folder is renamed' }] },
    { cells: [{ t: 'No production file reaches outside at all' },
              { t: 'Stops the test-helper exemption becoming a hole' }] }
  ]),
  caption('Table 1 — The four boundary assertions.'),
  p('One `inject(AuthService)` added in a hurry turns a copy into a migration, and **nothing else '
  + 'in the build would notice** — the application compiles perfectly well with the dependency '
  + 'pointing the wrong way. That is why this is a test and not a convention.'),
  p('Components sit flat beside the services rather than in a `components/` subdirectory. The glob '
  + 'is `./*.ts` and the rule forbids every `../` import, so a nested component reaching back for '
  + '`../viewer-state.service` would both escape the glob and trip the rule it escaped.'),
];
