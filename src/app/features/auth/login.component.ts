import { Component, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth.service';

/** Matches the backend's @Size(min = 6) on RegisterRequest.password. */
const MIN_PASSWORD_LENGTH = 6;

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

        <!-- Tabs -->
        <div class="flex gap-1 mb-6 bg-gray-100 p-1 rounded">
          <!--
            type="button" because a <button> defaults to type="submit". These
            sit outside the form today so the default is harmless, but moving
            them inside one would silently turn a tab switch into a submit.
          -->
          <button type="button" (click)="tab.set('login')"
            class="flex-1 py-1.5 text-sm rounded transition-all"
            [class]="tab() === 'login' ? 'bg-white text-accent shadow-sm font-semibold' : 'text-gray-500'"
          >Sign In</button>
          <button type="button" (click)="tab.set('register')"
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
              <label class="block text-xs font-medium text-gray-600 mb-1">Username</label>
              <input [(ngModel)]="username" name="username" type="text" required
                autocomplete="username"
                class="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                placeholder="admin" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Password</label>
              <input [(ngModel)]="password" name="password" type="password" required
                autocomplete="current-password"
                class="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                placeholder="••••••••" />
            </div>
            <button type="submit" [disabled]="loading()"
              class="w-full bg-accent hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded text-sm transition-colors mt-2">
              {{ loading() ? 'Signing in...' : 'Sign In' }}
            </button>
          </form>
          <p class="text-xs text-gray-400 text-center mt-4">Demo: admin / admin123</p>
        }

        <!-- Register Form -->
        @if (tab() === 'register') {
          <form (ngSubmit)="doRegister()" class="space-y-4">
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Username</label>
              <input [(ngModel)]="username" name="username" type="text" required
                autocomplete="username"
                class="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input [(ngModel)]="email" name="email" type="email"
                autocomplete="email"
                class="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Password</label>
              <input [(ngModel)]="password" name="password" type="password" required
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
  username = '';
  password = '';
  email    = '';

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
   * The backend answers a duplicate username or email with 400 and a plain
   * string body; anything else is reported generically.
   */
  private registrationError(err: { status?: number; error?: unknown }): string {
    if (err.status === 400 && typeof err.error === 'string' && err.error.trim()) {
      return err.error;
    }
    return 'Could not create the account. Please try again.';
  }
}
