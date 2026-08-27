import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { AuthResponse, LoginRequest, RegisterRequest } from '../models';

const TOKEN_KEY = 'cde_token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http   = inject(HttpClient);
  private router = inject(Router);

  // ── Signals ──────────────────────────────────────────────────
  private _token    = signal<string | null>(localStorage.getItem(TOKEN_KEY));
  private _username = signal<string | null>(null);
  private _role     = signal<string | null>(null);

  readonly token    = this._token.asReadonly();
  readonly username = this._username.asReadonly();
  readonly role     = this._role.asReadonly();
  readonly isLoggedIn = computed(() => !!this._token());

  constructor() {
    // Restore user info from token on reload
    const t = this._token();
    if (t) this.parseToken(t);
  }

  login(req: LoginRequest) {
    return this.http.post<AuthResponse>('/api/auth/login', req).pipe(
      tap(res => this.startSession(res))
    );
  }

  /**
   * Registration returns the same AuthResponse as login, so a successful
   * sign-up establishes the session directly rather than bouncing the user
   * back to the login form to retype what they just entered.
   */
  register(req: RegisterRequest) {
    return this.http.post<AuthResponse>('/api/auth/register', req).pipe(
      tap(res => this.startSession(res))
    );
  }

  logout() {
    localStorage.removeItem(TOKEN_KEY);
    this._token.set(null);
    this._username.set(null);
    this._role.set(null);
    this.router.navigate(['/login']);
  }

  getAuthHeaders(): Record<string, string> {
    const t = this._token();
    return t ? { Authorization: `Bearer ${t}` } : {};
  }

  private startSession(res: AuthResponse) {
    localStorage.setItem(TOKEN_KEY, res.token);
    this._token.set(res.token);
    this._username.set(res.username);
    this._role.set(res.role);
  }

  private parseToken(token: string) {
    try {
      // A stored value that is not a JWT has no second segment, and atob(
      // undefined) throws rather than returning nothing. The catch below would
      // swallow it, but silently leaving the username unset on a malformed
      // token is exactly the state that looks like "logged in but broken".
      const claims = token.split('.')[1];
      if (!claims) return;
      const payload = JSON.parse(atob(claims));
      this._username.set(payload.sub || null);
    } catch { /* ignore */ }
  }
}
