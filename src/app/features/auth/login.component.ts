import { Component, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';
import { problemDetail } from '../../core/handlers/problem-detail';
import { environment } from '../../../environments/environment';

/**
 * Matches the backend's `@Size(min = 12)` on RegisterRequest.password, and the
 * tenant password policy's own minimum.
 *
 * <p>It said 6 while the server enforced 12, so the form told the user their
 * password was long enough and the server then refused it — the exact round
 * trip this check exists to avoid, with a contradiction on the end of it.
 * A client-side rule that is looser than the server's is worse than none.
 */
const MIN_PASSWORD_LENGTH = 12;

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, CommonModule],
  template: `
    <div class="min-h-screen bg-gradient-to-br from-nav to-accent flex items-center justify-center p-4">
      <div class="bg-white rounded-lg shadow-2xl p-8 w-full max-w-sm">

        <!-- Logo -->
        <div class="flex items-center gap-3 mb-8">
          <div class="w-9 h-9 bg-accent rounded flex items-center justify-center text-white font-black text-sm">CDE</div>
          <span class="font-bold text-lg text-gray-800">Platform</span>
        </div>

        <!--
          Tabs, announced as tabs. Without role="tab" the Sign In tab and the
          Sign In submit button are two buttons with the same accessible name
          and nothing to tell them apart — ambiguous to a screen reader, and
          to anything else selecting by role and name.

          type="button" because a <button> defaults to type="submit". These
          sit outside the form today so the default is harmless, but moving
          them inside one would silently turn a tab switch into a submit.
        -->
        <div role="tablist" aria-label="Sign in or register"
             class="flex gap-1 mb-6 bg-gray-100 p-1 rounded">
          <button type="button" role="tab" (click)="showTab('login')"
            [attr.aria-selected]="tab() === 'login'"
            class="flex-1 py-1.5 text-sm rounded transition-all"
            [class]="tab() === 'login' ? 'bg-white text-accent shadow-sm font-semibold' : 'text-gray-500'"
          >Sign In</button>
          <button type="button" role="tab" (click)="showTab('register')"
            [attr.aria-selected]="tab() === 'register'"
            class="flex-1 py-1.5 text-sm rounded transition-all"
            [class]="tab() === 'register' ? 'bg-white text-accent shadow-sm font-semibold' : 'text-gray-500'"
          >Register</button>
        </div>

        <!-- Error -->
        @if (error()) {
          <div class="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded">
            {{ error() }}
          </div>
        }

        <!-- Login Form -->
        @if (tab() === 'login') {
          <form (ngSubmit)="doLogin()" class="space-y-4">
            <div>
              <label for="login-username" class="block text-xs font-medium text-gray-600 mb-1">Username</label>
              <input id="login-username" [(ngModel)]="username" name="username" type="text" required
                autocomplete="username"
                class="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                placeholder="admin" />
            </div>
            <div>
              <label for="login-password" class="block text-xs font-medium text-gray-600 mb-1">Password</label>
              <input id="login-password" [(ngModel)]="password" name="password" type="password" required
                autocomplete="current-password"
                class="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                placeholder="••••••••" />
            </div>
            <button type="submit" [disabled]="loading()"
              class="w-full bg-accent hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded text-sm transition-colors mt-2">
              {{ loading() ? 'Signing in...' : 'Sign In' }}
            </button>
          </form>
          <!--
            Only in a development build. This used to read "Demo: admin /
            admin123" unconditionally, which printed the seeded account's
            password on the login page of every deployed environment.
          -->
          @if (prefilled) {
            <p class="text-xs text-amber-600 text-center mt-4">
              Development build — signed in as the local seed account.
            </p>
          }
        }

        <!-- Register Form -->
        @if (tab() === 'register') {
          <form (ngSubmit)="doRegister()" class="space-y-4">
            <div>
              <label for="register-username" class="block text-xs font-medium text-gray-600 mb-1">Username</label>
              <input id="register-username" [(ngModel)]="username" name="username" type="text" required
                autocomplete="username"
                class="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
            </div>
            <div>
              <label for="register-email" class="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input id="register-email" [(ngModel)]="email" name="email" type="email"
                autocomplete="email"
                class="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
            </div>
            <div>
              <label for="register-password" class="block text-xs font-medium text-gray-600 mb-1">Password</label>
              <input id="register-password" [(ngModel)]="password" name="password" type="password" required
                autocomplete="new-password"
                class="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
            </div>
            <button type="submit" [disabled]="loading()"
              class="w-full bg-accent hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded text-sm transition-colors">
              {{ loading() ? 'Creating...' : 'Create Account' }}
            </button>
          </form>
        }
      </div>
    </div>
  `
})
export class LoginComponent {
  private auth   = inject(AuthService);
  private router = inject(Router);

  tab      = signal<'login' | 'register'>('login');
  loading  = signal(false);
  error    = signal('');
  email    = '';

  /**
   * Prefilled from the environment so a development reload does not cost a
   * retyped sign-in. `environment.production.ts` sets `demoCredentials` to
   * null and `angular.json` swaps the whole file in for production builds, so
   * the strings are absent from a production bundle rather than merely
   * unreachable inside it — a runtime check would still ship them to every
   * browser that loaded the app.
   */
  username = environment.demoCredentials?.username ?? '';
  password = environment.demoCredentials?.password ?? '';

  /** Whether the form arrived filled in, so the page can say why. */
  readonly prefilled = !!environment.demoCredentials;

  /**
   * Both forms bind the same username and password, so the prefill would
   * otherwise open Register already filled with an account that exists —
   * a registration that can only fail as a duplicate. The seed values are
   * for signing in, so they are cleared on the way to Register and restored
   * on the way back.
   */
  showTab(tab: 'login' | 'register') {
    if (tab === this.tab()) return;
    this.error.set('');

    if (tab === 'register') {
      this.username = '';
      this.password = '';
    } else {
      this.username = environment.demoCredentials?.username ?? '';
      this.password = environment.demoCredentials?.password ?? '';
    }
    this.tab.set(tab);
  }

  doLogin() {
    if (!this.username || !this.password) {
      // Never fail silently — e.g. browser autofill can populate the visible
      // inputs without ngModel picking up the change, leaving these blank.
      this.error.set('Please enter both username and password.');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.auth.login({ username: this.username, password: this.password }).subscribe({
      next: () => this.router.navigate(['/']),
      error: () => { this.error.set('Invalid username or password'); this.loading.set(false); }
    });
  }

  doRegister() {
    // Mirrors doLogin's guard: autofill can populate the inputs without
    // ngModel seeing it, so never fail silently on an apparently-filled form.
    if (!this.username || !this.email || !this.password) {
      this.error.set('Please enter a username, email and password.');
      return;
    }
    if (this.password.length < MIN_PASSWORD_LENGTH) {
      // Stated up front rather than surfacing the server's rejection, which
      // would cost a round trip to tell the user something knowable here.
      this.error.set(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    this.loading.set(true);
    this.error.set('');
    this.auth.register({
      username: this.username,
      email:    this.email,
      password: this.password
    }).subscribe({
      // Registration returns a token, so the user lands signed in.
      next:  () => this.router.navigate(['/']),
      error: err => {
        this.loading.set(false);
        this.error.set(this.registrationError(err));
      }
    });
  }

  /**
   * A duplicate username or email comes back as a `409` problem document whose
   * `detail` says which one and what to do about it.
   *
   * <p>This used to read a plain string body from a `400`, which is what the
   * endpoint returned before errors became problem documents. The branch simply
   * stopped matching, so every registration failure — including the two the
   * server explains precisely — showed the generic fallback instead.
   */
  private registrationError(err: unknown): string {
    return problemDetail(err, 'Could not create the account. Please try again.');
  }
}
