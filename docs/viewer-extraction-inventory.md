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

**26 endpoints across 9 services.** Method: every `/api/...` literal in each
service the viewer imports.

> An earlier note in this engagement said "seven endpoints". That was wrong —
> it came from grepping two directories rather than following the imports. The
> real surface is nearly four times larger, and it is the difference between a
> weekend and a project.

| Service | Endpoints | Notes |
|---|---|---|
| `viewer.service` | `/api/viewer/{id}`, `/api/viewer3d/{id}`, `/api/annotations`, `/api/annotations/document/{id}`, `/api/annotations/document/{id}/xfdf` | 5 — the core read path |
| `signature.service` | `/api/signatures/{id}`, `/api/signatures/{id}/verify`, `/api/signatures/document/{id}`, `/api/signatures/document/{id}/sign` | 4 |
| `page.service` | `/api/documents/{id}/pages` + `/arrange`, `/extract`, `/insert` | 4 |
| `document.service` | `/api/documents/{id}`, `/status`, `/project/{id}`, `/upload` | 4 |
| `redaction.service` | `/find-text`, `/redact`, `/redact-matching` | 3 |
| `document-version.service` | `/versions`, `/versions/{v}/file`, `/versions/{v}/restore` | 3 |
| `pdf-form.service` | `/form-fields`, `/form-fill` | 2 |
| `auth.service` | `/api/auth/login`, `/api/auth/register` | 2 — see §3 |
| `ocr.service` | `/api/documents/{id}/ocr` | 1 |

These fall into three groups, and the grouping is the design:

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

**Permissions.** `role.service` is imported once. Worth confirming what it
gates before assuming it is as small as auth.

**Collaboration is same-origin by construction.** `collaboration.service`
builds its socket URL as:

```ts
`${protocol}//${window.location.host}/ws`
```

Embedded in a host application on a different origin, that points at the
host, not at us. It needs to become configuration, and the STOMP connection
needs its own authentication rather than riding the page's session.

**There is no API base URL anywhere.** Every call is a relative `/api/...`
path. The whole frontend assumes it is served from the same origin as the
backend. **For an embeddable product this is the single most pervasive
change** — it touches every service, and there is no existing seam to thread
it through.

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

All three are permissive and cause no §2.1 problem. The licence exposure in
this product is not in the frontend — it is `dwg2dxf`, in the converter image
(§6).

---

## 5. Sequencing

The dependency order falls out of the above rather than being chosen:

1. **Configurable API base URL.** Everything else assumes it, and it touches
   every service. Nothing can be embedded anywhere until this exists.
2. **Move the six pure services and their components.** No server contract
   needed, so this is mechanical and provable — the 254-test suite covers
   most of it.
3. **The content path.** The integrator-minted URL fetch and conversion of
   ADR 12, replacing the five content endpoints.
4. **Decide the 17 document operations** one at a time: viewer-side against
   the fetched copy, host callback, or not in the product.
5. **Identity and collaboration.** Host-supplied display name; socket URL and
   its own auth.

---

## 6. What blocks shipping, regardless of the code

**LibreDWG.** `cde-platform/docs/licences.md` §4.1 records it: the converter
image contains a `dwg2dxf` binary built from GPL-3.0 source, with no
corresponding-source offer accompanying it. Operating a service with it
inside is one thing; **shipping an image to a customer is distribution, and
GPL-3.0 §6 makes that a breach today.** Close it by publishing the source, by
a written offer, or by requiring the ODA converter instead — but close it
before the first install, because it constrains whether DWG support can exist
in a distributed artifact at all.

**Trademarks.** "Works with Microsoft SharePoint" is nominative fair use.
Their name in a product name, their logo, or any suggestion of partnership is
not (§17.4). The integration documentation is where this will go wrong first.

**Attribution.** A separate distribution needs its own `LICENSE`, `NOTICE`
and `THIRD-PARTY-NOTICES.txt` (§17.2). The platform's file covers the
platform's dependency set, not this one.

---

## 7. Numbers, and how to re-derive them

| Measure | Value | Method |
|---|---|---|
| Viewer components | 23 | files under `features/viewer/`, excluding specs |
| Viewer services | 8 | files under `core/services/viewer/`, excluding specs |
| Implementation lines | 7,996 | `wc -l` over both, excluding specs |
| Platform services imported | 11 | cross-boundary imports from viewer code |
| Endpoints reached | 26 | `/api/...` literals in those services |
| Services needing no network | 6 of 8 | absence of `HttpClient` |
| Auth call sites | 3 | `auth.username()` |
