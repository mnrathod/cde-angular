/**
 * The bar across the top of the workspace: who is signed in, and the way out.
 */
import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core";

import { AuthService } from "../../core/services/auth.service";

@Component({
  selector: "app-workspace-header",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <header
      class="flex items-center h-11 px-4 gap-3 flex-shrink-0"
      style="background:var(--nav);box-shadow:0 2px 4px rgba(0,0,0,.15)"
    >
      <div class="flex items-center gap-2">
        <div
          class="w-7 h-7 bg-white rounded flex items-center justify-center text-accent font-black text-xs"
        >
          <ng-container
            i18n="Product mark in the top bar. A brand name: leave it as-is in Latin-script languages, transliterate it where the script differs.@@shell.brandMark"
            >CDE</ng-container
          >
        </div>
        <span
          i18n="@@shell.brandName"
          class="text-white font-bold text-sm tracking-wide"
          >Platform</span
        >
      </div>
      <div class="flex-1"></div>
      <div class="flex items-center gap-2">
        <!-- Decorative: the username it abbreviates is read out beside it, so
             announcing the initial as well would say the name twice. -->
        <div
          aria-hidden="true"
          class="w-7 h-7 rounded-full bg-blue-400 flex items-center justify-center text-white font-bold text-xs border-2 border-white/30"
        >
          {{ avatarInitial() }}
        </div>
        <span class="text-white/85 text-xs">{{ auth.username() }}</span>
        <button
          (click)="auth.logout()"
          class="text-xs px-3 py-1 rounded border border-white/30 bg-white/10 text-white/90 hover:bg-white/20 transition-colors"
        >
          <ng-container i18n="Ends the session@@shell.signOut"
            >Sign Out</ng-container
          >
        </button>
      </div>
    </header>
  `,
})
export class WorkspaceHeaderComponent {
  auth = inject(AuthService);

  /**
   * First letter of the signed-in username, for the avatar bubble.
   *
   * <p>Computed here rather than in the template because Angular's template
   * compiler does not carry a `?.` short-circuit across the rest of the chain
   * the way TypeScript does: `username()?.charAt(0).toUpperCase()` type-checks
   * in a .ts file but fails template checking, and would throw at runtime for
   * a user with no username.
   */
  avatarInitial = computed(
    () => this.auth.username()?.charAt(0)?.toUpperCase() ?? "",
  );
}
