import {
  Component,
  signal,
  inject,
  ChangeDetectionStrategy,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { CommonModule } from "@angular/common";
import { AuthService } from "../../core/services/auth.service";
import { RegisterFormComponent } from "./register-form.component";

@Component({
  selector: "app-login",
  standalone: true,
  imports: [FormsModule, CommonModule, RegisterFormComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div
      class="min-h-screen bg-gradient-to-br from-nav to-accent flex items-center justify-center p-4"
    >
      <div class="bg-white rounded-lg shadow-2xl p-8 w-full max-w-sm">
        <!-- Logo -->
        <div class="flex items-center gap-3 mb-8">
          <div
            i18n="Product mark on the sign-in card. A brand name: leave it as-is in Latin-script languages, transliterate it where the script differs.@@login.brandMark"
            class="w-9 h-9 bg-accent rounded flex items-center justify-center text-white font-black text-sm"
          >
            CDE
          </div>
          <span i18n="@@login.brandName" class="font-bold text-lg text-gray-800"
            >Platform</span
          >
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
        <div
          role="tablist"
          i18n-aria-label="@@login.tablistLabel"
          aria-label="Sign in or register"
          class="flex gap-1 mb-6 bg-gray-100 p-1 rounded"
        >
          <button
            type="button"
            role="tab"
            i18n="Tab that shows the sign-in form@@login.signInTab"
            (click)="showTab('login')"
            [attr.aria-selected]="tab() === 'login'"
            class="flex-1 py-1.5 text-sm rounded transition-all"
            [class]="
              tab() === 'login'
                ? 'bg-white text-accent shadow-sm font-semibold'
                : 'text-gray-500'
            "
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            i18n="Tab that shows the registration form@@login.registerTab"
            (click)="showTab('register')"
            [attr.aria-selected]="tab() === 'register'"
            class="flex-1 py-1.5 text-sm rounded transition-all"
            [class]="
              tab() === 'register'
                ? 'bg-white text-accent shadow-sm font-semibold'
                : 'text-gray-500'
            "
          >
            Register
          </button>
        </div>

        <!-- Error -->
        @if (error()) {
          <div
            class="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded"
          >
            {{ error() }}
          </div>
        }

        <!-- Login Form -->
        @if (tab() === "login") {
          <form (ngSubmit)="doLogin()" class="space-y-4">
            <div>
              <label
                for="login-username"
                i18n="@@login.usernameLabel"
                class="block text-xs font-medium text-gray-600 mb-1"
                >Username</label
              >
              <input
                id="login-username"
                [(ngModel)]="username"
                name="username"
                type="text"
                required
                autocomplete="username"
                class="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              />
            </div>
            <div>
              <label
                for="login-password"
                i18n="@@login.passwordLabel"
                class="block text-xs font-medium text-gray-600 mb-1"
                >Password</label
              >
              <input
                id="login-password"
                [(ngModel)]="password"
                name="password"
                type="password"
                required
                autocomplete="current-password"
                class="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              [disabled]="loading()"
              class="w-full bg-accent hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded text-sm transition-colors mt-2"
            >
              {{ loading() ? signingInLabel : signInLabel }}
            </button>
          </form>
          <!--
            No demonstration credentials. This used to print "Demo: admin /
            admin123" on the login page of every deployed environment; the
            account it named no longer exists unless a deployment creates one
            with its own password.
          -->
          <p
            i18n="Invitation to register, shown under the sign-in form. The button in the middle is part of the sentence, so the whole paragraph is one message and a translator may move it.@@login.registerInvitation"
            class="text-xs text-gray-500 text-center mt-4"
          >
            No account yet?
            <button
              type="button"
              (click)="showTab('register')"
              class="text-accent underline hover:no-underline"
            >
              Create one
            </button>
            — you'll get an organisation of your own.
          </p>
        }

        <!-- Register Form -->
        @if (tab() === "register") {
          <app-register-form
            (registered)="router.navigate(['/'])"
            (failed)="error.set($event)"
          />
        }
      </div>
    </div>
  `,
})
export class LoginComponent {
  private auth = inject(AuthService);
  readonly router = inject(Router);

  tab = signal<"login" | "register">("login");
  loading = signal(false);
  error = signal("");

  username = "";
  password = "";

  /**
   * Labels that live in an expression rather than in markup.
   *
   * <p>`i18n` marks up template *text*; a string inside `{{ a ? "x" : "y" }}`
   * is an expression and the compiler never sees it as a message. `$localize`
   * is how those reach the catalogue, and it is the reason the submit
   * button's two states are fields here rather than literals in the template.
   */
  readonly signInLabel = $localize`:Sign-in submit button@@login.signInAction:Sign In`;
  readonly signingInLabel = $localize`:Sign-in submit button, while the request is in flight@@login.signingInAction:Signing in...`;

  /**
   * The two forms used to share username and password, so the development
   * prefill opened Register already filled with an account that exists — a
   * registration that could only fail as a duplicate — and switching tabs had
   * to clear and restore the seed values to work around it. Register now owns
   * its own fields, so there is nothing to clear; only the error belongs to
   * the page, and it is stale the moment the tab changes.
   */
  showTab(tab: "login" | "register") {
    if (tab === this.tab()) return;
    this.error.set("");
    this.tab.set(tab);
  }

  doLogin() {
    if (!this.username || !this.password) {
      // Never fail silently — e.g. browser autofill can populate the visible
      // inputs without ngModel picking up the change, leaving these blank.
      this.error.set(
        $localize`:Shown when the sign-in form is submitted with an empty field@@login.missingCredentials:Please enter both username and password.`,
      );
      return;
    }
    this.loading.set(true);
    this.error.set("");
    this.auth
      .login({ username: this.username, password: this.password })
      .subscribe({
        next: () => this.router.navigate(["/"]),
        error: () => {
          // Deliberately does not say which was wrong: §4.2 forbids
          // revealing whether an account exists.
          this.error.set(
            $localize`:Shown when sign-in is refused@@login.refused:Invalid username or password`,
          );
          this.loading.set(false);
        },
      });
  }
}
