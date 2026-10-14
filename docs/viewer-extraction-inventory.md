# Viewer extraction inventory

What the viewer is, what it needs from a host application, and what has to be
decided before it can be lifted out of this repository and shipped as the
product ADR 12 describes.

This is a survey of the code as it stands on `claude/project-overview-x2emw4`,
not a plan. Every count below was taken from the source rather than estimated,
and the method is given so the numbers can be re-derived when they change.

---

## 1. What moves

**23 components** under `src/app/features/viewer/`, **8 services** under
`src/app/core/services/viewer/`, and **5 spec files** alongside them —
**7,996 lines** of implementation excluding tests.

```
features/viewer/
  viewer.component.ts, viewer-shell.component.ts
  pdf-viewer/        pdf-viewer.component.ts, pdf-page.component.ts
  cad-viewer/        cad-viewer.component.ts
  viewer3d/          viewer3d.component.ts, ifc-tree.component.ts
  compare-viewer/    visual-compare.component.ts
  toolbar/           markup-toolbar, tool-rail, tool-catalog
  sidebar/           viewer-sidebar.component.ts
  markup/            annotation-thread, document-signature, outline-panel,
                     page-links, page-organiser, pdf-form, redaction-panel,
                     remote-cursors, version-history

core/services/viewer/
  annotation, drawing-search, flatten, markup-engine,
  measurement, outline, pdf-engine, viewer-state
```

`shared/components/icon.component.ts` moves too: six files import it, and all
six are viewer files. Nothing else in the application uses it.

### 1.1 The part that is already portable

Six of the eight viewer services touch no network at all — verified by
checking each for an `HttpClient` dependency:

| Service | Network | What it does |
|---|---|---|
| `markup-engine` | no | shape geometry, hit-testing, SVG rendering |
| `measurement` | no | distance, area, calibration |
| `outline` | no | bookmark and outline tree |
| `drawing-search` | no | text search within a drawing |
| `viewer-state` | no | active tool, zoom, page, selection |
| `pdf-engine` | no | pdf.js wrapper — render, text layer, thumbnails |
| `annotation` | **yes** | reads and writes annotations |
| `flatten` | **yes** | burns markup into the document |

**This is the good news of the inventory.** The genuinely valuable and
hard-to-rebuild parts — the markup engine, measurement, the pdf.js
integration — have no server dependency and lift out unchanged. The
integration work is concentrated in two services and the components that
call the platform directly.

---

## 2. What it needs from a host — the integration contract

**45 endpoints over 48 call sites, in 13 files — 11 services and 2 loaders, no
components.** Method: walk imports transitively from every viewer component,
every embed component and every `viewer-core` file; collapse each `/api/...`
path's interpolations so one route counts once.

> **Corrected 2026-10-14, and no longer by hand.** This said "35 across 15 —
> 11 services and 4 components", which was itself a correction of "26 across 9",
> which corrected "seven". **All three were undercounts**, which is the
> expensive direction: this figure exists to size the ingress an external CDE
> has to build. The first came from grepping directories instead of following
> imports; the second from a resolver that turned `role.service` into `role.ts`
> by replacing the extension rather than appending one, so every `*.service.ts`
> import silently failed to resolve; the third was a hand count never re-run,
> wrong on three of its four numbers — there are no components in the list at
> all, and the two files that are not services are the PDF and comparison
> loaders.
>
> **`scripts/count-viewer-endpoints.mjs` now produces it** (`npm run
> count:endpoints`), and it refuses to print rather than printing a smaller
> number: an import that does not resolve stops the count, and so does a call
> whose URL is not a literal. The table below is its output, not a transcription
> of it.

The groups the design turns on: **five are content** (the document record, its
PDF bytes, and the three 3D model routes), exactly what a host's ingress
replaces; **twenty are document operations**, which ADR 14 assigned to the host;
the remaining twenty are the viewer's own — markup, identity, flattening.

| File | Call sites | What it reaches |
|---|---|---|
| `annotation.service` | 11 | markup read and write, replies, `resolve`, and XFDF both ways |
| `document.service` | 6 | the document record, `project/{id}`, `upload`, `status`, `pages`, delete |
| `auth.service` | 4 | `login`, `logout`, `register`, `session` |
| `page.service` | 4 | `pages` plus `arrange`, `extract`, `insert` |
| `pdf-form.service` | 4 | `form-fields` read, write and delete, plus `form-fill` |
| `signature.service` | 4 | sign, verify, list by document, delete |
| `document-version.service` | 3 | `versions`, `versions/{v}/file`, `versions/{v}/restore` |
| `redaction.service` | 3 | `find-text`, `redact`, `redact-matching` |
| `viewer.service` | 3 | the 3D model record, its tree and its geometry |
| `ocr.service` | 1 | `ocr` |
| `flatten.service` | 1 | `viewer/{id}/flatten` |
| `compare-documents-loader` | 2 | the document record and its PDF bytes, for each side |
| `viewer-document-loader` | 2 | the document record and its PDF bytes |

**No component reaches the API directly any more, and the claim that four did
was stale.** This paragraph named `viewer-shell`, `annotation-thread`,
`visual-compare` and — as the one that mattered — `viewer-core/ifc-tree.component.ts`,
said to call `/api/viewer3d/{id}/tree` from inside the package the boundary test
protects. **None of them does.** There is no `/api` literal in any component in
the repository: every one of those calls had already moved behind a service, and
nothing recorded it. A document that reports a boundary breach which does not
exist costs somebody an afternoon looking for it, which is why this is corrected
in place rather than deleted.

The observation underneath it still holds and is still unclosed: the boundary
test forbids *imports* across the `viewer-core` line, and a URL in a string
literal is not an import, so nothing would stop a component inside the package
calling the platform directly. That is a gap in the test, not a defect in the
code — but it is the reason the claim above was believable for three issues.

These fall into four groups, and the grouping is the design:

**Content (5).** Getting the document and its geometry. Under ADR 12 these
are replaced by the integrator-minted URL — this is the part the new fetch
pipeline serves, and it is the only group that must exist for a viewer to
open a file at all.

**Document operations (17).** Page manipulation, redaction, signing, form
filling, OCR, versions, flatten. Each is a round trip to a server that owns
the document. In the product these become either viewer-service operations
against the fetched copy, or callbacks the host implements — and that is a
per-operation decision, not one decision. **Signing and versioning are the
two where "the host owns the document" and "the viewer changed it" collide
hardest**: a signature over a copy the host has since replaced is worse than
no signature.

**Identity (2 + see below).** Not the viewer's business at all.

---

## 3. Couplings that are not endpoints

**Authentication — smaller than expected.** Viewer code calls exactly one
auth method, `auth.username()`, in three places, for annotation attribution.
There is no token handling in the viewer. Replacing it with a host-supplied
display name is close to trivial, and `auth.service` need not move.

**Permissions.** `role.service` is imported once inside the viewer, by
`annotation-thread`, to decide whether replies other than your own may be
deleted. Answered rather than left open, because the answer changed: the
service no longer holds a role-to-permission table of its own — it reads the
permission list the server sends with the session, so a host embedding the
viewer must supply that list (or an empty one, which hides the control) rather
than a role name the viewer would interpret. The previous table had drifted to
the point of naming three roles the platform has never had while missing two it
does, which is the argument against the host passing a role and this code
deciding what it means.

**Collaboration is same-origin by construction.** `collaboration.service`
builds its socket URL as:

```ts
`${protocol}//${window.location.host}/ws`
```

Embedded in a host application on a different origin, that points at the
host, not at us. It needs to become configuration, and the STOMP connection
needs its own authentication rather than riding the page's session.

**~~There is no API base URL anywhere.~~ Done, 2026-09.** Every call was a
relative `/api/...` path and the whole frontend assumed same-origin — the
single most pervasive change, with no existing seam. There is one now:
`API_BASE_URL` (`core/config/api-base-url.ts`), applied by
`apiBaseUrlInterceptor` to relative `/api` paths only, and by
`collaboration.service` by hand because an interceptor never sees a socket.
Empty by default, so same-origin deployment still needs no configuration.

**RFC 9457 problem details.** The viewer imports
`core/handlers/problem-detail` and expects that error envelope. A host
returning anything else gets unhandled failures, so it belongs in the
published contract rather than being assumed.

---

## 4. Third-party dependencies that travel

| Package | Licence | Note |
|---|---|---|
| `pdfjs-dist` ^6.2.108 | Apache-2.0 | The **legacy** build specifically — the default build calls `Map.prototype.getOrInsertComputed`, absent from Chromium 141 |
| `three` ^0.185.1 | MIT | Lazily imported (`import("three")`) in the 3D component only, with `OrbitControls` |
| `@stomp/stompjs` ^7.3.0 | Apache-2.0 | Collaboration transport |

All three are permissive and cause no §2.1 problem, which the generated
`THIRD-PARTY-NOTICES.txt` now confirms across the whole production closure
rather than these three. The licence exposure in this product was never in the
frontend's dependencies — it was `dwg2dxf` in the converter image, now removed
(§6), and it is the *icons* here that turned out to be the frontend's problem.

---

## 5. Sequencing

The dependency order falls out of the above rather than being chosen:

1. ~~**Configurable API base URL.**~~ **Done** — `API_BASE_URL` and
   `apiBaseUrlInterceptor`, §3 above.
2. ~~**Move the six pure services and their components.**~~ **Done** —
   `src/viewer-core/`, a buildable package with a boundary test.
3. **The content path.** The integrator-minted URL fetch and conversion of
   ADR 12, replacing the five content endpoints.
4. ~~**Decide the 17 document operations** one at a time~~ — superseded by
   **ADR 14** (`cde-platform`,
   `docs/adr/0014-viewer-embed-and-identity-contracts.md`),
   which proposes one rule instead of seventeen decisions: an operation that
   only reads or computes is viewer-side, an operation that changes the
   document is a host callback, and signing and versioning are host callbacks
   with no exception.
5. **Identity and collaboration.** ADR 14 proposes the identity half — the
   viewer authenticates nobody and authorises nothing; it is given a display
   name, a subject id to compare against, and capability flags that are UX
   only. The socket URL is done; its authentication is not, and is the one
   loose end that decision leaves.

---

## 6. What blocks shipping, regardless of the code

**~~LibreDWG.~~ Closed, 2026-09-08.** The converter image contained a
`dwg2dxf` binary built from GPL-3.0 source with no corresponding-source offer,
and shipping the image to a customer is distribution — a breach under GPL-3.0
§6. Closed by removing the binary rather than by discharging the obligation
(ADR 13). DWG now requires the operator-supplied ODA File Converter; DXF,
Office, PDF and IFC never used it and are unaffected.

**Trademarks.** "Works with Microsoft SharePoint" is nominative fair use.
Their name in a product name, their logo, or any suggestion of partnership is
not (§17.4). The integration documentation is where this will go wrong first.

**~~Attribution.~~ Closed, 2026-09-09.** This repository now has its own
`LICENSE`, `NOTICE` and generated `THIRD-PARTY-NOTICES.txt` — 38 production
components, all on the §2.1 allowed list. See `docs/licences.md`, which also
records what writing it turned up: the PWA application icons are the Angular
logo, which §17.4 does not permit and which blocks release.

---

## 7. Numbers, and how to re-derive them

| Measure | Value | Method |
|---|---|---|
| Viewer components | 23 | files under `features/viewer/`, excluding specs |
| Viewer services | 8 | files under `core/services/viewer/`, excluding specs |
| Implementation lines | 7,996 | `wc -l` over both, excluding specs |
| Files containing them | 13 | 11 services, 2 loaders, no components |
| Endpoints reached | 45 | distinct method + path across everything the walk reaches, over 48 call sites |
| Services needing no network | 6 of 8 | absence of `HttpClient` |
| Auth call sites | 3 | `auth.username()` |
