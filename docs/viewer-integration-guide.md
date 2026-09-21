# Viewer product — integration guide

For an engineer at a common data environment — Asite, Procore, Dalux, or your
own — who has to make this viewer open your customers' documents.

**Read section 1 before planning anything.** All four exchanges an integration
needs are built, you can run a working host application from this repository
today, the image serves the embed document itself, and the deployment carries a
`frame-ancestors` allow-list to put your origins on. What has not happened is a
real CDE integrating it. This guide says which parts you can build on now and
which you cannot, rather than describing an interface you would then fail to
find.

> **Since the last issue**, nothing in the protocol has changed — section 5 is
> the same contract. What changed is what you inherit when you embed it:
> section 7 now tells you what our accessibility and localisation position
> actually is, in enough detail to answer a procurement questionnaire without
> overstating it.

Companion: `viewer-architecture.md` for how the thing works internally.

---

## 1. What you can build against today

| # | Exchange | Direction | Status |
|---|---|---|---|
| 1 | Mount the viewer in your interface | you → viewer | **Built** — iframe + `cde.viewer.v1`. §5 |
| 2 | Tell the viewer who is looking | you → viewer | **Built** — `host.init.identity`, three untrusted fields. §5.5 |
| 3 | Hand over a document | you → viewer | **Built** — `host.init.document`, or the conversion API. §3 |
| 4 | Get back what was drawn | viewer → you | **Built** — markup events, lifecycle events and one operation pair. §5.3, §5.4 |
| — | A tier that serves the embed document | — | **Built** — the image answers `/embed` when `cde.web.app.path` points at a staged build. §5.2 |

Two things are true at once, and conflating them will cost you a sprint.

**The protocol is real.** `cde.viewer.v1` is implemented on both sides, and this
repository ships a host application — plain HTML and JavaScript, no framework,
no build step — that frames the viewer, drives the handshake, stores markup, and
refuses an operation. You can clone it, run it, and read it as the thing you are
about to write. §5.1 tells you how.

**The deployment is not, yet.** The `frame-ancestors` allow-list now exists —
`cde.web.embed-parent-origins` names the origins permitted to frame the embed
route, and it is closed until someone sets it. What is still missing is a tier
that serves the embed document at all: the backend image carries no frontend,
and the Kubernetes manifests route everything to the backend. So the embed runs
against a development deployment and not yet against an installed one. Ask where
your deployment will serve `/embed` from before you schedule anything around
it.

**The conversion API has no such caveat.** §3 is a complete, working integration
you can ship against today, inside your own interface, with your own
rendering — and for a "preview any file format" feature that is often the whole
requirement.

---

## 2. The shape of it

Your CDE keeps its documents and its users. The viewer borrows a document
briefly, converts it, and discards it.

```
   YOUR CDE                                    VIEWER
   ┌────────────────────┐                      ┌────────────────────┐
   │ your storage       │   3. signed link     │ conversion         │
   │ SharePoint/S3/Blob │ ===================▶ │ pipeline           │
   ├────────────────────┤                      ├────────────────────┤
   │ your IdP           │   2. identity     ✓  │ host.init.identity │
   ├────────────────────┤                      ├────────────────────┤
   │ your interface     │   1. mount        ✓  │ /embed + iframe    │
   │                    │ ◀ 4. markup       ✓  │ markup events      │
   ├────────────────────┤                      ├────────────────────┤
   │ your markup store  │   you stamp the author, the viewer never  │
   │                    │   sends one                               │
   └────────────────────┘                      └────────────────────┘

   ...frame-ancestors is an allow-list now, closed until your
   origins are named — but nothing serves /embed yet.  §5.2
```

**We never hold your credentials** and never learn which storage platform your
link points at. SharePoint, S3, Azure Blob and GCS all reduce to "a URL that
works for fifteen minutes", which is the property that makes this portable
across CDEs rather than a per-vendor connector.

---

## 3. Converting a document from your storage

### 3.1 Mint the link

Generate a short-lived, single-object download URL with your own credentials —
a Microsoft Graph download URL, an S3 presigned GET, an Azure blob SAS, a GCS
signed URL. Keep the expiry tight; we fetch once, immediately.

Do **not** send us a permanent URL, a URL that needs a credential we would have
to store, or a path on your internal network (§3.5 explains what happens).

### 3.2 Submit

```bash
curl -X POST https://viewer.example.com/api/conversions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 8f14e45f-ceea-467a-9f3a-1d2c9b7e4a51" \
  -d '{
        "sourceUrl": "https://files.example.test/drawings/site-plan.dwg?token=synthetic",
        "targetFormat": "PDF"
      }'
```

```
202 Accepted
{ "jobId": "3f2a71c4-9b0e-4a2d-8c11-5e7d9a1b3f40", "status": "PENDING",
  "sourceHost": "files.example.test", "targetFormat": "PDF" }
```

Both fields are required. `targetFormat` accepts `PDF` and nothing else today —
it is in the contract so that adding a second output is additive rather than
breaking. The `jobId` is a UUID; use it verbatim on every other endpoint.

Requires the `document:convert` permission. Returns in under a second — the
work has not happened yet, and that is the design (§7.1: an endpoint either
answers in under a second or hands back a job id in under a second).

**Always send `Idempotency-Key`.** A timed-out retry then returns the same job
rather than converting the same file twice, and conversion is the expensive
operation in this system.

**Note what is not echoed back: the URL.** Only its host is kept on the job
record. The link is a bearer credential, so it is never written to the
database, a log, or a message — which also means you cannot read it back to
find out what you sent.

### 3.3 Poll

```bash
curl https://viewer.example.com/api/conversions/3f2a71c4-9b0e-4a2d-8c11-5e7d9a1b3f40 \
  -H "Authorization: Bearer $TOKEN"
```

```
200 OK
{ "jobId": "3f2a71c4-9b0e-4a2d-8c11-5e7d9a1b3f40", "status": "SUCCEEDED",
  "sourceHost": "files.example.test", "sourceFileName": "site-plan.dwg",
  "targetFormat": "PDF", "resultSizeBytes": 486213, "failureReason": null }
```

`PENDING` while queued, `RUNNING` while working, then one of `SUCCEEDED`,
`FAILED` or `CANCELLED`. **Those three are terminal and never change again**,
so stop polling when you see one. On `FAILED`, read `failureReason`.

There is no progress percentage and no sub-stage — the job reports the state it
is in, not how far through it is. Back off as you poll; a large IFC will not
finish in the first second, and hammering the endpoint only costs you rate
limit.

### 3.4 Collect

```bash
curl https://viewer.example.com/api/conversions/3f2a71c4-9b0e-4a2d-8c11-5e7d9a1b3f40/content \
  -H "Authorization: Bearer $TOKEN" -o converted.pdf
```

Streamed, with `Content-Disposition: attachment` and `X-Content-Type-Options:
nosniff`. Cancel an in-flight job with `DELETE /api/conversions/{jobId}`.

### 3.5 What we refuse, and why

Your URL is dereferenced by our server, which makes it an SSRF vector. Every
submission goes through a destination policy that:

- **resolves the hostname and validates the resolved address**, not the string —
  a name that resolves to `169.254.169.254` is refused however it is spelled;
- refuses loopback, link-local, RFC 1918 (`10/8`, `172.16/12`, `192.168/16`),
  `::1`, and `.internal` names;
- **does not follow redirects at all.** Not "follows a capped number and
  re-validates" — none. Your link must resolve to the bytes directly. This
  catches people out with storage that 302s to a CDN, so test the exact URL you
  intend to send;
- requires `https` unless the deployment has explicitly opted out;
- enforces the deployment's list of permitted storage hosts, where one is
  configured — ask which hosts are allow-listed before you integrate;
- bounds the fetch: size enforced **during** the stream, plus connect and read
  timeouts.

A refused destination returns a problem document naming the rule that fired.
The URL is checked twice — once cheaply on submission so an obviously wrong
value fails fast, and once against the resolved address at fetch time, which is
the check that actually decides.

After the fetch: content type is decided by **magic bytes**, never by your
`Content-Type` header or the file extension; the file lands in a quarantine
prefix; ClamAV scans it; only then does it convert. An infected file is deleted
and the event audited.

### 3.6 Errors

RFC 9457 problem documents throughout, with a `traceId` you can quote:

```json
{ "type": "/problems/fetch-not-permitted",
  "title": "Fetch not permitted",
  "status": 422,
  "detail": "The source URL resolves to a private address (10.0.4.19).",
  "traceId": "4f8a1c2e9b7d6a5f3e2d1c0b9a8f7e6d" }
```

| Endpoint | Status | Means |
|---|---|---|
| `POST /api/conversions` | `202` | Accepted. **The `Location` header names the job to poll** — use it rather than assembling the URL yourself |
| | `422` | The link may not be fetched: wrong scheme, an unlisted host, or a refused destination (§3.5). This is the SSRF refusal — **it is a 422, not a 403** |
| | `429` | The **conversion queue is full**, not a per-caller rate limit. Retry after the interval in `Retry-After` |
| `GET /api/conversions/{jobId}` | `404` | No such job is visible to you. Note the wording: another tenant's job is invisible, not forbidden |
| `DELETE /api/conversions/{jobId}` | `404` | As above |
| `GET /{jobId}/content` | `409` | The job has not succeeded, so there is nothing to download yet. Poll to a terminal state first |
| | `404` | As above |

Read `detail` and show it. It is written to be shown. Quote `traceId` to
support — it is the only thing that ties your failure to our logs.

---

## 4. Formats

| Input | Status | Route | Notes |
|---|---|---|---|
| PDF | **Supported** | Passed through; rendered by `pdfjs-dist` | OCR available for scanned pages, adds an invisible text layer |
| DXF | **Supported** | `ezdxf` → SVG (viewer) or PDF (export) | Text is real and searchable in both |
| Office (docx, xlsx, pptx) | **Supported** | LibreOffice → PDF | |
| IFC | **Supported** | Geometry + hierarchy tree | Tree is the primary interface, not a fallback |
| DWG | **Needs ODA** | ODA → DXF, then as above | The image ships no DWG reader. The operator supplies an ODA File Converter — see below |
| DWF | **Not supported** | — | No route exists. Autodesk's Design Web Format is not read by any component of the pipeline |
| RVT / RFA | **Not supported** | Detected and refused | Recognised by OLE2 magic bytes and rejected with `REVIT_BINARY`. It is identified only so the error is clean |

> **DWG now requires an ODA File Converter that the operator supplies.** This
> changed, and in your favour if you were reading the previous edition. That
> edition said DWG worked in our hosted service and was unshippable
> on-premises, because the image bundled LibreDWG (GPL-3.0) and distributing it
> owed recipients corresponding source we did not provide. **LibreDWG has been
> removed.** Nothing encumbered is distributed, and the same rule now applies
> everywhere: mount an ODA installation, point `ODA_PATH` at it, and DWG
> works — hosted or on-premises, no distinction. Without one, the deployment
> has no DWG reader at all. ODA is licensed by you or your operator directly
> from the Open Design Alliance; check `odaRunnable` rather than
> `odaInstalled` in the status response, because a mount missing its libraries
> or its execute bit reports as present and is useless.

> **Only PDF opens inside an embedded frame today.** Everything in this table is
> supported through the conversion API in §3. The embed reaches the
> browser-rendered path only, so an embedded viewer asked for a `.docx` or an
> `.ifc` returns a 415 naming the format and saying the conversion service is
> what is missing. If your embedded use case is not PDF-first, raise it — the
> work is wiring, not design.

### 4.1  Why RVT and DWF are absent, and what it would take

These two are named separately because they are the ones most often assumed,
and because the reason they are missing is not "nobody got to it yet".

**RVT (and RFA) is a proprietary Autodesk binary with no open reader.** The
pipeline detects it by OLE2 magic bytes and refuses it deliberately, so you get
a clean `REVIT_BINARY` error rather than a corrupt render. Every route to
supporting it is commercial:

| Route | What it costs |
|---|---|
| Autodesk Platform Services (formerly Forge) | A cloud API. **It sends the model to Autodesk**, which collides directly with the data-residency and sovereignty position — for a Defence or IRAP-scoped tenant it is not merely a cost question, it is prohibited |
| Revit itself, plus an export plugin | Windows hosts, a licence per seat, and a rendering farm that is not the product's architecture |
| A commercial SDK (ODA BimRv or equivalent) | A vendor relationship and a per-deployment fee. ADR 13 settled the same question for DWG by making ODA operator-supplied rather than bundled, so the shape of the answer is known — it is a commercial conversation, not an open one |

The sovereignty collision is the important one. **The cheapest route is the one
we can least use**, because the tenants most likely to hold Revit models are
also the ones whose data must not leave the jurisdiction.

**DWF is unimplemented rather than refused.** It is a ZIP container holding W2D
and W3D streams, and reading it is ordinary engineering rather than a licence
problem — but no component of the pipeline knows the format today, so a DWF
submission will fail as an unrecognised type. If DWF matters to you, say so: it
is schedulable work in a way RVT is not.

**If you need either, raise it as a commercial requirement, not a bug.** The
answer involves a vendor contract and, for RVT, a residency decision that
engineering cannot take alone.

---

## 5. Embedding — built, and what your deployment must configure

**An iframe and a versioned `postMessage` protocol.** The viewer authenticates
nobody and authorises nothing: you mint a short-lived URL for the document, tell
it a name to display, and receive what the user did — every operation that
changes anything comes back to you to authorise server-side.

Recorded as ADR 14 (`cde-platform`,
`docs/adr/0014-viewer-embed-and-identity-contracts.md`), with the message-level
detail in `docs/viewer-embed-protocol.md`. Both sides are now implemented, and
the protocol document is the normative one — where it and this guide disagree,
it wins.

### 5.1 Run the demo host first

`demo/` in this repository is a host application that frames the viewer. It is
not the viewer, and that is the point: **it is the side you are about to
write**, in plain HTML, CSS and JavaScript with no framework, no build step and
no dependencies, because your stack is your business.

```bash
npm start                # the viewer, on :4200
node demo/server.mjs     # the host,   on :4401
# then open http://localhost:4401

# viewer somewhere else?
VIEWER_ORIGIN=https://viewer.example node demo/server.mjs
```

Two ports deliberately: a different port is a different origin, so the demo
exercises the real cross-origin path — origin checks on every message, CORS on
the document fetch, `frame-ancestors` on the viewer. A demo served from one
origin would pass with every one of those broken.

It ships three generated sample documents and a message log down the side, so
the handshake is visible as it happens. Worth trying in this order:

| Do this | See this |
|---|---|
| Open the drawing | `viewer.ready` → `host.init` → `viewer.loaded` in the log |
| Draw on it | The markup appears in the host's own store |
| Reload the page and reopen the document | The markup comes back. The viewer forgot; the host remembered |
| Change the display name, then draw again | The new name is stamped on a markup the viewer never put a name on |
| Tick `document:sign`, then use Sign | The control renders and the operation is **refused**. Both are correct |

### 5.2 The one thing your viewer deployment must change

> **A deployment that has not been told about you refuses your iframe, and the
> failure looks like a blank frame rather than an error.** `frame-ancestors` is
> `'none'` until your origins are named, deliberately: opening the embed is a
> configuration act and never a default. This is not something you can set from
> your side.

The setting is `cde.web.embed-parent-origins` — a list of exact origins,
`'none'` when empty, and validated at startup. Wildcards, the `null` origin, CSP
keywords and anything carrying a path are all refused by name, because **a
`frame-ancestors` source a browser cannot parse is not a closed door**: the
browser drops what it cannot read and applies the rest, so a typo widens the
policy rather than breaking visibly. Give your deployment contact the exact
origins you will frame from, including scheme and any non-default port.

This header is the **authorisation** decision about who may frame the viewer.
The `parentOrigin` you configure in the handshake is only addressing — it says
where the viewer should post, not who is permitted to frame it. A deployment
that relaxed only the second would be framable by anyone who sent the right
message.

> **The remaining gap is not the header.** The setting governs what the
> *backend* answers. Where a deployment serves the Angular build from a separate
> web tier, that tier serves the `/embed` document and must carry the same
> value — and as the manifests stand, nothing serves `/embed` at all. So ask your
> deployment contact two questions, not one: which of your origins are on the
> allow-list, and **what will serve the embed document.**

### 5.3 The minimum integration

Four steps, and none of them involve a token.

1. **Frame the embed route** and listen for messages, checking `event.origin`
   against the viewer origin on every single one — not once at setup.
2. **Wait for `viewer.ready`**, then post `host.init` with the document (a
   short-lived URL, its media type, a display name, and your own `externalId`)
   and, if the user may do more than read, an identity block.
3. **Store what comes back.** `viewer.markupCreated`, `…Updated` and
   `…Deleted` carry the markup; `shapeData` is an opaque string you store and
   hand back, never parse. Stamp the author yourself from the session you
   already hold.
4. **Listen to as much of the rest as you need, and none of it if you do not.**
   §5.4 lists the lifecycle events. Every one is optional.
5. **Answer `viewer.operationRequest`** with `host.operationResult` —
   `applied`, `refused` or `failed`. One message pair covers all seventeen
   document operations; they are not seventeen message types.

> **Send no credential in any message, in either direction.** The document URL
> is a bearer credential with a short life and is the only thing resembling one
> that crosses the boundary; it is never stored, logged, or echoed back to you.
> Never post to `'*'`.

One subtlety worth internalising early: **a `refused` must be possible even for
an operation whose capability you granted in `host.init`.** Capabilities decide
which controls render; authorisation happens when the operation is requested. If
the two ever disagree — the user's permission changed thirty seconds ago — the
`refused` is correct and the rendered button was merely stale.

Three operations never become viewer-side, whatever else changes:
`document.sign`, `version.create` and `version.restore`. A signature over a copy
you have since replaced is worse than no signature, and the viewer cannot know
whether its copy is still current.

One constraint from the previous edition of this guide is unchanged and still
catches people: **the CORS source registers no origin at all unless the
deployment names one in full.** For a PDF, the browser fetches your URL
directly, so your storage must allow the viewer's origin to read it.

### 5.4 Events you can hook, and what each is honestly for

Fourteen message types run viewer → host. Four exist purely so you can
**record** what a reader did without polling us or inferring it from markup
traffic — and the inference is wrong in ways that are not obvious, which is why
they exist.

| You want to know | Listen to | What to watch out for |
|---|---|---|
| A document was opened | `viewer.opened` | Fires before the viewer knows whether it can render the file, and before any fetch. Exactly one of `viewer.loaded` or `viewer.error` follows it |
| It rendered | `viewer.loaded` | Carries `pageCount`, `mediaType` and what rendered it |
| Your stored markup arrived | `viewer.markupLoaded` | **Check `rejected`.** Non-zero means your store holds markup the viewer cannot draw — a data problem on your side that was previously silent |
| The user drew, changed or removed something | `viewer.markupCreated` / `…Updated` / `…Deleted` | No author field. You stamp it from the session you already hold (§5.5) |
| The user selected a markup | `viewer.selectionChanged` | `markupId`, or `null` when nothing is selected |
| Which pages were actually read | `viewer.pageRendered` | **Once per page per document.** Zooming repaints a page and does *not* re-announce it, which is what makes a "pages read" count mean anything |
| Where the user is now | `viewer.viewChanged` | Throttled to 4/s. Use this to follow a reader live; use `pageRendered` to record what was seen |
| A document stopped being shown | `viewer.unloaded` | Carries the id of the document that **closed**, not the one arriving. Not guaranteed on teardown — see below |

> **Do not treat `viewer.unloaded` as a guarantee.** If your page removes the
> iframe, navigates away, or the tab closes, nothing can post from a frame that
> no longer exists. Use it to close a record you are already keeping, never as
> the only place you write one — the same caveat that applies to
> `beforeunload` in your own page, for the same reason.

Two more sharp edges worth knowing before you build against these. A document
the viewer **rejects outright** — a descriptor missing `mediaType`, say —
produces `viewer.error` with no `viewer.opened` before it, because there was no
document to open. And a `host.loadMarkup` whose `markup` is not an array is
**ignored silently and acknowledges nothing**: if you get no
`viewer.markupLoaded`, check you sent an array.

All four were added after the protocol shipped, which is the compatibility
promise working as intended — new message types are additive within v1, so an
integration written before them keeps running and simply never registers a
handler. Full payloads: §6.3 of `docs/viewer-embed-protocol.md`.

### 5.5 Identity: there is nothing to configure

Not "you need to set up SSO". The embed path has no identity system to configure
at all. Our own `/api/annotations` still keys a markup's author to a row in our
user table — integrating through *that* API would mean shadow-provisioning your
users into our database, a data-protection conversation before it is an
engineering one. The embed never reaches it.

**Three untrusted fields, and that is the whole of it.** You send a display
name, an opaque subject id, and a list of capabilities. All three are used for
presentation and for deciding which controls render; none is trusted for
authorisation, because the browser is not a place authorisation happens. The
author is stamped by whoever persists the markup — you. Nothing about your users
reaches our database.

You do **not** need to mint a JWT, and you do not need an identity provider we
can talk to. If an earlier version of this guide told you to prepare a signed
assertion with a stable subject claim, disregard it — that was written while the
question was open, and the answer went the other way. **Sending no identity at
all is a supported read-only deployment**, not a degraded one.

One consequence to plan around: **live collaboration is not available in an
embed.** Cursors and presence ride a socket authenticated by a viewer session,
and an embedded viewer has no session by design. That is the acknowledged cost
of "the viewer authenticates nobody", and it is unsolved rather than decided
against.

---

## 6. What is settled, and what is still open

Everything in the first list is decided and implemented — design against it.
Everything in the second is a real gap we would rather you heard from us than
discovered.

### Settled

- **Embedding is an iframe** with a per-tenant `frame-ancestors` allow-list.
  Not a web component: the viewer renders untrusted documents, and sharing
  your origin would mean a document that escapes the PDF renderer runs with
  your session on your domain. `@cde/viewer-core` remains available if you
  want to build your own interface from our rendering core, but that is an
  escape hatch rather than the supported path, and it is not covered by our
  accessibility conformance claim.
- **Identity is three untrusted fields** — a display name, an opaque subject
  id, and capability flags that decide which controls render and nothing else.
  No signed assertion, no viewer session, no JWT.
- **Markup comes back as events**, with the geometry as an opaque string you
  store and hand back. Have a place to put it that is not the rendered file.
  There is no author field — you stamp that.
- **Document identity is yours.** Pass `externalId` in the handshake and it
  comes back on every event, so you never hold a map between your id and ours.
- **One message pair covers all seventeen document operations**, and three of
  them — sign, create version, restore version — will never move to the viewer.
- **The protocol version is in every message, and `viewer.ready` tells you
  which versions the deployment speaks.** Read it and pick; do not assume.
  Within v1 we may add message types, optional fields, commands and
  operations — you ignore what you do not recognise, which is why the rule is
  *validate*, not *reject on unknown field*. Removing anything needs v2,
  announced with at least six months' notice and both versions running over the
  overlap.

### Still open

- **A tier that serves the embed document** — §5.2. The allow-list is done;
  nothing answers `/embed` yet.
- **Non-PDF formats in an embedded frame** — §4. Wiring, not design.
- **Collaboration in an embed** — §5.5. Genuinely unsolved.
- **Accessibility evidence** — §7, before you rely on ours.

Full message shapes: `docs/viewer-embed-protocol.md`. Where this guide and that
document disagree, that document is the normative one.

---

## 7. Obligations you inherit

**Accessibility.** WCAG 2.2 AA is a procurement gate in the UK, EU, Australia
and the US, and an embedded viewer becomes part of *your* conformance claim. If
you embed our WebGL model view, you inherit the requirement for an equivalent
accessible route to the same information — we provide the hierarchy tree for
exactly this reason, and it needs to remain reachable in your integration.
Exports must be tagged and PDF/UA-conformant.

> **Do not inherit a conformance claim from us, because we are not making one
> yet.** An accessibility statement, a VPAT 2.5 INT conformance report and a
> screen-reader matrix all exist in our repository, and all three record the
> same thing: no criterion has been evaluated by an audit. If your bid depends
> on ours, ask for the current state in writing rather than citing this guide.

What we can tell you honestly, because each item has a test that fails when it
regresses:

- The model hierarchy tree implements the full tree pattern — roving tab stop,
  arrow navigation, `aria-level` and `aria-expanded` per row.
- Page reordering and the comparison wipe, both previously drag-only, have
  keyboard routes (SC 2.5.7).
- Icon-only controls carry accessible names rather than announcing their glyph.
- Form controls are programmatically associated with their labels, their
  validation messages and their hints; required fields say so to assistive
  technology rather than only showing an asterisk.
- Long operations and their results are announced through live regions.

**And what we cannot.** No axe run, no Lighthouse budget, no screen-reader pass
against the supported matrix, and no CI gate producing any of them. One known
functional gap: **markup shapes cannot yet be created or moved without a
pointer**, which is an SC 2.5.7 failure in the annotation layer specifically.
If your customers annotate drawings and your bid claims AA, raise this with us
before you sign.

**Localisation.** The viewer has no hardcoded user-facing strings. Everything a
reader sees carries a stable message id and a translator note, extracted to a
committed catalogue — 552 messages — with two CI gates keeping it honest: one
fails if the catalogue drifts from source, the other if a template grows text a
translator will never see.

> **We ship the source catalogue, not translations.** The messages are English
> and there are no other locales in the repository. If you sell into a market
> that needs French or Arabic, you supply the translated catalogue; the
> mechanism to consume it is Angular's standard `$localize` pipeline and costs
> you a build per locale, not a fork. RTL layout has been kept in mind
> throughout — logical properties rather than `left`/`right` — but has not been
> verified against a real RTL locale, because there is not one to verify
> against.

A few sentences still reach the screen in English from the server, in the
places where only the server knows what happened. We have replaced them
wherever the response also carries a status code the client can word itself,
which is most of them, but a host serving a non-English market should expect a
small residue and ask us to name it for the paths they care about.

**Trademarks.** "Works with Microsoft SharePoint" is nominative fair use.
"Microsoft-approved", their logo, or any implication of partnership is not. The
same applies to Amazon, Google and Autodesk. Integration documentation is where
this goes wrong most easily, in both directions.

**Certification claims.** Do not describe this product as SOC 2, ISO 27001 or
IRAP certified. Those certifications are not currently held, and stating
otherwise is a misrepresentation with regulatory consequences rather than a
marketing stretch.

---

## 8. Integration checklist

Today:

- [ ] Can you mint a short-lived, single-object download URL from your storage?
- [ ] Do you have somewhere to hold a job id between submit and collect?
- [ ] Do you generate an `Idempotency-Key` per logical submission?
- [ ] Do you back off while polling, and honour `Retry-After` on `429`?
- [ ] Do you surface `detail` and `traceId` from problem documents to your support path?
- [ ] Have you confirmed your DWG position (§4)?

Before you scope an embedded integration:

- [ ] Have you run the demo host and watched a handshake? (`demo/README.md`)
- [ ] Have you read the embed protocol? (`docs/viewer-embed-protocol.md`)
- [ ] **Have you given your deployment contact the exact origins you will frame
      from, and confirmed they are on `cde.web.embed-parent-origins`?** (§5.2)
- [ ] **Have you confirmed what will serve the `/embed` document on that
      deployment?** (§5.2)
- [ ] Can you mint a short-lived URL for a document, and serve a page that
      frames us?
- [ ] Does your storage allow the viewer's origin to read that URL from the
      browser?
- [ ] Do you check `event.origin` on every message, not once at setup?
- [ ] Do you have somewhere to store markup that is not the rendered file, and
      do you stamp the author from your own session rather than from the
      message?
- [ ] Do you know which of the 17 document operations you need as callbacks,
      and can you return `refused` as readily as `applied`?
- [ ] Is your embedded use case PDF-first, or do you need the conversion path
      wired in? (§4)

**The integration you can ship against a stock deployment today is still §3.**
The embed is built and demonstrable, and it needs one header changed on the
viewer side before it runs anywhere but a development install. Scope it as
something to plan with us rather than something to build against
unilaterally — and if all you need is viewing, converting through §3 and
rendering the result yourself remains a complete feature with none of these
caveats.
