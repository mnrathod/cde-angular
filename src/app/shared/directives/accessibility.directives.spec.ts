/**
 * The four accessibility directives, and what each is actually for.
 *
 * <p>These exist because the alternative — remembering to do it by hand on every
 * dialog and every clickable div — is how a codebase ends up with six dialogs,
 * four of which trap focus. §1A.5 is explicit that automated checks catch only a
 * minority of WCAG issues, and focus management is squarely in the majority they
 * miss: axe cannot tell whether Tab leaves a modal, because that needs the key
 * to actually be pressed.
 *
 * <p>So each of these is asserted by driving the keyboard and reading where
 * focus went, not by checking that an attribute is present.
 *
 * <p>One of them is a stopgap rather than a good thing. `keyboardClick` makes a
 * non-button element respond to Enter and Space, which §1A.2 would rather not
 * need: "a `<button>` is a button", and ARIA is for where native semantics are
 * insufficient. It is here because the markup it serves cannot always be a
 * button — a table row that is itself clickable cannot be one, since it contains
 * buttons — and a div with a click handler and no keyboard route is not reachable
 * at all. The tests record what it has to do; they are not an endorsement of
 * reaching for it.
 */
import { Component } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";

import {
  ACCESSIBILITY_DIRECTIVES,
  AriaLiveDirective,
  FocusTrapDirective,
  KeyboardClickDirective,
  SkipLinkDirective,
} from "./accessibility.directives";

describe("the focus trap", () => {
  @Component({
    standalone: true,
    imports: [FocusTrapDirective],
    template: `
      <button id="outside">Outside</button>
      <div focusTrap id="dialog">
        <button id="first">First</button>
        <button id="middle">Middle</button>
        <button id="last">Last</button>
      </div>
    `,
  })
  class DialogHost {}

  let fixture: ComponentFixture<DialogHost>;

  function el(id: string): HTMLElement {
    return fixture.nativeElement.querySelector(`#${id}`) as HTMLElement;
  }

  /** Tab, or Shift+Tab, dispatched at the trapped container. */
  function tab(shift = false): KeyboardEvent {
    const event = new KeyboardEvent("keydown", {
      key: "Tab",
      shiftKey: shift,
      bubbles: true,
      cancelable: true,
    });
    el("dialog").dispatchEvent(event);
    return event;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [DialogHost] });
    fixture = TestBed.createComponent(DialogHost);
    // The directive filters by offsetParent, which the test DOM leaves null for
    // everything — so it is given a value, otherwise the trap correctly
    // concludes nothing is visible and declines to trap.
    fixture.detectChanges();
    for (const id of ["first", "middle", "last"]) {
      Object.defineProperty(el(id), "offsetParent", {
        value: el("dialog"),
        configurable: true,
      });
    }
  });

  it("sends focus from the last control back to the first", () => {
    // Tab off the end of a modal normally lands on the page behind it — which
    // the reader cannot see, and which for a modal dialog means they are now
    // operating something they did not open (SC 2.4.3).
    el("last").focus();

    const event = tab();

    expect(globalThis.document.activeElement?.id).toBe("first");
    expect(event.defaultPrevented).toBe(true);
  });

  it("sends focus from the first control back to the last on Shift+Tab", () => {
    el("first").focus();

    const event = tab(true);

    expect(globalThis.document.activeElement?.id).toBe("last");
    expect(event.defaultPrevented).toBe(true);
  });

  it("leaves Tab alone in the middle, so the order inside is the document's", () => {
    // Intercepting every Tab would make the trap decide the order, and the
    // browser's own order is the one that matches what the reader sees.
    el("middle").focus();

    const event = tab();

    expect(event.defaultPrevented).toBe(false);
    expect(globalThis.document.activeElement?.id).toBe("middle");
  });

  it("ignores keys that are not Tab", () => {
    el("last").focus();

    el("dialog").dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
    );

    expect(globalThis.document.activeElement?.id).toBe("last");
  });

  it("skips a control that is not on screen", () => {
    // A collapsed section's buttons are still in the DOM. Treating one as the
    // last focusable element sends the reader's focus somewhere invisible, which
    // looks exactly like focus having been lost.
    Object.defineProperty(el("last"), "offsetParent", { value: null, configurable: true });
    el("middle").focus();

    tab();

    expect(globalThis.document.activeElement?.id).toBe("first");
  });

  it("does nothing when there is nothing focusable inside", () => {
    // An empty dialog, or one still loading its content. Trapping into it would
    // leave the reader unable to Tab at all.
    @Component({ standalone: true, imports: [FocusTrapDirective], template: `<div focusTrap id="empty">Loading…</div>` })
    class EmptyHost {}

    const empty = TestBed.createComponent(EmptyHost);
    empty.detectChanges();
    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });

    (empty.nativeElement.querySelector("#empty") as HTMLElement).dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it("stops listening once the dialog is gone", () => {
    // A listener left behind would keep moving focus around a container that is
    // no longer on screen.
    el("last").focus();
    fixture.destroy();

    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    el("dialog").dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it("moves focus into the dialog when it opens", async () => {
    // A dialog that opens with focus still behind it is one a keyboard user has
    // to Tab into, through everything on the page (SC 2.4.3).
    el("outside").focus();

    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(["first", "middle", "last"]).toContain(globalThis.document.activeElement?.id);
  });
});

describe("making a non-button element clickable from the keyboard", () => {
  @Component({
    standalone: true,
    imports: [KeyboardClickDirective],
    template: `
      <div role="button" keyboardClick id="target" (click)="presses = presses + 1">Press me</div>
    `,
  })
  class ClickableHost {
    presses = 0;
  }

  let fixture: ComponentFixture<ClickableHost>;
  let target: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ClickableHost] });
    fixture = TestBed.createComponent(ClickableHost);
    fixture.detectChanges();
    target = fixture.nativeElement.querySelector("#target") as HTMLElement;
  });

  function press(key: string): KeyboardEvent {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    fixture.detectChanges();
    return event;
  }

  it("puts the element in the tab order, which is what makes it reachable at all", () => {
    // Without a tabindex the element cannot be focused, so no key event ever
    // arrives and the handler below is unreachable.
    expect(target.getAttribute("tabindex")).toBe("0");
  });

  it("activates on Enter, as a button does", () => {
    press("Enter");

    expect(fixture.componentInstance.presses).toBe(1);
  });

  it("activates on Space, as a button does", () => {
    press(" ");

    expect(fixture.componentInstance.presses).toBe(1);
  });

  it("takes over Space so the page does not scroll instead", () => {
    // Space scrolls by default. Activating the control *and* scrolling the page
    // away from it is worse than either.
    const event = press(" ");

    expect(event.defaultPrevented).toBe(true);
  });

  it("ignores every other key", () => {
    for (const key of ["a", "Tab", "Escape", "ArrowDown"]) {
      press(key);
    }

    expect(fixture.componentInstance.presses).toBe(0);
  });

  it("raises the same click the pointer would, rather than a second code path", () => {
    // The point of calling .click() instead of invoking a callback: the keyboard
    // and the pointer go through one handler, so they cannot drift apart.
    target.click();
    fixture.detectChanges();
    press("Enter");

    expect(fixture.componentInstance.presses).toBe(2);
  });
});

describe("announcing a change to a screen reader", () => {
  @Component({
    standalone: true,
    imports: [AriaLiveDirective],
    template: `
      <div ariaLive="polite" id="default">{{ message }}</div>
      <div ariaLive="assertive" id="urgent">{{ message }}</div>
    `,
  })
  class AnnouncingHost {
    message = "";
  }

  let fixture: ComponentFixture<AnnouncingHost>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [AnnouncingHost] });
    fixture = TestBed.createComponent(AnnouncingHost);
    fixture.detectChanges();
  });

  function el(id: string): HTMLElement {
    return fixture.nativeElement.querySelector(`#${id}`) as HTMLElement;
  }

  it("marks the region before there is anything in it", () => {
    // A live region added at the same moment as its content is not announced:
    // the screen reader has to have been watching the node already. Setting the
    // attribute in ngOnInit rather than when the message arrives is the whole
    // behaviour.
    expect(fixture.componentInstance.message).toBe("");
    expect(el("default").getAttribute("aria-live")).toBe("polite");
  });

  it("interrupts nothing by default", () => {
    // Polite is the right default by a wide margin. Assertive cuts off whatever
    // the reader is listening to, which for a routine "Saved" is rude and for a
    // frequent one is unusable.
    expect(el("default").getAttribute("aria-live")).toBe("polite");
  });

  it("can be asked to interrupt, for something that cannot wait", () => {
    expect(el("urgent").getAttribute("aria-live")).toBe("assertive");
  });

  it("reads the whole region rather than only the words that changed", () => {
    // Without aria-atomic a changed number is announced alone — "4" — with none
    // of the sentence around it.
    expect(el("default").getAttribute("aria-atomic")).toBe("true");
  });
});

describe("the skip link", () => {
  @Component({
    standalone: true,
    imports: [SkipLinkDirective],
    template: `<a skipLink href="#main" id="skip">Skip to content</a>`,
  })
  class SkipHost {}

  let fixture: ComponentFixture<SkipHost>;
  let link: HTMLAnchorElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SkipHost] });
    fixture = TestBed.createComponent(SkipHost);
    fixture.detectChanges();
    link = fixture.nativeElement.querySelector("#skip") as HTMLAnchorElement;
  });

  it("is out of sight until it is needed", () => {
    // It is the first thing in the tab order and of no use to a pointer, so it
    // sits off the top of the page rather than taking space from the layout.
    expect(link.style.top).toContain("-100%");
  });

  it("is still in the tab order while hidden", () => {
    // `display: none` or `visibility: hidden` would take it out, which is the
    // usual way a skip link comes to exist and never work (SC 2.4.1).
    expect(link.style.display).not.toBe("none");
    expect(link.style.visibility).not.toBe("hidden");
  });

  it("comes into view when it is focused", () => {
    link.dispatchEvent(new FocusEvent("focus"));

    expect(link.style.top).toBe("0px");
  });

  it("goes away again when focus moves on", () => {
    link.dispatchEvent(new FocusEvent("focus"));

    link.dispatchEvent(new FocusEvent("blur"));

    expect(link.style.top).toContain("-100%");
  });

  it("sits above everything, so it is not hidden behind a sticky header", () => {
    // SC 2.4.11: focus must not be obscured. A skip link under the header is
    // focused and invisible, which is indistinguishable from broken.
    expect(Number(link.style.zIndex)).toBeGreaterThan(1000);
  });

  it("starts at the leading edge, which flips with the writing direction", () => {
    // `inset-inline-start` rather than `left`: §1.4 asks for RTL-safe layout, and
    // a skip link pinned to the left of an Arabic page is pinned to the wrong
    // side of it.
    expect(link.style.cssText).toContain("inset-inline-start");
    expect(link.style.cssText).not.toMatch(/(^|;)\s*left:/);
  });
});

describe("the set exported for a component to import", () => {
  it("holds every directive, so importing the set is enough", () => {
    // A directive left out of the list is one that silently does nothing in any
    // component that imported the set and trusted it.
    expect(ACCESSIBILITY_DIRECTIVES).toContain(FocusTrapDirective);
    expect(ACCESSIBILITY_DIRECTIVES).toContain(KeyboardClickDirective);
    expect(ACCESSIBILITY_DIRECTIVES).toContain(AriaLiveDirective);
    expect(ACCESSIBILITY_DIRECTIVES).toContain(SkipLinkDirective);
    expect(ACCESSIBILITY_DIRECTIVES).toHaveLength(4);
  });
});
