import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/** The one request whose 401 is an answer rather than an expiry. */
const SESSION_PROBE = '/api/auth/session';

/**
 * Sends the session cookie, and signs out when the server stops accepting it.
 *
 * <p>It used to attach a bearer token read out of `localStorage`. There is no
 * token here now — the session is an `HttpOnly` cookie the browser attaches
 * itself (§4.6, `AuthService`) — so all this has to do is make sure the cookie
 * is allowed to travel.
 *
 * <p>`withCredentials` matters only when the API is on another origin, which is
 * how an embedded deployment runs. Same-origin requests carry cookies without
 * it; setting it unconditionally means the embedded case is not a separate
 * path that only breaks in someone else's deployment.
 *
 * <p>The CSRF token is not added here. Angular's own interceptor reads the
 * `XSRF-TOKEN` cookie and sends `X-XSRF-TOKEN`, which is exactly what the
 * server issues and expects, and duplicating it would be a second thing to
 * keep in step with the first.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  return next(req.clone({ withCredentials: true })).pipe(
    catchError((err: HttpErrorResponse) => {
      // A 401 from the session probe means "nobody is signed in", which is
      // the ordinary answer on a cold page load. Treating it as an expiry
      // would call logout() during startup, and logout() navigates — so
      // every anonymous visitor would be bounced to the login route by the
      // very request asking whether they needed to be.
      if (err.status === 401 && !req.url.endsWith(SESSION_PROBE)) {
        auth.logout();
      }
      return throwError(() => err);
    })
  );
};
