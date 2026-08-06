import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { AuthResponse, LoginRequest } from '../models';

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
      tap(res => {
        localStorage.setItem(TOKEN_KEY, res.token);
        this._token.set(res.token);
        this._username.set(res.username);
        this._role.set(res.role);
      })
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

  private parseToken(token: string) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      this._username.set(payload.sub || null);
    } catch { /* ignore */ }
  }
}
