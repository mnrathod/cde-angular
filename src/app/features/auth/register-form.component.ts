import {
  Component,
  output,
  signal,
  inject,
  ChangeDetectionStrategy,
} from "@angular/core";

import { AuthService } from "../../core/services/auth.service";
import { problemMessage } from "../../core/handlers/problem-detail";
import { AuthTextFieldComponent } from "./auth-text-field.component";
import { OrganisationChoiceComponent } from "./organisation-choice.component";

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

/**
 * Creating an account, in one of the two shapes the server accepts.
 *
 * <p>Without an invitation the account gets a new organisation of its own;
 * with one it joins the organisation that issued it. Which of those is
 * happening is the only real decision on this form — see
 * `organisation-choice.component.ts`.
 */
@Component({
  selector: "app-register-form",
  standalone: true,
  imports: [AuthTextFieldComponent, OrganisationChoiceComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <form (ngSubmit)="submit()" class="space-y-4">
      <app-auth-text-field
        fieldId="register-username" [label]="usernameLabel"
        [(value)]="username" required autocomplete="username" />

      <app-auth-text-field
        fieldId="register-email" [label]="emailLabel" type="email"
        [(value)]="email" required autocomplete="email" />

      <app-auth-text-field
        fieldId="register-password" [label]="passwordLabel" type="password"
        [(value)]="password" required autocomplete="new-password"
        [minLength]="minPasswordLength" [hint]="passwordHint" />

      <app-organisation-choice
        [joiningExisting]="joiningExisting()"
        [organisationName]="organisationName"
        [invitationToken]="invitationToken"
        (newOrganisationChosen)="chooseNewOrganisation()"
        (existingOrganisationChosen)="chooseExistingOrganisation()"
        (organisationNameChange)="organisationName = $event"
        (invitationTokenChange)="invitationToken = $event"
      />

      <button
        type="submit"
        [disabled]="loading()"
        [attr.aria-busy]="loading() ? 'true' : null"
        class="w-full bg-accent hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded text-sm transition-colors"
      >
        {{ loading() ? creatingLabel : createAccountLabel }}
      </button>
    </form>
  `,
})
export class RegisterFormComponent {
  private auth = inject(AuthService);

  /** Raised when the account exists and the session is live. */
  readonly registered = output<void>();

  /** Raised with text to show; empty clears whatever is shown. */
  readonly failed = output<string>();

  readonly minPasswordLength = MIN_PASSWORD_LENGTH;

  loading = signal(false);
  joiningExisting = signal(false);

  /**
   * Labels and messages that live in expressions rather than in markup, so
   * `i18n` cannot reach them. See the note in login.component.ts.
   */
  readonly createAccountLabel = $localize`:Registration submit button@@register.createAccountAction:Create Account`;
  readonly creatingLabel = $localize`:Registration submit button, while the request is in flight@@register.creatingAction:Creating...`;
  readonly usernameLabel = $localize`:@@register.usernameLabel:Username`;
  readonly emailLabel = $localize`:@@register.emailLabel:Email`;
  readonly passwordLabel = $localize`:@@register.passwordLabel:Password`;
  readonly passwordHint = $localize`:Minimum password length, set by tenant policy@@register.passwordHint:At least ${MIN_PASSWORD_LENGTH}:length: characters.`;

  username = "";
  email = "";
  password = "";
  organisationName = "";
  invitationToken = "";

  chooseNewOrganisation() {
    this.joiningExisting.set(false);
    // Cleared rather than kept hidden: a token left in a field nobody can see
    // would still be sent, and would then be refused for an organisation the
    // user did not think they were joining.
    this.invitationToken = "";
  }

  chooseExistingOrganisation() {
    this.joiningExisting.set(true);
    this.organisationName = "";
  }

  submit() {
    const refusal = this.whyNotReady();
    if (refusal) {
      this.failed.emit(refusal);
      return;
    }

    this.loading.set(true);
    this.failed.emit("");
    this.auth.register(this.request()).subscribe({
      // Registration returns a token, so the user lands signed in.
      next: () => this.registered.emit(),
      error: (err: unknown) => {
        this.loading.set(false);
        this.failed.emit(
          problemMessage(
            err,
            $localize`:Fallback when the server refuses registration without saying why@@register.failed:Could not create the account. Please try again.`,
          ),
        );
      },
    });
  }

  /** What stops this form being sent, said in words, or null when nothing does. */
  private whyNotReady(): string | null {
    // Autofill can populate the inputs without the model seeing it, so never
    // fail silently on an apparently-filled form.
    if (!this.username || !this.email || !this.password) {
      return $localize`:Shown when the registration form is submitted with an empty field@@register.missingFields:Please enter a username, email and password.`;
    }
    if (this.password.length < MIN_PASSWORD_LENGTH) {
      // Stated up front rather than surfacing the server's rejection, which
      // would cost a round trip to tell the user something knowable here.
      return $localize`:Shown when a chosen password is shorter than tenant policy allows@@register.passwordTooShort:Password must be at least ${MIN_PASSWORD_LENGTH}:length: characters.`;
    }
    if (this.joiningExisting() && !this.invitationToken.trim()) {
      return $localize`:Shown when "join an organisation" is chosen but no code was entered@@register.missingInvitationCode:Enter the invitation code, or choose to create a new organisation.`;
    }
    return null;
  }

  private request() {
    return {
      username: this.username,
      email: this.email,
      password: this.password,
      // Omitted rather than sent empty. The server reads a blank invitation as
      // no invitation, but putting a meaningless field on the wire makes the
      // intent unreadable from here.
      ...(this.invitationToken.trim()
        ? { invitationToken: this.invitationToken.trim() }
        : {}),
      ...(this.organisationName.trim()
        ? { organisationName: this.organisationName.trim() }
        : {}),
    };
  }
}
