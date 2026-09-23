/**
 * Choosing between signing in and registering.
 *
 * <p>These already carried `role="tab"` inside a `role="tablist"`, and that
 * was the problem. Declaring the role promises the tabs keyboard contract —
 * arrow keys move between tabs, Home and End jump to the ends, and only the
 * selected tab is in the tab order so Tab moves out of the list rather than
 * through it. None of that existed. A screen reader announced "tab, 1 of 2",
 * the reader pressed Right, and nothing happened.
 *
 * <p>§1A.2 puts it plainly: bad ARIA is worse than none. Either the role goes
 * or the behaviour arrives; the role earns its place here because the two
 * panels really are alternatives, so the behaviour arrives.
 *
 * <p>They also controlled nothing. `aria-controls` now names the panel each
 * tab shows, and the panel names the tab back — see `auth-tab-ids.ts`.
 */
import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, Output,
  ElementRef, inject,
} from "@angular/core";

import { AuthTab, authPanelId, authTabId } from "./auth-tab-ids";

/** The tabs in the order they are shown, which is also their arrow-key order. */
const TAB_ORDER: readonly AuthTab[] = ["login", "register"] as const;

@Component({
  selector: "app-auth-tabs",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div role="tablist"
         i18n-aria-label="@@login.tablistLabel" aria-label="Sign in or register"
         (keydown)="onKeydown($event)"
         class="flex gap-1 mb-6 bg-gray-100 p-1 rounded">
      @for (tab of tabs; track tab) {
        <button type="button" role="tab"
          [id]="tabElementId(tab)"
          [attr.aria-controls]="panelElementId(tab)"
          [attr.aria-selected]="tab === selected"
          [attr.tabindex]="tab === selected ? 0 : -1"
          (click)="chosen.emit(tab)"
          class="flex-1 py-1.5 text-sm rounded transition-all"
          [class]="tab === selected
            ? 'bg-white text-accent shadow-sm font-semibold'
            : 'text-gray-500'">
          {{ labelFor(tab) }}
        </button>
      }
    </div>
  `,
})
export class AuthTabsComponent {
  @Input({ required: true }) selected!: AuthTab;

  @Output() chosen = new EventEmitter<AuthTab>();

  private host = inject(ElementRef<HTMLElement>);

  readonly tabs = TAB_ORDER;

  private readonly signInLabel = $localize`:Tab that shows the sign-in form@@login.signInTab:Sign In`;
  private readonly registerLabel = $localize`:Tab that shows the registration form@@login.registerTab:Register`;

  labelFor(tab: AuthTab): string {
    return tab === "login" ? this.signInLabel : this.registerLabel;
  }

  tabElementId(tab: AuthTab): string {
    return authTabId(tab);
  }

  panelElementId(tab: AuthTab): string {
    return authPanelId(tab);
  }

  /**
   * The keyboard contract `role="tab"` promises.
   *
   * <p>Selection follows focus, which is the right choice where switching is
   * free: both panels are already loaded, so there is nothing to wait for and
   * an extra Enter to confirm would only be a step to forget.
   */
  onKeydown(event: KeyboardEvent): void {
    const next = this.tabAfter(event.key);
    if (!next) return;

    event.preventDefault();
    this.chosen.emit(next);
    this.focus(next);
  }

  private tabAfter(key: string): AuthTab | null {
    const here = this.tabs.indexOf(this.selected);
    switch (key) {
      case "ArrowRight":
      case "ArrowDown":
        return this.tabs[(here + 1) % this.tabs.length] ?? null;
      case "ArrowLeft":
      case "ArrowUp":
        return this.tabs[(here - 1 + this.tabs.length) % this.tabs.length] ?? null;
      case "Home":
        return this.tabs[0] ?? null;
      case "End":
        return this.tabs[this.tabs.length - 1] ?? null;
      default:
        return null;
    }
  }

  /**
   * Moves focus to the newly selected tab.
   *
   * <p>Queued, because the roving `tabindex` that makes the element focusable
   * is rendered from `selected`, and that input has not arrived yet when this
   * runs — focusing now would target an element still carrying `-1`.
   */
  private focus(tab: AuthTab): void {
    queueMicrotask(() => {
      const element: HTMLElement | null =
        this.host.nativeElement.querySelector(`#${authTabId(tab)}`);
      element?.focus();
    });
  }
}
