/**
 * Chapters 11 onward: performance, the build and its gates, and the standing
 * statement of what is not done.
 */
const B = require('../build.js');
const { p, lead, h1, h2, h3, bullet, code, note, table, caption,
        diagramBoundary, diagramIngress, diagramIdentity,
        titleBlock, makeDoc, section, Packer, Paragraph, TextRun,
        TableOfContents, PageBreak, HeadingLevel, AlignmentType, fs,
        TEAL, RED, GRAPHITE, HEAD_BG, TEAL_BG, RED_BG } = B;

module.exports = [
  h1('11.  Performance'),
  p('§7.1 applies unchanged: every interactive request under a second, bulk work async with a job '
  + 'id returned in under a second. Conversion is bulk by definition.'),
  p('Frontend budgets — LCP < 2.0 s, INP < 200 ms, CLS < 0.1, initial bundle < 250 KB gzipped — '
  + 'are the ones the viewer can actually breach on its own. The PDF and 3D renderers are the '
  + 'risk: both are lazy-loaded via dynamic `import()` so they never enter the initial bundle.'),
  p('Large files never touch application memory. A 2 GB IFC streams to object storage and is '
  + 'processed out of process; §7.7’s prohibition on `readAllBytes` over user content is absolute.'),

  h1('12.  Build and verification'),
  p('Angular 22 with TypeScript strict **and** `noUncheckedIndexedAccess`. Third-party JavaScript '
  + 'is bundled, never loaded from a CDN — §5.12 A08, and it is also what makes air-gapped '
  + 'deployment possible.'),
  note('**The Node version note has now been wrong twice, in opposite directions, and the facts '
     + 'are worth stating carefully because they qualify every test claim in this document.** The '
     + 'issue before last said `ng test` cannot run on Node 22.22.2 at all. The last issue '
     + 'corrected that to “npm’s engine range is advisory unless `engine-strict` is set” and '
     + 'reported the suite running. Both are half right, and the half that matters is this: '
     + '**npm’s `engines` check is advisory, and the Angular CLI’s own runtime check is not.** They '
     + 'are two different gates. `npm ci` installs happily; `ng test` then reports the detected '
     + 'version, states that the CLI requires v22.22.3 or v24.15.0, and exits without running '
     + 'anything. Whether the suite runs depends entirely on which Node is on `PATH`, not on '
     + '`engine-strict`.'),
  p('The development container ships 22.22.2, which is 0.0.1 below the floor, so **running the '
  + 'suite there requires a newer Node** — installing 24 and putting it first on `PATH` is enough, '
  + 'and that is how the figures below were measured. A fresh container needs it again; nothing in '
  + 'the repository pins it. Recorded at this length because a 0.0.1 shortfall that stops the '
  + 'entire test suite, with an error message about npm engines nowhere in it, is exactly the kind '
  + 'of thing the next person loses an hour to.'),
  p('On a Node that satisfies it, `ng test` and `ng build --configuration production` both run: '
  + '**2,180 specs pass, and the production build is clean.** TestBed specs are the majority of '
  + 'them.'),
  p('That correction is load-bearing in an unwelcome direction. Several components had never been '
  + 'type-checked against their own templates, because `ng test` does not type-check a component '
  + 'no spec imports and `tsc --noEmit` does not check Angular templates at all. Only '
  + '`ng build --configuration production` catches both, and running it surfaced real defects — a '
  + 'template referencing a signal that did not exist, another calling `new` where the Angular '
  + 'parser has no `new`. Both checks stay in the loop.'),
  p('What remains true: the demo’s end-to-end tests drive a stub viewer rather than the real one, '
  + 'so **the `/embed` route still has not been rendered by Angular inside a host frame on an '
  + 'installed deployment** (§13).'),

  h2('12.1  Coverage'),
  p('**§14’s figures are now the gate.** `angular.json` requires 90% line and 85% branch — the '
  + 'standard itself — where it previously required 78/78, which was a figure the suite happened '
  + 'to reach rather than one anybody had chosen. Measured: **90.26% line (5,574/6,175) and 85.62% '
  + 'branch (2,781/3,248)**, with statements at 87.5% and functions at 74.9%, both also gated at '
  + 'their measured values so neither can fall.'),
  note('**The denominator grew while the work was done** — from 5,375 lines to 6,175. The '
     + 'builder’s `coverageInclude` filters rather than forces inclusion, so v8 counts a file only '
     + 'once something imports it, and each new spec pulls in its component’s whole dependency '
     + 'tree. Coverage therefore *fell* before it rose: the first few specs took the reported '
     + 'figure from 79.4% down to 76.2% by making eight hundred previously invisible lines '
     + 'visible. The figure now covers substantially more of the application than the 79.4% it '
     + 'started from did, which is the opposite of how a rising coverage number usually reads.'),
  p('**The figure is a floor and not the point**, and §14 says so: high coverage with weak '
  + 'assertions is worse than honest lower coverage. Every assertion written to reach it was '
  + 'checked by deliberately breaking the thing it guards and confirming it failed only the cases '
  + 'that name it — nineteen deliberate weakenings in all. That is also how the nine untranslated '
  + 'strings in section 9.4 and the `role="toolbar"` defect in section 9.3 were found. Neither was '
  + 'failing anything.'),
  p('Where the remaining 10% sits: the PDF markup layer’s pointer handling, the collaboration '
  + 'service’s socket lifecycle, the embed page’s stroke session, and `pdf-engine.service`’s '
  + 'rendering paths — all of them code whose behaviour is a canvas or a socket rather than a '
  + 'return value, and none of them untested by accident.'),

  h2('12.2  Gates'),
  p('Each of these fails loudly rather than warning, and each exists because the thing it checks '
  + 'is otherwise invisible in a diff.'),
  table([2900, 6846], [
    { header: true, cells: [{ t: 'Gate' }, { t: 'What it asserts' }] },
    { cells: [{ t: 'check:no-remote-code' },
      { t: 'Nothing in src/ or demo/ loads executable code from a CDN. Two roots, each with its own minimum file count, so a wrong path fails instead of passing vacuously' }] },
    { cells: [{ t: 'check:attribution' },
      { t: 'THIRD-PARTY-NOTICES.txt regenerates to exactly what is committed. It regenerates and asks git, rather than checking the file exists — the backend learned that distinction the hard way, with a shipped attribution naming a version it no longer had' }] },
    { cells: [{ t: 'check:icons' },
      { t: 'The application icons and favicon match their generator byte for byte, and the mark stays inside the maskable safe zone' }] },
    { cells: [{ t: 'check:samples' },
      { t: 'The demo’s three sample documents match their generator byte for byte' }] },
    { cells: [{ t: 'test:demo' },
      { t: 'Eight Playwright tests drive the demo host in a real browser' }] },
    { cells: [{ t: 'check:i18n' },
      { t: 'The committed message catalogue regenerates to exactly what is in the tree. It captures the extractor\u2019s stderr rather than inheriting it, because duplicate message ids are reported there and it exits 0 regardless \u2014 two source strings sharing an id means one of them ships the wrong words in every translated language' }] },
    { cells: [{ t: 'check:i18n-markup' },
      { t: 'No component template carries user-facing text a translator will never see' }] },
    { cells: [{ t: 'check:served-assets' },
      { t: 'Nothing in the built bundle is unreachable code' }] },
    { cells: [{ t: 'test:scripts' },
      { t: 'The gate scripts themselves have tests, so a gate cannot pass by being broken' }] }
  ]),
  caption('Table 6 — The repository’s own gates.'),
  p('**Five of these nine now run in CI**, against four last time. The platform’s `Jenkinsfile` '
  + 'runs `npm ci`, `tsc --build --force --noEmit`, `check:no-remote-code`, `check:i18n`, '
  + '`check:i18n-markup`, `test:scripts`, `ng build` and `ng test` against this repository. '
  + '`check:attribution`, `check:icons`, `check:samples`, `check:served-assets` and `test:demo` '
  + 'exist, pass locally, and guard nothing until a pipeline stage calls them. A gate nothing '
  + 'runs is documentation.'),
  note('One correction to the `tsc` line in the last issue: the pipeline passes `--build --force`, '
     + 'not a bare `--noEmit`. `tsconfig.json` carries `"files": []` and project references, so '
     + '`tsc --noEmit` type-checks nothing at all and exits 0 — proven by putting a type error in '
     + 'a production file and watching it pass. **A gate that cannot fail is worse than no gate, '
     + 'because it is quoted.**'),
  note('**`check:attribution` is currently failing, and it is not this issue’s doing.** Two '
     + 'transitive packages carry licences on neither §2.1’s allowed nor its forbidden list: '
     + '`caniuse-lite` (CC-BY-4.0, a browser-support dataset) and `lru-cache` (BlueOak-1.0.0, an '
     + 'OSI-approved permissive licence). Both arrive only through `@angular/build` and '
     + '`@angular/cli`, which are devDependencies, but the lockfile marks them '
     + 'production-reachable so the generator counts them. Neither is forbidden and both look '
     + 'shippable; adding a licence to the allow-list is a policy decision rather than an '
     + 'engineering one, so the generator refuses to write `THIRD-PARTY-NOTICES.txt` over an '
     + 'unresolved violation rather than assert a position nobody took. **This blocks §17.6’s '
     + 'release checklist until someone rules on it.**'),

  h1('13.  What this architecture does not yet have'),
  lead('Stated plainly, and shorter than it was. The gap between “the viewer works” and “a CDE can '
     + 'integrate it” used to be a set of undecided contracts; it is now a set of unfinished jobs, '
     + 'in rough order of what blocks what.'),
  p('**No document has opened in a host frame on an installed deployment.** Section 10.2. The '
  + 'pieces are each verified — the protocol against an independent host, the allow-list against '
  + 'its own tests, the served document against a real browser — and the whole has never run. '
  + 'This is the next thing to do and the thing most likely to surface something nobody '
  + 'predicted.'),
  p('**The library and the application are built from one repository.** The image serves the '
  + 'Angular build staged into the backend’s context, which works and means the frontend is '
  + 'versioned with the backend that carries it. A customer wanting the viewer without the '
  + 'platform still has no artefact of their own; that waits on `viewer-core` being published, '
  + 'below.'),
  p('**The embed opens PDF and nothing else.** Section 4.3. The conversion service exists; the '
  + 'embed path does not call it.'),
  p('**Collaboration has no identity in an embed.** Live cursors and presence ride a STOMP socket '
  + 'authenticated by the page session, and an embedded viewer has no session. ADR 14 accepted '
  + 'this as the loose end that “no identity” leaves; it is unsolved rather than decided.'),
  ...diagramIdentity(),
  p('**No external document identity on our own `Document`.** The protocol carries `externalId` '
  + 'end to end, so an embedding host never needs one — but the platform’s own `Document` entity '
  + 'still has no such column, so anything integrating through `/api/documents` keeps a map '
  + 'between its id and our numeric one.'),
  p('**35 endpoints across 15 files** — 11 services and 4 components — derived by walking imports '
  + 'transitively from every viewer component, viewer service and `viewer-core` file. Two groups '
  + 'drive the design: **five are content**, and are exactly what the ingress replaces, and '
  + '**seventeen are document operations**, which ADR 14 assigned to the host. The remainder is '
  + 'markup, identity and collaboration.'),
  note('That total has been wrong twice, in the same direction. It was “seven”, then “26 across '
     + '9”, and both were undercounts — the first from grepping directories instead of following '
     + 'imports, the second from a resolver that turned `role.service` into `role.ts` by replacing '
     + 'the extension rather than appending one, so every `*.service.ts` import silently failed to '
     + 'resolve and its endpoints were never counted. **A count that resolves imports must fail '
     + 'loudly when one does not resolve**, or it reports the surface it could see as the surface '
     + 'that exists.'),
  note('**And it is not settled yet.** `viewer-extraction-inventory.md` §2 gives a total of 35 '
     + 'across 11 services and 4 components, but its own table lists ten services, and its group '
     + 'sizes — content 5, document operations 17, markup 7, identity 2 — sum to 31. Two of those '
     + 'three figures must be wrong. The groups quoted above are the ones the inventory states '
     + 'unambiguously and that a design decision actually turns on; **the partition needs '
     + 're-deriving before it goes in front of a customer**, and no number here should be quoted '
     + 'as a complete breakdown until it does.'),
  p('**A library in shape, never built as one — and now with a known reason.** `viewer-core` has '
  + 'its manifest, its ng-packagr configuration and its own `angular.json` project, so '
  + '`ng build viewer-core` is a real target. The last two issues gave two different wrong '
  + 'accounts of it: first that it could not run for the Node reason, then that the Node reason '
  + 'was wrong so nobody had run it.'),
  p('It has now been run, on a Node that satisfies section 12’s floor. **It fails, with 53 errors, '
  + 'all of them the same one:** `Cannot find name \'$localize\'`, across ten of the `viewer-core` '
  + 'files. The cause is one line — `tsconfig.app.json` carries `"types": ["@angular/localize"]`, '
  + 'which is what puts the `$localize` global in scope, and `tsconfig.lib.json` carries '
  + '`"types": []`, which clears it. The library sources are the application sources, so every '
  + '`$localize` call in them is an unresolved name under the library’s own compiler options.'),
  note('**That line has deliberately not been changed**, because adding the type would make the '
     + 'build succeed and produce an artefact nobody has decided to publish — and it would decide '
     + 'something on the way. A library published with `$localize` calls still in it requires every '
     + 'consumer to run Angular’s localize transform over our code, which is a packaging contract '
     + 'to offer a host CDE, not a compiler setting to flip while correcting a document. The '
     + 'alternatives — extracting the strings to an injected catalogue, or shipping the library '
     + 'pre-localised per locale — are the same decision seen from two other sides. The target '
     + 'exists, it does not build, the reason is understood and small, and what it waits on is the '
     + 'publish decision the `UNLICENSED` marker already records as untaken.'),
  p('**Accessibility evidence.** The artefacts exist in `cde-platform/docs/accessibility/` — an '
  + 'accessibility statement, a VPAT 2.5 INT conformance report, and a screen-reader matrix — and '
  + 'all three say the same thing about themselves: the statement is a draft not fit to publish, '
  + 'every criterion in the ACR reads Not Evaluated or Does Not Support, and no screen-reader pass '
  + 'has been run. **What is missing is not the document; it is the evidence the document is '
  + 'supposed to cite.** There is still no axe run, no Lighthouse budget, and no gate in the '
  + 'pipeline to produce either.'),
  p('What has changed is the ground underneath them. The defects in sections 9.2 and 9.3 were '
  + 'real conformance failures and they are fixed, with a keyboard-operable test pinning each '
  + 'one — so an ACR filled in today would read differently from one filled in at the last issue. '
  + 'It would still read mostly Not Evaluated, because a test asserting an `aria-label` exists is '
  + 'not a screen-reader pass and must never be reported as one (§1A.5). **The ACR has not been '
  + 'updated, and should not be until someone runs the matrix.**'),
  p('The embed makes this worse rather than inheriting it. Focus crossing a frame boundary, '
  + 'printing from inside a frame, and 200% zoom in a host-sized frame are all new surfaces that '
  + 'need testing afresh, and some of them will be worse than the standalone viewer. §1A is '
  + 'explicit that without a current conformance report the public-sector buyers this product '
  + 'targets cannot be bid to at all — and an independent audit has the longest lead time of '
  + 'anything on this list.'),
  p('**Brand and copyright.** The application mark is our own work and deliberately generic; the '
  + 'product has no name or logo that has been through trademark clearance, and `LICENSE` and '
  + '`NOTICE` still carry a placeholder where the copyright holder’s legal entity goes. An '
  + 'obviously unset placeholder is the right state until the entity is decided — a '
  + 'plausible-looking wrong name is a false statement of ownership that survives into every '
  + 'distribution.'),
  note('The shape of this list has changed since the last issue. The embed and identity contracts '
     + 'were **decisions nobody had taken**; they are taken, specified and implemented. What '
     + 'remains is work nobody has done — and the first item is one response header.')
];
