# Viewer product — integration guide

For an engineer at a common data environment — Asite, Procore, Dalux, or your
own — who has to make this viewer open your customers' documents.

**Read section 1 before planning anything.** One of the four exchanges an
integration needs is built. The other three are not, and this guide says so
rather than describing an interface you would then fail to find.

Companion: `viewer-architecture.md` for how the thing works internally.

---

## 1. What you can build against today

| # | Exchange | Direction | Status |
|---|---|---|---|
| 1 | Mount the viewer in your interface | you → viewer | **Not built** — no embed surface |
| 2 | Tell the viewer who is looking | you → viewer | **Not built** — no token exchange |
| 3 | Hand over a document | you → viewer | **Built.** §3 |
| 4 | Get the markups back | viewer → you | **Not built** — 17 operations undecided |

So: you can convert and render your customers' documents through our API today,
inside your own interface, using your own rendering. You cannot yet embed our
viewer, and if you do get it on screen it has no way to know who your user is.

If that is enough — and for a "preview any file format" feature it often
is — §3 is a complete, working integration. If you need markup round-tripping,
§6 is what you are waiting for.

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
   │ your IdP           │   2. identity     ✗  │ (no way in yet)    │
   ├────────────────────┤                      ├────────────────────┤
   │ your interface     │   1. mount        ✗  │ (no embed surface) │
   │                    │ ◀ 4. markups      ✗  │                    │
   └────────────────────┘                      └────────────────────┘
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

| Input | Route | Notes |
|---|---|---|
| PDF | Passed through; rendered by `pdfjs-dist` | OCR available for scanned pages, adds an invisible text layer |
| DXF | `ezdxf` → SVG (viewer) or PDF (export) | Text is real and searchable in both |
| **DWG** | → DXF, then as above | **See the warning below** |
| Office (docx, xlsx, pptx) | LibreOffice → PDF | |
| IFC | Geometry + hierarchy tree | Tree is the primary interface, not a fallback |

> **DWG has no clean licensing path for a distributed product.** The two
> converters have opposite problems: LibreDWG is GPL-3.0 and ships in our image
> (so distribution owes corresponding source we do not currently provide), and
> the ODA File Converter cannot be redistributed at all. In our hosted service
> DWG works. For an on-premises install, **assume DWG is unavailable unless
> your contract says otherwise** and you have obtained an ODA licence yourself.
> Tracked as ADR 13, referred to counsel, unresolved. Do not plan a DWG
> workflow on the assumption this resolves in your favour.

---

## 5. Embedding — read before you scope it

Three constraints, all currently blocking:

| Constraint | Reality today |
|---|---|
| **Framing** | `Content-Security-Policy: frame-ancestors 'none'`. A cross-origin `<iframe>` will not render |
| **Cross-origin XHR** | The CORS source registers no origin at all unless a deployment names one in full |
| **Session** | A bearer token from our own `/api/auth/login`, against our own user table. No cookie mode, no silent SSO, no token exchange |

The only path that works today is **serving our Angular build from your own
origin, behind the same web tier that proxies `/api`**. Same-origin needs no
CORS entry, no framing relaxation, and no cross-origin token handling. It is
also a deployment of our application into your infrastructure, which is
probably not what you meant by "integrate".

**If you only need viewing**, the honest recommendation is to skip the embed
entirely: use §3 to convert, and render the resulting PDF or SVG in your own
interface with your own viewer. That avoids all three constraints and is a
complete feature.

### 5.1 What the identity gap actually means

Not "you need to configure SSO". There is nothing to configure. A markup's
author is a foreign key into our user table, so **your user must exist as a row
in our database before they can annotate anything.** Any integration today
means shadow-provisioning your users into our system, which is a data-protection
conversation before it is an engineering one.

The fix is an opaque issuer-and-subject reference plus a display name you
supply, so you stay the system of record for who your people are. It is not
built. If markup attribution matters to you, say so — it moves the priority.

---

## 6. What to plan for, not against

When the contract lands, these are the shapes to expect. **None of this is
implemented; do not build against it yet.** It is here so your architecture
does not paint itself into a corner.

- **Embedding** will be an iframe with a per-tenant `frame-ancestors`
  allow-list, a published web component, or both. Keep your viewer container
  swappable.
- **Identity** will be a signed assertion you issue, exchanged for a
  short-lived viewer session. Make sure you can mint a JWT with a stable subject
  claim per user.
- **Markups** will come back either as events on a callback you host or as a
  document you pull. Have a place to put them that is not the rendered file.
- **Document identity** — we currently key on our own numeric id. An external
  identifier is planned; keep your own id available at the boundary.

---

## 7. Obligations you inherit

**Accessibility.** WCAG 2.2 AA is a procurement gate in the UK, EU, Australia
and the US, and an embedded viewer becomes part of *your* conformance claim. If
you embed our WebGL model view, you inherit the requirement for an equivalent
accessible route to the same information — we provide the hierarchy tree for
exactly this reason, and it needs to remain reachable in your integration.
Exports must be tagged and PDF/UA-conformant.

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

- [ ] Has the embed contract been decided? (§5 — currently no)
- [ ] Has the identity contract been decided? (§5.1 — currently no)
- [ ] Do you know which of the 17 document operations you need? (§6)

If the last three are all "no", the buildable integration is §3 and nothing
else. That is a real feature and it works — it is just smaller than "embed the
viewer", and worth scoping as what it is.
