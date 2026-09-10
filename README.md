# CDE Platform — web client

The Angular front end of the CDE Platform: project and document management, a
2D drawing and PDF viewer with markup, and an IFC model view. The Spring Boot
back end lives in the `cde-platform` repository beside this one.

The npm package and Angular project are named **`cde-web`**. The repository
directory is still `cde-angular`, and the backend's `Jenkinsfile` refers to it
by that path — renaming a checkout is a separate, coordinated change.

---

## Quick start

```bash
npm ci
npm start          # http://localhost:4200, proxying /api per proxy.conf.json
```

The back end is expected at the target in `proxy.conf.json`. Without it the
application loads and the login screen works; anything that fetches will fail,
which is the honest failure rather than a mock.

```bash
npm test           # Vitest, via the Angular unit-test builder
npm run build      # production build into dist/cde-web/
```

**Node must satisfy the Angular CLI's `engines` range** — currently
`^22.22.3 || ^24.15.0 || >=26.0.0`. Below it, `ng` refuses to start and the
message is about the version, not about your code. `tsc --noEmit` and plain
`vitest` still run, which is enough for most checks but not for a build.

---

## Where things are

| Path | What |
|---|---|
| `src/app/features/` | Screens, one directory per feature |
| `src/app/core/` | Services, guards, interceptors, models |
| `src/viewer-core/` | **The viewer's server-independent core** — renders, measures, searches and tracks state without knowing a back end exists. See its `README.md` |
| `src/app/features/embed/` | The `/embed` route a host application frames, and the `cde.viewer.v1` protocol |
| `demo/` | A host application that embeds the viewer. Plain HTML and JavaScript, no build step — see `demo/README.md` |
| `docs/` | ADR-adjacent notes, the embed protocol, licence position |
| `tools/` | Build-time generators: application icons, the integration guide |

`viewer-core` is the part ADR 12 ships as a product. A boundary test fails the
build if anything in it imports from the application or reaches the network, so
the separation stays real rather than aspirational.

---

## Checks

Each of these is a gate, and each fails loudly rather than warning:

```bash
npm run check:no-remote-code   # nothing loads executable code from a CDN
npm run check:attribution      # THIRD-PARTY-NOTICES.txt matches the lockfile
npm run check:icons            # the app icons match their generator
npm run check:samples          # the demo's sample files match theirs
npm run test:demo              # the demo host, in a real browser
```

The three `check:*` generators are deterministic on purpose: regenerating
produces byte-identical output, so "these files came from this script" stays a
fact that can be re-verified rather than a claim in a document.

---

## The demo

```bash
npm start            # the viewer, :4200
npm run demo         # the host, :4401
```

Then open <http://localhost:4401>. Two ports because a different port is a
different origin, and the embed is a cross-origin contract — origin checks,
CORS on the document fetch, `frame-ancestors`. `demo/README.md` explains what
to try and what it deliberately does not show.

---

## Documentation

| File | What |
|---|---|
| `docs/viewer-embed-protocol.md` | The `cde.viewer.v1` contract, both directions |
| `docs/viewer-integration-guide.md` | The customer-facing integration guide |
| `docs/viewer-architecture.md` | How the viewer is put together |
| `docs/licences.md` | Approved licences, every asset's provenance, open findings |
| `CLAUDE.md` | The engineering standard this repository is held to |

Architecture decisions are recorded in `cde-platform/docs/adr/` — one directory
for both repositories, because most decisions span them.
