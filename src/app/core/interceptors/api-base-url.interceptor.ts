import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { API_BASE_URL } from '../config/api-base-url';

/**
 * Sends relative `/api` calls to the configured origin.
 *
 * <p>An interceptor rather than a base-URL parameter threaded through every
 * service. Twenty-six endpoints across nine services build their own paths;
 * changing each one means the next service added is same-origin again until
 * someone notices, and "someone notices" is not a mechanism. Here there is one
 * place, and a service written tomorrow is covered without knowing this exists.
 *
 * <p>Two things are deliberately left alone.
 *
 * <p><strong>Absolute URLs.</strong> Anything already carrying a scheme is
 * addressed to a specific host and is not ours to redirect. This is not
 * hypothetical: the error reporter posts to
 * `https://{host}/api/{project}/store/`, which contains `/api/` and would be
 * captured by a naive rule — sending crash reports to the document API.
 *
 * <p><strong>Anything that is not `/api`.</strong> Assets, the service worker
 * and templates are served from wherever the application itself is, which is
 * the host's origin when embedded. Only the API moves.
 */
export const apiBaseUrlInterceptor: HttpInterceptorFn = (req, next) => {
  const baseUrl = inject(API_BASE_URL);

  if (!baseUrl || !isRelativeApiPath(req.url)) {
    return next(req);
  }

  // Trailing slash on the base and leading slash on the path would otherwise
  // meet as `//api`, which is protocol-relative and resolves to the host
  // named `api` — a failure that looks like DNS rather than configuration.
  const origin = baseUrl.replace(/\/+$/, '');

  return next(req.clone({ url: `${origin}${req.url}` }));
};

/**
 * @returns whether this is one of our own API calls expressed as a path.
 *   `/apiary` is not: the segment has to end.
 */
function isRelativeApiPath(url: string): boolean {
  return url === '/api' || url.startsWith('/api/');
}
