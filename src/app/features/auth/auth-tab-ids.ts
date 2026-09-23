/**
 * The ids that tie a tab to the panel it controls.
 *
 * <p>In one place because both sides have to agree on them and neither can
 * see the other: the tablist renders `aria-controls`, and the panel — which
 * lives in the page, not in the tablist — renders `aria-labelledby` back.
 * A typo in either direction leaves a tab pointing at nothing, which
 * announces as a tab with no panel rather than as an error.
 */

/** Which of the two things the sign-in card can be showing. */
export type AuthTab = "login" | "register";

export function authTabId(tab: AuthTab): string {
  return `auth-tab-${tab}`;
}

export function authPanelId(tab: AuthTab): string {
  return `auth-panel-${tab}`;
}
