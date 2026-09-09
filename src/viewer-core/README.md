# @cde/viewer-core

The server-independent rendering core of the CDE document viewer: PDF and CAD
rendering, the markup layer, measurement, outline navigation and drawing search.

**It knows no backend exists.** Nothing in this package fetches, authenticates,
or persists. You give it bytes and it draws them; you read its state and decide
what to do about it. That property is enforced by a test, not a convention — see
"The boundary" below.

## Install

```bash
npm install @cde/viewer-core
```

Peer dependencies: Angular 22 (`core`, `common`, `forms`, `platform-browser`)
and `pdfjs-dist` 6. They are peers rather than dependencies so your application
controls the versions and there is exactly one Angular in the tree.

## What you get

**Services** — inject them; they hold state and do work.

| | |
|---|---|
| `ViewerStateService` | The single store. Signals for document, page, zoom, rotation, active tool, selection and sidebar tab |
| `MarkupEngineService` | Drawing: pointer events, shape creation, SVG rendering, hit testing |
| `PdfEngineService` | `pdfjs-dist` wrapper — load, render a page to canvas, extract the text layer |
| `MeasurementService` | Scale calibration and the geometry behind length, area and radius |
| `OutlineService` | A PDF's bookmarks and link annotations |
| `DrawingSearchService` | Text search across a converted drawing's labels |

**Components** — standalone; import the ones you want.

`CadViewerComponent` · `IfcTreeComponent` · `OutlinePanelComponent` ·
`PageLinksComponent` · `ToolRailComponent` · `IconComponent`

**Types and the tool catalog** — `ViewerData`, `ShapeData`, `MarkupTool`,
`IconName`, `OutlineEntry`, `PageLink`, `DrawingMatch`, `Tool` and the rest, plus
`TOOL_SECTIONS`, `allTools()`, `toolForKey()`, `MEASUREMENT_UNITS`.

```ts
import { ViewerStateService, CadViewerComponent } from '@cde/viewer-core';
```

## What you do not get, and must supply

This is the honest half of the README.

- **No HTTP.** Fetching the document is yours. The conversion API that turns
  DWG, DXF and Office files into something renderable is a separate service —
  see the integration guide.
- **No identity.** Components that attribute work to a person take a display
  name from you; the package has no notion of a session.
- **No persistence.** Markup lives in `ViewerStateService` until you do
  something with it.
- **No 3D canvas.** `IfcTreeComponent` renders the model *hierarchy*, which is
  the accessible route to the same information and the primary interface. The
  WebGL view is not part of this package.

## The boundary

`viewer-core.boundary.spec.ts` reads every source file in the package and fails
if any of them imports from an application — by directory name, by any `../`
reach, or at all for production files. One `inject(AuthService)` added in a hurry
would turn a copy into a migration, and nothing else in a build would notice,
because an application compiles perfectly well with the dependency pointing the
wrong way.

Components sit flat beside the services rather than under `components/`,
because the glob is `./*.ts` and the rule forbids every `../` import: a nested
component reaching back for `../viewer-state.service` would escape the glob and
trip the rule it escaped.

## Building

```bash
npx ng-packagr -p src/viewer-core/ng-package.json -c src/viewer-core/tsconfig.lib.json
```

`ng build viewer-core` is the normal route and does the same thing, but the
Angular CLI enforces a Node floor (≥ 22.22.3) that some environments do not
meet; invoking `ng-packagr` directly bypasses the wrapper, not the compiler.

`tsconfig.lib.json` sets `compilationMode: "partial"` deliberately. Without it
ng-packagr compiles in full mode and writes a `prepublishOnly` script into the
manifest that **refuses to publish**. The package builds either way, so this is
only visible at the moment you try to ship it.

## Status

`0.1.0`, and pre-1.0 for a reason: the integration contract this package sits
behind — how a host mounts it, how it learns who the user is, and where markup
goes — is not settled (ADR 12, step 4). The rendering API is stable in practice;
anything touching the host is not.

`UNLICENSED` is deliberate rather than an oversight, and it stays. The
repository now has `LICENSE`, `NOTICE` and a generated
`THIRD-PARTY-NOTICES.txt`, so the §17.2 attribution obligation is met and this
package is covered by the repository's licence — but *whether* to publish it,
and under what terms, is a decision nobody has taken. The marker is what makes
an accidental `npm publish` fail loudly instead of shipping this to a public
registry on the strength of a default. Removing it is that decision.

Two things still block publication: the copyright holder in `LICENSE` is a
placeholder, and `docs/licences.md` §3.1 records a third-party mark shipping
as the application's PWA icons.

The npm scope is provisional. A 404 on `@cde/viewer-core` means the *package*
does not exist; it does not prove the *scope* is ours. Register it before
publishing.
