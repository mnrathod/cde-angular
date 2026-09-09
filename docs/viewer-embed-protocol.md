# Viewer embed protocol, v1

How a host application mounts the CDE viewer and talks to it.

**Status: implemented on both sides.** Written before the code, on purpose —
ADR 14's consequences section says the protocol is a published API and that the
guide is where its awkwardness shows first. Finding a bad message shape here
costs an edit; finding it after integrators have built against it costs a major
version.

| Side | Where |
|---|---|
| Viewer | `src/app/features/embed/` — the `/embed` route, no auth guard |
| Host | `demo/public/host-protocol.js` — a separate implementation, in plain JavaScript |
| The two, checked against each other | `src/app/features/embed/protocol-conversation.spec.ts` |

The demo host is deliberately **not** a shared client library. An integrator
writes that file rather than importing it, so an awkward message shape is
awkward there first. `demo/README.md` is the way in.

Writing it changed one thing in this document, marked below: §5.1 is new,
because the demo could not open two of its three sample files and the protocol
had nothing to say about why.

Implements **ADR 14** (`cde-platform`,
`docs/adr/0014-viewer-embed-and-identity-contracts.md`). Read that first for
why it is an iframe and why the viewer has no identity — this document
specifies the decision rather than arguing it.

---

## 1. The shape

The host embeds an iframe. Everything else is `postMessage`.

```
┌─ host page (https://cde.customer.example) ──────────────┐
│                                                          │
│   host application  ──── postMessage ───┐                │
│         ▲                               ▼                │
│         │              ┌─ iframe (https://viewer.example) ─┐
│         └── postMessage┤  the viewer                       │
│                        │  · renders                        │
│                        │  · measures, searches, marks up    │
│                        │  · no session, no API of yours     │
│                        └────────────────────────────────────┘
└──────────────────────────────────────────────────────────┘
```

The viewer holds no session, stores nothing, and reaches nothing of yours. It
is given bytes to render and claims to display, and it emits what the user
did. **You decide what any of it means.**

## 2. Two things authorise the embed, and they are different

| Mechanism | Answers | Enforced by |
|---|---|---|
| `frame-ancestors` on the viewer's response | *May this origin frame us at all?* | The browser, from a per-tenant allow-list we configure |
| `parentOrigin` in the iframe URL | *Which origin do we address messages to?* | The viewer, on every send and receive |

Keeping them apart matters. `parentOrigin` is **addressing, not
authorisation** — a page can put any value there, and doing so only changes
who it is talking to. The thing that stops an unlisted origin embedding the
viewer is `frame-ancestors`, which the page cannot influence.

Do not read `parentOrigin` as a security control, and do not propose removing
`frame-ancestors` because `parentOrigin` exists.

## 3. Rules that are not negotiable

These are the ones that get skipped under deadline pressure and are the reason
embedded viewers leak.

1. **Never `postMessage(..., '*')`.** Both sides address the other's exact
   origin. A wildcard target broadcasts to whoever is framing you.
2. **Check `event.origin` on every received message**, not just the first. An
   origin check in the handshake and nowhere after is not a check.
3. **Check `event.source`** against the frame's `contentWindow` (host side) or
   `window.parent` (viewer side). Origin alone does not identify the sender
   when several frames share one.
4. **Treat every payload as untrusted input**, in both directions. The viewer
   validates what the host sends; the host validates what the viewer sends.
   Neither is a trusted peer just because it is on the other end of a
   handshake.
5. **Never put a credential in a message.** Not a session token, not an API
   key, not a signed assertion. The viewer has no use for one — see §7 — and
   a message that carries one puts it in the host's JavaScript heap and in any
   extension listening on the page.

## 4. Envelope

Every message, in both directions:

```jsonc
{
  "protocol": "cde.viewer.v1",   // major version; see §10
  "type":     "markup.created",  // what this is
  "id":       "01J8Z...",        // unique per message
  "replyTo":  "01J8Y...",        // present only on a reply
  "payload":  { }                // shape depends on type
}
```

`protocol` is checked before anything else. A message whose `protocol` does
not match is **ignored silently** — not logged as an error, not replied to.
The page may contain other frames using postMessage for their own purposes,
and treating their traffic as malformed input produces noise that trains
people to ignore the log.

`id` is opaque; generate it however you like as long as it does not repeat
within a session. `replyTo` correlates a reply with its request and appears
only on replies.

## 5. Handshake

```
viewer                                       host
  │                                            │
  │  ─────── viewer.ready ──────────────────▶  │   "I am loaded and listening"
  │                                            │
  │  ◀────── host.init ──────────────────────  │   config + identity + document
  │                                            │
  │  ─────── viewer.loaded ─────────────────▶  │   "rendered, N pages"
  │      or  viewer.error                      │
```

The viewer sends `viewer.ready` once, on load, and **does nothing until it
receives `host.init`.** It does not fetch, render, or display anything before
then — including an error state, which would otherwise flash before the host
has said what to show.

If `host.init` does not arrive within 30 seconds the viewer shows a message
saying the host did not configure it, because a permanently blank frame is
indistinguishable from a broken deployment.

### `host.init`

```jsonc
{
  "protocol": "cde.viewer.v1",
  "type": "host.init",
  "id": "01J8Y...",
  "payload": {
    "document": {
      "url": "https://files.customer.example/doc/9f3?sig=...",
      "mediaType": "application/pdf",
      "displayName": "L2 Structural Plan.pdf",
      "externalId": "customer-doc-4471"
    },
    "identity": {
      "displayName": "A. Surveyor",
      "subjectId": "customer-user-88213",
      "capabilities": ["markup:create", "markup:delete"]
    },
    "ui": {
      "locale": "en-AU",
      "theme": "light",
      "tools": ["select", "pan", "measure", "cloud", "text"]
    }
  }
}
```

**`document.url`** is a short-lived URL you mint with your own credentials —
ADR 12's fetch model. The viewer dereferences it once. It is not stored, not
logged, and not echoed in any outbound message; §5.13 and the conversion
API's own handling of source URLs apply unchanged.

**`document.externalId`** is yours and is opaque to us. It comes back on every
event so you can file what the viewer emits without keeping a map. We key our
own conversion jobs on a UUID; this is the field that lets you avoid caring.

### 5.1 `mediaType` decides whether a server is involved

> Added after the demo was built. The demo ships three sample files and could
> open one of them; the protocol had nothing to say about why, which made a
> correct refusal look like a defect.

**PDF is the only format a browser renders on its own.** Everything else —
Office, IFC, DWG, images needing derivation — is converted before the viewer
has pages or geometry to show, by a conversion service that is part of the
*viewer's* deployment, not yours. You still send one `document.url` and one
`mediaType`; what changes is what happens behind the frame.

| `mediaType` | What the viewer does |
|---|---|
| `application/pdf` | Fetches your URL from the browser and renders it. No server of ours is involved |
| Anything else | Hands your URL to its own conversion service, which fetches it and returns something renderable |

Two consequences worth knowing before you deploy:

- **Your URL is dereferenced by whichever of the two fetches it.** For PDF that
  is the user's browser, so the URL must be reachable from there and its
  response must allow the viewer's origin to read it. For everything else it is
  our conversion service, from our network. A URL that only works inside your
  VPC will open PDFs and nothing else, and the failure will look like a format
  problem.
- **A viewer deployment with no conversion service reachable can still open
  PDFs.** That is a legitimate deployment, not a broken one. Asked for anything
  else it emits `viewer.error` with
  `type: …/problems/conversion-required` — a 415 naming the format and saying
  the conversion service is what is missing, rather than showing an empty
  frame.

## 6. Messages

### Host → viewer

| Type | Payload | Effect |
|---|---|---|
| `host.init` | see above | Configure and load. Once per session |
| `host.loadDocument` | same as `init.document` | Replace the open document |
| `host.setIdentity` | same as `init.identity` | Update the display name or capabilities mid-session |
| `host.loadMarkup` | `{ markup: Markup[] }` | Render existing markup you have stored |
| `host.command` | `{ command, arguments }` | Drive the viewer: `goToPage`, `setZoom`, `setTool`, `search`, `print` |
| `host.operationResult` | `{ status, result?, problem? }` | Reply to a `viewer.operationRequest`; `replyTo` required |

### Viewer → host

| Type | Payload | Meaning |
|---|---|---|
| `viewer.ready` | `{ version }` | Loaded, awaiting `host.init` |
| `viewer.loaded` | `{ pageCount, mediaType, renderedBy }` | The document is open |
| `viewer.error` | `{ problem }` | Could not open it — see §8 |
| `viewer.markupCreated` | `{ markup }` | The user drew something |
| `viewer.markupUpdated` | `{ markup }` | The user changed it |
| `viewer.markupDeleted` | `{ markupId }` | The user deleted it |
| `viewer.operationRequest` | `{ operation, arguments }` | The user asked for something only you can do — see §6.1 |
| `viewer.selectionChanged` | `{ markupId \| null }` | Selection moved |
| `viewer.viewChanged` | `{ page, zoom, rotation }` | The user navigated. Throttled to 4/s |
| `viewer.resized` | `{ contentHeightPx }` | For hosts sizing the frame to content |

### 6.1 One message pair for every host callback

ADR 14's rule — reads and computations are viewer-side, changes to the
document are host callbacks — covers seventeen operations. They are **not
seventeen message types.** One pair:

```jsonc
// viewer → host
{ "type": "viewer.operationRequest", "id": "01J90...",
  "payload": {
    "operation": "pages.rotate",
    "arguments": { "pages": [3, 4], "degrees": 90 }
  } }

// host → viewer
{ "type": "host.operationResult", "id": "01J91...", "replyTo": "01J90...",
  "payload": { "status": "applied", "result": { "documentUrl": "https://..." } } }
```

`status` is `applied`, `refused`, or `failed`, and the distinction is the
point:

- **`applied`** — you did it. If the document changed, `result.documentUrl`
  is a fresh URL and the viewer reloads from it. The viewer never mutates
  its copy and calls that the new document.
- **`refused`** — the user is not allowed. Expected, not an error; the viewer
  shows what you put in `problem.detail` and carries on.
- **`failed`** — something broke. The viewer shows an error with your
  `problem.detail` and a trace id if you supply one.

**A `refused` must be possible even for an operation whose capability you
granted in `host.init`.** Capabilities decide which controls render;
authorisation happens when the operation is requested. If those two ever
disagree — the user's permission changed in the last thirty seconds — the
`refused` is correct and the rendered button was merely stale.

Operations that never become viewer-side, whatever else changes:
`document.sign`, `version.create`, `version.restore`. A signature over a copy
you have since replaced is worse than no signature, and the viewer cannot
know whether its copy is still current.

### 6.2 Markup is opaque to you

```jsonc
{
  "markupId": "01J8Z...",
  "externalId": "customer-doc-4471",
  "page": 3,
  "type": "CLOUD",
  "shapeData": "{\"points\":[[120,300],[180,340]],\"stroke\":\"#c00\"}",
  "comment": "Check this dimension against RFI 214",
  "createdAt": "2026-09-09T04:11:07Z"
}
```

**`shapeData` is a string and you must not parse it.** It is geometry in the
viewer's own encoding — store it, hand it back in `host.loadMarkup`, and treat
it as a blob. Parsing it couples you to a format that will change without a
protocol version bump, because it is not part of the protocol.

Everything you would reasonably index — page, type, comment, timestamps — is
beside it as a real field, which is what makes the blob acceptable.

**No author.** The viewer does not stamp one. You know who was in the session,
because you told the viewer who they were; attribute server-side from your own
record. A display name in the payload would be a claim the browser made about
its own user, and stamping it server-side from a session you already hold is
both easier and true.

## 7. Identity

```jsonc
"identity": {
  "displayName": "A. Surveyor",
  "subjectId": "customer-user-88213",
  "capabilities": ["markup:create", "markup:delete"]
}
```

Three fields. There is no token, no session, no login, no tenant, and there
will not be — ADR 14 §"Options — how the viewer learns who the user is".

**These claims are untrusted and are used only for presentation.**

| Field | Used for | Never used for |
|---|---|---|
| `displayName` | The label on markup as the user draws it | Anything stored. You stamp the author |
| `subjectId` | "Is this reply mine?", suppressing the echo of the user's own collaboration events | Authorisation. It is an opaque string we compare for equality and nothing else |
| `capabilities` | Which controls to render | Deciding whether an operation may proceed |

**Every operation the viewer emits is authorised by you, server-side, against
your own session.** That is CLAUDE.md §5.5 — "client-side checks are UX only"
— applied to a client that happens to be ours. A viewer that could authorise
would be a viewer you had to trust; this one you do not.

The practical consequence: **if you send no `identity` at all, the viewer
still works.** Markup gets a generic label and every capability-gated control
is hidden. That is a legitimate deployment for read-only viewing, and it is
the one to reach for if identity is a data-protection conversation you have
not had yet.

## 8. Errors

`viewer.error` and `host.operationResult` both carry a `problem`, and it is
RFC 9457 Problem Details — the same envelope as our HTTP API (§3.4), so you
parse one shape rather than two:

```jsonc
{ "problem": {
    "type": "https://viewer.example/problems/unsupported-media-type",
    "title": "This file type cannot be displayed",
    "status": 415,
    "detail": "RVT is not supported. Convert to IFC or PDF before viewing.",
    "traceId": "0af7651916cd43dd8448eb211c80319c"
} }
```

`detail` is written to be shown to a person. `status` is an HTTP status even
though no HTTP request happened, because the meanings are already agreed and
inventing a second vocabulary helps nobody.

## 9. The minimum integration

Everything above is optional except this:

1. Serve a page that frames the viewer with `parentOrigin` set.
2. Listen for `viewer.ready`.
3. Reply with `host.init` carrying a `document.url` you minted.
4. Ignore every other message.

That is a working read-only viewer. Markup, operations and identity are each
additive from there, and a host that implements none of them is not a broken
integration — it is a viewing integration.

## 10. Compatibility

`protocol: "cde.viewer.v1"` is the major version, and §3.4's API rules apply
without modification.

**Within v1** — new message types, new optional payload fields, new
`host.command` commands, new `viewer.operationRequest` operations. A host
built against early v1 keeps working; it ignores what it does not recognise,
which is why rule 4 in §3 says *validate*, not *reject on unknown field*.

**Requires v2** — removing or renaming a message type or a required field,
changing a field's type, or changing what an existing message means.

We announce a version with ≥6 months' notice and run both for the overlap.
`viewer.ready` reports the versions the deployment speaks:

```jsonc
{ "type": "viewer.ready", "payload": { "version": { "supported": ["cde.viewer.v1"] } } }
```

Read it and pick; do not assume.

## 11. Deliberately not in this protocol

**Styling.** No CSS crosses the boundary. `ui.theme` picks between themes we
ship; it does not accept a stylesheet. Letting a host inject CSS into a frame
rendering untrusted documents undoes the isolation the iframe is for.

**Direct DOM access.** There is no handle to reach inside, by design. If you
need something the protocol cannot express, that is a gap in the protocol and
worth raising as one.

**Bulk document transfer.** Documents arrive by URL, never as bytes in a
message. A 2 GB IFC through `postMessage` would be copied through both heaps.

**Anything that would make the viewer a system of record.** It holds markup
until you take it and forgets on unload. If markup can be lost by closing a
tab, the host is not persisting it and the fix is in the host.

---

## Open questions

**Collaboration.** The STOMP socket needs its own authentication and does not
have it — the one loose end "no identity" leaves (ADR 14, consequences). It is
outside this protocol until it is solved, so live cursors and presence do not
work in an embedded deployment.

**Content-height reporting.** `viewer.resized` assumes a host that sizes the
frame to content. A host that gives the frame a fixed height should ignore it.
Whether we also support a `ui.fit` mode where the viewer manages its own
scrolling is unsettled, and the answer changes the accessibility story around
focus and scroll containers.
