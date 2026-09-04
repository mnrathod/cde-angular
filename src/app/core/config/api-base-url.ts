import { InjectionToken } from '@angular/core';

/**
 * Origin the API is served from, or an empty string for same-origin.
 *
 * <p>Every service in this application asks for a relative `/api/...` path,
 * which works because the application is served from the same origin as the
 * backend. Embedded in a host application — the standalone viewer of ADR 12 —
 * that assumption is false: `/api/documents/4` resolves against the host's
 * origin and reaches the host, not us.
 *
 * <p>Empty by default, and an empty value changes nothing. Same-origin
 * deployment is the common case and must keep working with no configuration
 * at all (§1.2), so this is a value a host supplies rather than one every
 * deployment has to think about.
 *
 * <p>Consumed by `apiBaseUrlInterceptor`, and only by it. Services must not
 * inject this and build URLs themselves — that is the duplication this
 * replaces, and the reason a new service could silently be left same-origin.
 */
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  factory: () => '',
});
