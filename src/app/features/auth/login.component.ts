import {
  Component,
  signal,
  inject,
  ChangeDetectionStrategy,
} from "@angular/core";
import { Router } from "@angular/router";

import { AuthService } from "../../core/services/auth.service";
import { AuthTab, authPanelId, authTabId } from "./auth-tab-ids";
import { AuthTabsComponent } from "./auth-tabs.component";
import { AuthTextFieldComponent } from "./auth-text-field.component";
import { RegisterFormComponent } from "./register-form.component";

@Component({
  selector: "app-login",
  standalone: true,
  imports: [AuthTabsComponent, AuthTextFieldComponent, RegisterFormComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="min-h-screen bg-gradient-to-br from-nav to-accent flex items-center justify-center p-4">
      <div class="bg-white rounded-lg shadow-2xl p-8 w-full max-w-sm">

        <div class="flex items-center gap-3 mb-8">
          <div
            i18n="Product mark on the sign-in card. A brand name: leave it as-is in Latin-script languages, transliterate it where the script differs.@@login.brandMark"
            class="w-9 h-9 bg-accent rounded flex items-center justify-center text-white font-black text-sm"
          >
            CDE
          </div>
          <span i18n="@@login.brandName" class="font-bold text-lg text-gray-800">Platform</span>
        </div>

        <app-auth-tabs [selected]="tab()" (chosen)="showTab($event)" />

        @if (error()) {
          <!--
            A live region. This banner carries the only account of what went
            wrong — a refused sign-in, a password below policy, a missing
            invitation code — and it simply appeared, so a reader who could
            not see it was told nothing at all (§1A.2).
          -->
          <div role="alert"
               class="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded">
            {{ error() }}
          </div>
        }

        @if (tab() === "login") {
          <div role="tabpanel" [id]="panelId('login')" [attr.aria-labelledby]="tabId('login')">
            <form (ngSubmit)="doLogin()" class="space-y-4">
              <app-auth-text-field
                fieldId="login-username" [label]="usernameLabel"
                [(value)]="username" required autocomplete="username" />

              <app-auth-text-field
                fieldId="login-password" [label]="passwordLabel" type="password"
                [(value)]="password" required autocomplete="current-password" />

              <button
                type="submit"
                [disabled]="loading()"
                [attr.aria-busy]="loading() ? 'true' : null"
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
              <button type="button" (click)="showTab('register')"
                      class="text-accent underline hover:no-underline">
                Create one
              </button>
              — you'll get an organisation of your own.
            </p>
          </div>
        }

        @if (tab() === "register") {
          <div role="tabpanel" [id]="panelId('register')" [attr.aria-labelledby]="tabId('register')">
            <app-register-form
              (registered)="goToApplication()"
              (failed)="error.set($event)"
            />
          </div>
        }
      </div>
    </div>
  `,
})
export class LoginComponent {
  private auth = inject(AuthService);
  readonly router = inject(Router);

  tab = signal<AuthTab>("login");
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
  readonly usernameLabel = $localize`:@@login.usernameLabel:Username`;
  readonly passwordLabel = $localize`:@@login.passwordLabel:Password`;

  tabId(tab: AuthTab): string {
    return authTabId(tab);
  }

  panelId(tab: AuthTab): string {
    return authPanelId(tab);
  }

  /**
   * The two forms used to share username and password, so the development
   * prefill opened Register already filled with an account that exists — a
   * registration that could only fail as a duplicate — and switching tabs had
   * to clear and restore the seed values to work around it. Register now owns
   * its own fields, so there is nothing to clear; only the error belongs to
   * the page, and it is stale the moment the tab changes.
   */
  showTab(tab: AuthTab) {
    if (tab === this.tab()) return;
    this.error.set("");
    this.tab.set(tab);
  }

  doLogin() {
    if (!this.username || !this.password) {
      // Never fail silently — e.g. browser autofill can populate the visible
      // inputs without the model picking up the change, leaving these blank.
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
        next: () => this.goToApplication(),
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

  /**
   * Leaves for the application, and recovers if it cannot.
   *
   * <p>A navigation that a guard refuses resolves `false` rather than
   * throwing, and nothing read that: the button stayed disabled on
   * "Signing in..." for good, with the page giving no account of why and no
   * way to try again.
   */
  goToApplication() {
    this.router.navigate(["/"]).then((left) => {
      if (left) return;
      this.loading.set(false);
      this.error.set(
        $localize`:Shown when sign-in succeeded but the application would not open@@login.navigationRefused:You are signed in, but this page could not be opened. Reload and try again, or contact support if it keeps happening.`,
      );
    });
  }
}
