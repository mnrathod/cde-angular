/**
 * What the sign-in card says when something goes wrong.
 *
 * <p>Two failures had no account at all. The error banner was a plain `div`,
 * so a refused sign-in, a password below policy and a missing invitation code
 * all appeared silently to anyone not looking at that corner of the screen
 * (§1A.2). And a navigation the router refused resolves `false` rather than
 * throwing, which nothing read — so a correct sign-in could leave the button
 * disabled on "Signing in..." for good, with no account of why.
 */
import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { Router, provideRouter } from "@angular/router";
import { of, throwError } from "rxjs";

import { AuthResponse } from "../../core/models";
import { AuthService } from "../../core/services/auth.service";
import { LoginComponent } from "./login.component";

/** A signed-in session, in the shape the service hands back. */
const SESSION: AuthResponse = {
  token: "a-token",
  username: "someone",
  role: "MEMBER",
};

describe("the sign-in card", () => {
  let fixture: ComponentFixture<LoginComponent>;
  let login: LoginComponent;
  let auth: AuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    fixture = TestBed.createComponent(LoginComponent);
    login = fixture.componentInstance;
    auth = TestBed.inject(AuthService);
    fixture.detectChanges();
  });

  function host() {
    return fixture.nativeElement as HTMLElement;
  }

  /** The banner, if one is showing. */
  function banner(): HTMLElement | null {
    fixture.detectChanges();
    return host().querySelector('[role="alert"]');
  }

  it("announces a refused sign-in rather than only showing it", () => {
    vi.spyOn(auth, "login").mockReturnValue(throwError(() => ({ status: 401 })));
    login.username = "someone";
    login.password = "a-password";

    login.doLogin();

    expect(banner()).not.toBeNull();
    expect(banner()!.textContent!.trim().length).toBeGreaterThan(0);
  });

  it("announces an incomplete form rather than failing silently", () => {
    login.username = "someone";
    login.password = "";

    login.doLogin();

    expect(banner()).not.toBeNull();
  });

  it("stops showing itself as busy when sign-in is refused", () => {
    vi.spyOn(auth, "login").mockReturnValue(throwError(() => ({ status: 401 })));
    login.username = "someone";
    login.password = "a-password";

    login.doLogin();

    expect(login.loading()).toBe(false);
  });

  it("does not reveal whether the account exists", () => {
    // §4.2: the message must not distinguish a wrong username from a wrong
    // password, so it can name neither field.
    vi.spyOn(auth, "login").mockReturnValue(throwError(() => ({ status: 401 })));
    login.username = "someone";
    login.password = "a-password";

    login.doLogin();

    const said = banner()!.textContent!.toLowerCase();
    expect(said).not.toContain("no such");
    expect(said).not.toContain("username is");
  });

  describe("when the application will not open", () => {
    beforeEach(() => {
      vi.spyOn(auth, "login").mockReturnValue(of(SESSION));
      vi.spyOn(TestBed.inject(Router), "navigate").mockResolvedValue(false);
    });

    it("says so, rather than sitting on Signing in for good", async () => {
      login.username = "someone";
      login.password = "a-password";

      login.doLogin();
      await fixture.whenStable();

      expect(banner()).not.toBeNull();
    });

    it("lets the reader try again", async () => {
      login.username = "someone";
      login.password = "a-password";

      login.doLogin();
      await fixture.whenStable();

      expect(login.loading()).toBe(false);
    });
  });

  describe("the two panels", () => {
    it("labels the visible panel with the tab that controls it", () => {
      const panel = host().querySelector('[role="tabpanel"]');
      const labelledBy = panel?.getAttribute("aria-labelledby") ?? "";

      expect(host().querySelector(`#${labelledBy}`)?.getAttribute("role")).toBe("tab");
    });

    it("shows the registration form when that tab is chosen", () => {
      login.showTab("register");
      fixture.detectChanges();

      expect(host().querySelector("app-register-form")).not.toBeNull();
    });

    it("drops a stale message when the tab changes", () => {
      login.error.set("something went wrong");

      login.showTab("register");

      expect(banner()).toBeNull();
    });
  });
});
