import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { AuthResponse, LoginRequest, RegisterRequest } from '../models';

/** Who the current session belongs to. Carries no token, deliberately. */
export interface SessionResponse {
  username: string;
  role: string;
}

/**
 * The signed-in session, as far as the browser is allowed to know it.
 *
 * <p>This used to keep the JWT in `localStorage` and attach it as a bearer
 * header. §4.6 forbids that in as many words, and the reason is narrow: any
 * script running on the origin can read `localStorage`, so one cross-site
 * scripting bug anywhere in the application hands over a token good for its
 * whole lifetime, replayable from anywhere. Nothing else about the session had
 * to be insecure for that to be true — a single injected `<script>` was enough.
 *
 * <p>The token now lives in an `HttpOnly` cookie the server sets, which script
 * cannot read at all. That has a consequence worth stating plainly, because it
 * shapes everything below: **this service never sees a token.** It cannot
 * attach one, cannot parse the username out of one, and cannot delete one. So
 * the browser asks the server who it is, and asks the server to sign it out.
 *
 * <p>The cookie survives a reload, which is what {@link restoreSession} is for:
 * the signals start empty on every page load and are filled from the server
 * rather than from storage.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private http   = inject(HttpClient);
  private router = inject(Router);

  private _username = signal<string | null>(null);
  private _role     = signal<string | null>(null);

  /**
   * Whether the session has been asked about yet.
   *
   * <p>Needed because "not signed in" and "not yet known" are different, and
   * conflating them sends a signed-in user to the login screen for the moment
   * between the page loading and the server answering. The guard waits on
   * this rather than reading {@link isLoggedIn} straight away.
   */
  private _resolved = signal(false);

  readonly username   = this._username.asReadonly();
  readonly role       = this._role.asReadonly();
  readonly resolved   = this._resolved.asReadonly();
  readonly isLoggedIn = computed(() => this._username() !== null);

  login(req: LoginRequest) {
    return this.http.post<AuthResponse>('/api/auth/login', req).pipe(
      tap(res => this.adopt(res.username, res.role))
    );
  }

  /**
   * Registration returns the same reply as login, so a successful sign-up
   * establishes the session directly rather than bouncing the user back to the
   * login form to retype what they just entered.
   */
  register(req: RegisterRequest) {
    return this.http.post<AuthResponse>('/api/auth/register', req).pipe(
      tap(res => this.adopt(res.username, res.role))
    );
  }

  /**
   * Asks the server who this browser is, on startup.
   *
   * <p>A 401 here is the ordinary case — most page loads are by people who are
   * not signed in — so it resolves to "nobody" rather than propagating. It
   * still marks the session resolved, because a guard waiting for an answer
   * needs one either way.
   */
  restoreSession(): Observable<boolean> {
    return this.http.get<SessionResponse>('/api/auth/session').pipe(
      tap(session => this.adopt(session.username, session.role)),
      map(() => true),
      catchError(() => {
        this.forget();
        return of(false);
      })
    );
  }

  /**
   * Ends the session at the server, then forgets it here.
   *
   * <p>The order matters and the server call is not optional: the cookie is
   * `HttpOnly`, so clearing the local signals alone would leave the browser
   * still holding a working credential while the interface claimed to be
   * signed out. A failed call still clears locally and still navigates —
   * stranding someone on a page they appear to be signed out of would be
   * worse than a session that outlives the click.
   */
  logout() {
    this.http.post<void>('/api/auth/logout', {}).pipe(
      catchError(() => of(void 0))
    ).subscribe(() => {
      this.forget();
      this.router.navigate(['/login']);
    });
  }

  private adopt(username: string, role: string) {
    this._username.set(username);
    this._role.set(role);
    this._resolved.set(true);
  }

  private forget() {
    this._username.set(null);
    this._role.set(null);
    this._resolved.set(true);
  }
}
