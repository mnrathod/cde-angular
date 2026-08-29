import {
  Component,
  output,
  signal,
  inject,
  ChangeDetectionStrategy,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { AuthService } from "../../core/services/auth.service";
import { problemDetail } from "../../core/handlers/problem-detail";

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
 * happening is the only real decision on this form, so it is a single explicit
 * choice rather than two optional fields the user has to work out for
 * themselves — sending both would ask them to understand the tenancy model to
 * sign up.
 */
@Component({
  selector: "app-register-form",
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <form (ngSubmit)="submit()" class="space-y-4">
      <div>
        <label
          for="register-username"
          class="block text-xs font-medium text-gray-600 mb-1"
          >Username</label
        >
        <input
          id="register-username"
          [(ngModel)]="username"
          name="username"
          type="text"
          required
          autocomplete="username"
          class="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>
      <div>
        <label
          for="register-email"
          class="block text-xs font-medium text-gray-600 mb-1"
          >Email</label
        >
        <input
          id="register-email"
          [(ngModel)]="email"
          name="email"
          type="email"
          required
          autocomplete="email"
          class="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>
      <div>
        <label
          for="register-password"
          class="block text-xs font-medium text-gray-600 mb-1"
          >Password</label
        >
        <input
          id="register-password"
          [(ngModel)]="password"
          name="password"
          type="password"
          required
          autocomplete="new-password"
          class="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <p class="text-xs text-gray-500 mt-1">
          At least {{ minPasswordLength }} characters.
        </p>
      </div>

      <!--
        The two shapes, as radios rather than a checkbox: they are exclusive
        alternatives and both need a visible label, which is also what makes
        them announce correctly as a group. type="button" is not needed here
        because these are inputs, but the fieldset is — without it a screen
        reader reads two unrelated radios with no idea what the choice is.
      -->
      <fieldset class="border border-gray-200 rounded p-3">
        <legend class="text-xs font-medium text-gray-600 px-1">
          Organisation
        </legend>

        <div class="flex items-start gap-2 mb-2">
          <input
            id="join-new"
            type="radio"
            name="joining"
            value="new"
            class="mt-1"
            [checked]="!joiningExisting()"
            (change)="chooseNewOrganisation()"
          />
          <label for="join-new" class="text-sm text-gray-700">
            Create a new organisation
          </label>
        </div>

        @if (!joiningExisting()) {
          <div class="ml-6 mb-3">
            <label
              for="organisation-name"
              class="block text-xs font-medium text-gray-600 mb-1"
            >
              Organisation name <span class="text-gray-400">(optional)</span>
            </label>
            <input
              id="organisation-name"
              [(ngModel)]="organisationName"
              name="organisationName"
              type="text"
              class="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <p class="text-xs text-gray-500 mt-1">
              Leave blank and we'll name it after you — you can change it later.
            </p>
          </div>
        }

        <div class="flex items-start gap-2">
          <input
            id="join-existing"
            type="radio"
            name="joining"
            value="existing"
            class="mt-1"
            [checked]="joiningExisting()"
            (change)="chooseExistingOrganisation()"
          />
          <label for="join-existing" class="text-sm text-gray-700">
            Join one I've been invited to
          </label>
        </div>

        @if (joiningExisting()) {
          <div class="ml-6 mt-2">
            <label
              for="invitation-token"
              class="block text-xs font-medium text-gray-600 mb-1"
              >Invitation code</label
            >
            <!--
              A plain text input, so it pastes and autofills. The code is long
              and nobody types it; splitting it or blocking paste would be an
              accessibility failure (SC 3.3.8) as well as an annoyance.
            -->
            <input
              id="invitation-token"
              [(ngModel)]="invitationToken"
              name="invitationToken"
              type="text"
              autocomplete="off"
              spellcheck="false"
              class="w-full px-3 py-2 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <p class="text-xs text-gray-500 mt-1">
              Use the same email address the invitation was sent to.
            </p>
          </div>
        }
      </fieldset>

      <button
        type="submit"
        [disabled]="loading()"
        class="w-full bg-accent hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded text-sm transition-colors"
      >
        {{ loading() ? "Creating..." : "Create Account" }}
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
    // Autofill can populate the inputs without ngModel seeing it, so never
    // fail silently on an apparently-filled form.
    if (!this.username || !this.email || !this.password) {
      this.failed.emit("Please enter a username, email and password.");
      return;
    }
    if (this.password.length < MIN_PASSWORD_LENGTH) {
      // Stated up front rather than surfacing the server's rejection, which
      // would cost a round trip to tell the user something knowable here.
      this.failed.emit(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      );
      return;
    }
    if (this.joiningExisting() && !this.invitationToken.trim()) {
      this.failed.emit(
        "Enter the invitation code, or choose to create a new organisation.",
      );
      return;
    }

    this.loading.set(true);
    this.failed.emit("");
    this.auth
      .register({
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
      })
      .subscribe({
        // Registration returns a token, so the user lands signed in.
        next: () => this.registered.emit(),
        error: (err: unknown) => {
          this.loading.set(false);
          this.failed.emit(
            problemDetail(
              err,
              "Could not create the account. Please try again.",
            ),
          );
        },
      });
  }
}
