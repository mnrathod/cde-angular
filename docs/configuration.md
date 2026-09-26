# Configuration

Settings this application reads, per §13: type, default, whether it is
required, and whether it is a secret.

Angular has no server-side environment to read from, so configuration arrives
one of two ways: as an Angular provider, supplied by whoever bootstraps the
application, or as a `<meta>` tag on the served page, which is what a
deployment can change without rebuilding the bundle.

---

## `API_BASE_URL`

| | |
|---|---|
| Type | String — an origin, e.g. `https://cde.example.com` |
| Default | `''` (empty — same origin as the page) |
| Required | No |
| Secret | No |
| Declared in | `src/app/core/config/api-base-url.ts` |

The origin API calls are sent to.

**Empty by default, and empty changes nothing.** Every service asks for a
relative `/api/...` path, which resolves against the page's own origin — the
right answer when the application and the backend are served together, which
is how this repository deploys. That case needs no configuration (§1.2).

It matters when the application is *not* served with its backend. Embedded in
a host application (ADR 12), `/api/documents/4` resolves against the host's
origin and reaches the host, not us. Setting this sends API traffic to the
right place without any service knowing it happened.

### Setting it

```ts
bootstrapApplication(AppComponent, {
  providers: [
    ...appConfig.providers,
    { provide: API_BASE_URL, useValue: 'https://cde.example.com' },
  ],
});
```

A trailing slash is tolerated and stripped.

### What it does and does not affect

**Rewritten:** relative paths that are `/api` or begin with `/api/`, by
`apiBaseUrlInterceptor`. One interceptor rather than a parameter in each
service, so a service added later is covered without knowing this exists.

**Left alone:**

- **Absolute URLs.** Anything with a scheme is addressed to a specific host.
  This is load-bearing rather than tidy: the error reporter posts to
  `https://{host}/api/{project}/store/`, which contains `/api/`, and a rule
  matching that substring would send crash reports to the document API.
- **Everything that is not `/api`.** Assets, the service worker and templates
  come from wherever the application itself is served — the host's origin,
  when embedded. Only the API moves.

**Applied by hand in one place.** The collaboration WebSocket is not an
`HttpClient` request, so no interceptor sees it. `CollaborationService`
derives the broker URL from this same value, falling back to the page's origin
when it is empty. That fallback is the previous behaviour exactly.

### Cross-origin consequences

Pointing this at another origin makes every API call cross-origin, which the
backend must be configured to expect:

- **CORS.** The backend's allowed origins must include the host application's
  origin. It does not permit arbitrary origins (§5.4), so this is a
  deployment-time list, not something the browser can negotiate.
- **Credentials.** Authentication is a bearer token added by
  `authInterceptor`, so it travels cross-origin without cookie rules
  applying. A future move to `__Host-` cookies (§4.6) would need
  `withCredentials` and a stricter CORS configuration.
- **Content Security Policy.** The host page's `connect-src` must allow this
  origin, and its `frame-ancestors` governs whether the viewer can be framed
  at all.


---

## `telemetry` (meta tag)

| | |
|---|---|
| Type | String — `off`, or absent |
| Default | Absent, which means fault reports are sent |
| Required | No |
| Secret | No |
| Declared in | `src/app/core/services/remote-logging.service.ts` (`TELEMETRY_ENABLED`) |

Whether a caught fault may be reported off the browser.

```html
<meta name="telemetry" content="off">
```

**Opt-out, not opt-in.** An absent tag means reports are sent, so adding this
did not silently stop every deployment that was already reporting faults.
`off` is the only value that disables it, in any case and with any surrounding
whitespace; anything else permits sending, so a typo cannot quietly silence a
deployment's error reporting.

**Why it exists.** §9.3 requires an air-gapped deployment to make no telemetry
egress. The check before this was `isDevMode()`, which cannot express that —
an air-gapped deployment is a production build, so the check passed and every
caught fault attempted an outbound POST to `/api/logs/errors` and, where a DSN
was configured, to a third party. A development build still sends nothing,
regardless of this tag.

With reporting off, the fault still reaches the browser console, which is then
the only record of it.

---

## `sentry-dsn` (meta tag)

| | |
|---|---|
| Type | String — a Sentry DSN, e.g. `https://key@errors.example.com/42` |
| Default | Absent, which means no third party is contacted |
| Required | No |
| Secret | No — a DSN is a public ingestion key, not a credential |
| Declared in | `src/app/core/services/remote-logging.service.ts` |

An external error service to send fault reports to, **in addition** to the
internal `/api/logs/errors` endpoint. The internal endpoint is always used
when reporting is on; this is not an alternative to it.

Absent by default, which is what §6.1 requires of a third-party integration:
off unless a deployment turns it on. An unreadable value is ignored and does
not stop the internal report — a misconfiguration is not a reason to lose the
fault.

Setting this makes the error service a **sub-processor** (§6.1, §10.1's
register): it belongs in the sub-processor register, in the DPA, and in the
tenant-facing Trust Centre, and its region has to satisfy the tenant's
residency requirement. Leave it absent for any deployment where that has not
been established.

---

## `app-version` (meta tag)

| | |
|---|---|
| Type | String — a release identifier |
| Default | `1.0.0` |
| Required | No |
| Secret | No |
| Declared in | `src/app/core/services/remote-logging.service.ts` |

The release a fault report is attributed to. A stack trace from an unknown
build is a stack trace against unknown line numbers, so a deployment that
ships source maps to an error service wants this set to match them.
