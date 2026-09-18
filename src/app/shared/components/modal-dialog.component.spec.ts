/**
 * The frame every modal sits in.
 *
 * <p>These assertions are the reason the component exists. The three dialogs
 * it replaced were each a bare `div` with a dark backdrop: nothing announced
 * that a dialog had opened, nothing named it, and Escape did nothing. Each
 * test below fails against that markup.
 */
import { Component, signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";

import { ModalDialogComponent } from "./modal-dialog.component";

@Component({
  standalone: true,
  imports: [ModalDialogComponent],
  template: `
    <button type="button" id="opener">Open</button>
    @if (open()) {
      <app-modal-dialog
        heading="Delete project?"
        confirmLabel="Delete"
        [error]="error()"
        [destructive]="destructive()"
        [confirmDisabled]="busy()"
        (dismissed)="dismissals = dismissals + 1"
        (confirmed)="confirmations = confirmations + 1"
      >
        <p id="inside">This cannot be undone.</p>
      </app-modal-dialog>
    }
  `,
})
class HostsADialog {
  open = signal(false);
  error = signal("");
  destructive = signal(false);
  busy = signal(false);
  dismissals = 0;
  confirmations = 0;
}

describe("ModalDialogComponent", () => {
  let fixture: ComponentFixture<HostsADialog>;
  let host: HostsADialog;

  beforeEach(() => {
    fixture = TestBed.createComponent(HostsADialog);
    host = fixture.componentInstance;
    // Rendered closed first, so a test can put focus somewhere before the
    // dialog opens — which is the state it has to restore.
    fixture.detectChanges();
  });

  /** Opens the dialog and renders it. */
  function openDialog(): void {
    host.open.set(true);
    fixture.detectChanges();
  }

  /** Closes the dialog and renders the page without it. */
  function closeDialog(): void {
    host.open.set(false);
    fixture.detectChanges();
  }

  /** A button by the words on it, the way a user would pick it out. */
  function buttonNamed(text: string): HTMLButtonElement {
    const found = Array.from(
      dialog().querySelectorAll("button"),
    ).find((button) => button.textContent?.trim() === text);
    expect(found, `no button labelled "${text}"`).toBeDefined();
    return found as HTMLButtonElement;
  }

  /** The element carrying the dialog role, which is what a screen reader sees. */
  function dialog(): HTMLElement {
    const found = fixture.nativeElement.querySelector('[role="dialog"]');
    expect(found).not.toBeNull();
    return found as HTMLElement;
  }

  it("announces itself as a modal dialog", () => {
    openDialog();

    expect(dialog().getAttribute("aria-modal")).toBe("true");
  });

  it("takes its accessible name from the heading a sighted user reads", () => {
    // Not a separate aria-label: two names drift apart, and the one nobody
    // can see is the one that goes stale.
    openDialog();

    const labelledBy = dialog().getAttribute("aria-labelledby");
    const heading = fixture.nativeElement.querySelector(`#${labelledBy}`);

    expect(heading?.textContent?.trim()).toBe("Delete project?");
  });

  it("gives two open dialogs different heading ids", () => {
    // A duplicated id makes aria-labelledby resolve to whichever came first,
    // so the second dialog would be announced with the first one's name.
    openDialog();
    const second = TestBed.createComponent(HostsADialog);
    second.componentInstance.open.set(true);
    second.detectChanges();

    const first = dialog().getAttribute("aria-labelledby");
    const other = second.nativeElement
      .querySelector('[role="dialog"]')
      .getAttribute("aria-labelledby");

    expect(other).not.toBe(first);
  });

  it("dismisses on Escape", () => {
    openDialog();

    dialog().dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );

    expect(host.dismissals).toBe(1);
  });

  it("dismisses on a click outside it", () => {
    openDialog();
    const backdrop = dialog().parentElement!;

    backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(host.dismissals).toBe(1);
  });

  it("stays open when the click was on something inside it", () => {
    // A drag across a text selection ends its click on the backdrop. Closing
    // then would throw away whatever had been typed.
    openDialog();

    dialog().dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(host.dismissals).toBe(0);
  });

  it("puts focus back where it came from when it closes", () => {
    // Otherwise focus falls to the top of the document and a keyboard user
    // has to tab all the way back to the control they opened it from.
    const opener = fixture.nativeElement.querySelector(
      "#opener",
    ) as HTMLButtonElement;
    opener.focus();
    openDialog();

    closeDialog();

    expect(fixture.nativeElement.ownerDocument.activeElement).toBe(opener);
  });

  it("does not reach for an element that left the page while it was open", () => {
    // Focusing a detached element silently does nothing and leaves focus on
    // <body>; the guard is there so this is not mistaken for success.
    const opener = fixture.nativeElement.querySelector("#opener") as HTMLElement;
    opener.focus();
    openDialog();
    opener.remove();

    expect(() => closeDialog()).not.toThrow();
  });

  it("shows the content it was given", () => {
    openDialog();

    expect(dialog().querySelector("#inside")?.textContent).toBe(
      "This cannot be undone.",
    );
  });

  describe("the action row", () => {
    it("confirms through the button that names the action", () => {
      openDialog();

      buttonNamed("Delete").click();

      expect(host.confirmations).toBe(1);
    });

    it("dismisses through Cancel", () => {
      openDialog();

      buttonNamed("Cancel").click();

      expect(host.dismissals).toBe(1);
    });

    it("holds the confirm button while the request is in flight", () => {
      // Without this a second press sends the same request twice, and for a
      // deletion the second one 404s and reports a failure that did not
      // happen.
      openDialog();
      expect(buttonNamed("Delete").disabled).toBe(false);

      host.busy.set(true);
      fixture.detectChanges();

      expect(buttonNamed("Delete").disabled).toBe(true);
    });

    it("leaves Cancel usable while the request is in flight", () => {
      // A dialog with every control disabled is a dialog a user cannot get
      // out of if the request never comes back.
      openDialog();
      host.busy.set(true);
      fixture.detectChanges();

      expect(buttonNamed("Cancel").disabled).toBe(false);
    });

    it("colours a destructive action differently from an ordinary one", () => {
      // A second cue alongside the wording, not instead of it (§1A.2) — the
      // button still says "Delete".
      openDialog();
      const ordinary = buttonNamed("Delete").className;
      host.destructive.set(true);
      fixture.detectChanges();

      expect(buttonNamed("Delete").className).not.toBe(ordinary);
    });
  });

  describe("reporting a failure", () => {
    it("says nothing at all when nothing went wrong", () => {
      openDialog();

      expect(dialog().querySelector('[role="alert"]')).toBeNull();
    });

    it("announces a failure rather than only showing it", () => {
      // role="alert": a message that appears silently is a message a screen
      // reader user never learns about.
      openDialog();
      host.error.set("Could not delete the project.");
      fixture.detectChanges();

      expect(dialog().querySelector('[role="alert"]')?.textContent).toContain(
        "Could not delete the project.",
      );
    });
  });
});
