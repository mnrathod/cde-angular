/**
 * The bar above an open document.
 *
 * <p>Most of it is presentation, and two parts are not.
 *
 * <p>**Page navigation is the keyboard path through a long document.** The
 * buttons carry `aria-label` as well as a title because an icon-only button
 * announces as "button" otherwise, and they are `disabled` rather than hidden
 * at the ends — a control that vanishes when you reach the last page moves the
 * one beside it under the pointer, which §1A.2's stable-focus reasoning covers
 * and which is simply unpleasant. The disabled state teaches here ("there is no
 * next page"), which is the §1.1 exception to hiding.
 *
 * <p>**Presence is other people's usernames on screen.** It is the one place
 * this component renders data that came from another session, so the assertions
 * include what happens with none, with one, and with several — a bar that
 * renders an empty avatar cluster, or a tooltip reading ", also viewing", is
 * what an unguarded `join(", ")` produces.
 */
import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";

import { AuthService } from "../../core/services/auth.service";
import { CollaborationService } from "../../core/services/collaboration.service";
import { ViewerStateService } from "../../../viewer-core/viewer-state.service";
import { ViewerTopBarComponent } from "./viewer-top-bar.component";

describe("ViewerTopBarComponent", () => {
  let fixture: ComponentFixture<ViewerTopBarComponent>;
  let bar: ViewerTopBarComponent;
  let state: ViewerStateService;
  let collaboration: CollaborationService;
  let signedInAs: ReturnType<typeof signal<string | null>>;

  beforeEach(() => {
    // A stub AuthService so the signed-in name can be moved: `others` filters
    // the current user out of the presence list, and that filter is only
    // observable if the test can say who the current user is.
    signedInAs = signal<string | null>("lee.zhang");
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ViewerStateService,
        CollaborationService,
        {
          provide: AuthService,
          useValue: {
            username: signedInAs,
            isLoggedIn: signal(true),
            permissions: signal(new Set<string>()),
          },
        },
      ],
    });
    state = TestBed.inject(ViewerStateService);
    collaboration = TestBed.inject(CollaborationService);
    fixture = TestBed.createComponent(ViewerTopBarComponent);
    bar = fixture.componentInstance;
    fixture.detectChanges();
  });

  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? "";
  }

  function byLabel(label: string): HTMLButtonElement | null {
    return fixture.nativeElement.querySelector(`button[aria-label="${label}"]`);
  }

  /**
   * Puts people on the document, as a presence frame would.
   *
   * <p>Through the real `participants` signal rather than by replacing the
   * `others` computed. Two reasons: the component is OnPush, so a plain
   * function in place of a signal never triggers a re-render and the test would
   * assert against stale markup; and `others` filters the current user out, so
   * driving its input exercises that filter instead of stepping over it.
   */
  function othersAre(...usernames: string[]): void {
    collaboration.participants.set(
      usernames.map((username, index) => ({
        username,
        colour: ["#ff0000", "#00ff00", "#0000ff"][index % 3]!,
      })) as never,
    );
    fixture.detectChanges();
  }

  describe("what the document is", () => {
    it("names the document once it has loaded", () => {
      state.viewerData.set({ name: "Foundation plan" } as never);
      fixture.detectChanges();

      expect(text()).toContain("Foundation plan");
    });

    it("says it is loading rather than showing an empty title bar", () => {
      // A blank where the title goes reads as a document with no name.
      state.viewerData.set(null);
      fixture.detectChanges();

      expect(text()).toContain("Loading");
    });

    it("marks the revision so it is not read as part of the title", () => {
      // "Foundation plan P02" would be a plausible drawing title. "Rev P02"
      // cannot be mistaken for one.
      state.viewerData.set({ name: "Foundation plan", revision: "P02" } as never);
      fixture.detectChanges();

      expect(text()).toContain("Rev P02");
    });

    it("says nothing about the revision when the document has none", () => {
      // A bare "Rev" with nothing after it reads as a missing value.
      state.viewerData.set({ name: "Foundation plan", revision: "" } as never);
      fixture.detectChanges();

      expect(text()).not.toContain("Rev");
    });

    it("shows the drawing number, which is what people cite", () => {
      state.viewerData.set({ name: "Foundation plan", drawingNumber: "A-101" } as never);
      fixture.detectChanges();

      expect(text()).toContain("A-101");
    });
  });

  describe("page navigation", () => {
    it("is absent for a document of one page", () => {
      // §1.1: a control that serves no purpose on this document does not belong
      // on screen. Two disabled arrows beside "1 / 1" is clutter.
      state.totalPages.set(1);
      fixture.detectChanges();

      expect(byLabel("Next page")).toBeNull();
    });

    it("appears once there is more than one page", () => {
      state.totalPages.set(4);
      fixture.detectChanges();

      expect(byLabel("Next page")).not.toBeNull();
      expect(byLabel("Previous page")).not.toBeNull();
    });

    it("says which page of how many", () => {
      state.totalPages.set(12);
      state.currentPage.set(3);
      fixture.detectChanges();

      expect(text()).toContain("3 / 12");
    });

    it("moves forward a page", () => {
      state.totalPages.set(4);
      state.currentPage.set(1);
      fixture.detectChanges();

      byLabel("Next page")!.click();
      fixture.detectChanges();

      expect(state.currentPage()).toBe(2);
    });

    it("moves back a page", () => {
      state.totalPages.set(4);
      state.currentPage.set(3);
      fixture.detectChanges();

      byLabel("Previous page")!.click();
      fixture.detectChanges();

      expect(state.currentPage()).toBe(2);
    });

    it("refuses to go back from the first page", () => {
      // Disabled rather than hidden: the control staying put is what stops the
      // next one shifting under the pointer, and the disabled state teaches —
      // there is no page before this one (§1.1's exception).
      state.totalPages.set(4);
      state.currentPage.set(1);
      fixture.detectChanges();

      expect(byLabel("Previous page")!.disabled).toBe(true);
      expect(byLabel("Next page")!.disabled).toBe(false);
    });

    it("refuses to go on from the last page", () => {
      state.totalPages.set(4);
      state.currentPage.set(4);
      fixture.detectChanges();

      expect(byLabel("Next page")!.disabled).toBe(true);
      expect(byLabel("Previous page")!.disabled).toBe(false);
    });

    it("both arrows are operable in the middle of a document", () => {
      state.totalPages.set(4);
      state.currentPage.set(2);
      fixture.detectChanges();

      expect(byLabel("Previous page")!.disabled).toBe(false);
      expect(byLabel("Next page")!.disabled).toBe(false);
    });

    it("each arrow is announced, not left as an unlabelled icon", () => {
      // §1A.2. An icon-only button with no accessible name announces as
      // "button", which tells a screen-reader user nothing about which
      // direction they are about to go.
      state.totalPages.set(4);
      fixture.detectChanges();

      for (const label of ["Previous page", "Next page"]) {
        expect(byLabel(label)).not.toBeNull();
      }
    });
  });

  describe("who else has the document open", () => {
    it("shows nothing when nobody else does", () => {
      // An empty avatar cluster is a small visual lie: it suggests someone is
      // there and their bubble failed to render.
      expect(fixture.nativeElement.querySelector("[title*='also viewing']")).toBeNull();
    });

    it("does not count the reader themselves as somebody else", () => {
      // The presence list includes everyone on the document. Showing your own
      // bubble in "also viewing" is both wrong and alarming — it reads as a
      // second session you did not open.
      signedInAs.set("sam.okonkwo");
      collaboration.participants.set([
        { username: "sam.okonkwo", colour: "#ff0000" },
        { username: "lee.zhang", colour: "#00ff00" },
      ] as never);
      fixture.detectChanges();

      expect(collaboration.others().map((p) => p.username)).toEqual(["lee.zhang"]);
      expect(text()).not.toContain("SA");
    });

    it("shows a bubble for each other person", () => {
      othersAre("sam.okonkwo", "ravi.patel");

      expect(text()).toContain("SA");
      expect(text()).toContain("RA");
    });

    it("names them in the tooltip, because two letters is not a name", () => {
      othersAre("sam.okonkwo", "ravi.patel");

      const cluster = fixture.nativeElement.querySelector("[title]") as HTMLElement;
      const titles = Array.from(
        fixture.nativeElement.querySelectorAll("[title]") as NodeListOf<HTMLElement>,
      ).map((element) => element.title);

      expect(cluster).not.toBeNull();
      expect(titles.some((title) => title.includes("sam.okonkwo"))).toBe(true);
      expect(titles.some((title) => title.includes("ravi.patel"))).toBe(true);
    });

    it("lists one person without a trailing separator", () => {
      // What an unguarded join leaves behind, and it reads as a name that
      // failed to load.
      othersAre("sam.okonkwo");

      expect(bar.presenceTitle()).toContain("sam.okonkwo");
      expect(bar.presenceTitle()).not.toContain(", ,");
      expect(bar.presenceTitle().trim()).not.toMatch(/^,/);
    });

    it("takes two letters for a bubble, in capitals", () => {
      expect(bar.initialsOf("sam.okonkwo")).toBe("SA");
    });

    it("copes with a username shorter than two letters", () => {
      // Service accounts and test fixtures produce these, and slicing past the
      // end must not render an empty bubble that looks like a rendering fault.
      expect(bar.initialsOf("j")).toBe("J");
    });

    it("shows a live indicator only while the socket is connected", () => {
      // Showing it while disconnected would tell the reader that other people's
      // changes are arriving when they are not — which is the one thing an
      // indicator like this exists to prevent.
      collaboration.connected.set(false);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector(".bg-emerald-400")).toBeNull();

      collaboration.connected.set(true);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector(".bg-emerald-400")).not.toBeNull();
    });
  });

  describe("the side panel", () => {
    it("opens and closes", () => {
      const toggle = fixture.nativeElement.querySelector(
        "button[aria-pressed]",
      ) as HTMLButtonElement;
      const before = state.sidebarOpen();

      toggle.click();
      fixture.detectChanges();

      expect(state.sidebarOpen()).toBe(!before);
    });

    it("says whether it is open, rather than leaving the state to the icon", () => {
      // §1A.2: a toggle whose state is carried only by an icon is a toggle a
      // screen-reader user cannot read. aria-pressed is what makes it a toggle
      // rather than a button that does something different each time.
      state.sidebarOpen.set(true);
      fixture.detectChanges();
      expect(
        fixture.nativeElement.querySelector("button[aria-pressed]").getAttribute("aria-pressed"),
      ).toBe("true");

      state.sidebarOpen.set(false);
      fixture.detectChanges();
      expect(
        fixture.nativeElement.querySelector("button[aria-pressed]").getAttribute("aria-pressed"),
      ).toBe("false");
    });

    it("its tooltip says what the next press will do, not what the state is", () => {
      state.sidebarOpen.set(true);
      fixture.detectChanges();
      const open = fixture.nativeElement.querySelector("button[aria-pressed]") as HTMLElement;
      expect(open.title.toLowerCase()).toContain("hide");

      state.sidebarOpen.set(false);
      fixture.detectChanges();
      const closed = fixture.nativeElement.querySelector("button[aria-pressed]") as HTMLElement;
      expect(closed.title.toLowerCase()).toContain("show");
    });
  });

  describe("leaving", () => {
    it("raises the request rather than navigating itself", () => {
      // The shell owns the router. A bar that navigated would make it
      // unreusable in the embed, which has nowhere to go back to.
      let asked = false;
      bar.backRequested.subscribe(() => (asked = true));

      (fixture.nativeElement.querySelector("button") as HTMLButtonElement).click();

      expect(asked).toBe(true);
    });
  });
});
