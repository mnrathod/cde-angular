# Configuration

Settings this application reads, per §13: type, default, whether it is
required, and whether it is a secret.

There is exactly one so far. Angular has no server-side environment to read
from, so configuration arrives as an Angular provider — supplied by whoever
bootstraps the application, which for the embeddable viewer is the host.

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
