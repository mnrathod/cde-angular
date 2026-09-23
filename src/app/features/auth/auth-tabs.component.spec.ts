/**
 * The keyboard contract `role="tab"` promises.
 *
 * <p>These buttons already carried `role="tab"` inside a `role="tablist"`
 * and implemented none of it: no arrow keys, no Home or End, and both tabs
 * in the tab order. A screen reader announced "tab, 1 of 2", the reader
 * pressed Right, and nothing happened — which is the failure §1A.2 means by
 * "bad ARIA is worse than none".
 */
import { ComponentFixture, TestBed } from "@angular/core/testing";

import { AuthTabsComponent } from "./auth-tabs.component";
import { AuthTab } from "./auth-tab-ids";

async function tabsOn(selected: AuthTab = "login") {
  TestBed.configureTestingModule({ imports: [AuthTabsComponent] });
  const fixture = TestBed.createComponent(AuthTabsComponent);
  fixture.componentRef.setInput("selected", selected);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

function host(fixture: ComponentFixture<AuthTabsComponent>) {
  return fixture.nativeElement as HTMLElement;
}

function press(fixture: ComponentFixture<AuthTabsComponent>, key: string) {
  host(fixture)
    .querySelector('[role="tablist"]')!
    .dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}

/** What the tablist asks to be shown next, if anything. */
function chosenOn(fixture: ComponentFixture<AuthTabsComponent>) {
  const asked: AuthTab[] = [];
  fixture.componentInstance.chosen.subscribe((tab) => asked.push(tab));
  return asked;
}

describe("the sign-in card's tabs", () => {
  it("moves to the next tab on Right", async () => {
    const fixture = await tabsOn("login");
    const asked = chosenOn(fixture);

    press(fixture, "ArrowRight");

    expect(asked).toEqual(["register"]);
  });

  it("moves to the previous tab on Left", async () => {
    const fixture = await tabsOn("register");
    const asked = chosenOn(fixture);

    press(fixture, "ArrowLeft");

    expect(asked).toEqual(["login"]);
  });

  it("wraps around rather than stopping at the end", async () => {
    const fixture = await tabsOn("register");
    const asked = chosenOn(fixture);

    press(fixture, "ArrowRight");

    expect(asked).toEqual(["login"]);
  });

  it("jumps to the first tab on Home", async () => {
    const fixture = await tabsOn("register");
    const asked = chosenOn(fixture);

    press(fixture, "Home");

    expect(asked).toEqual(["login"]);
  });

  it("jumps to the last tab on End", async () => {
    const fixture = await tabsOn("login");
    const asked = chosenOn(fixture);

    press(fixture, "End");

    expect(asked).toEqual(["register"]);
  });

  it("ignores a key that means nothing here", async () => {
    const fixture = await tabsOn("login");
    const asked = chosenOn(fixture);

    press(fixture, "a");

    expect(asked).toEqual([]);
  });

  it("keeps only the selected tab in the tab order", async () => {
    // A roving tabindex, so Tab leaves the tablist rather than walking
    // through every tab in it.
    const fixture = await tabsOn("login");
    const order = Array.from(host(fixture).querySelectorAll('[role="tab"]'))
      .map((tab) => tab.getAttribute("tabindex"));

    expect(order).toEqual(["0", "-1"]);
  });

  it("says which tab is selected", async () => {
    const fixture = await tabsOn("register");
    const selected = Array.from(host(fixture).querySelectorAll('[role="tab"]'))
      .map((tab) => tab.getAttribute("aria-selected"));

    expect(selected).toEqual(["false", "true"]);
  });

  it("names the panel each tab controls", async () => {
    // Without this a tab controls nothing, which announces as a tab with no
    // panel rather than as an error.
    const fixture = await tabsOn();
    const controlled = Array.from(host(fixture).querySelectorAll('[role="tab"]'))
      .map((tab) => tab.getAttribute("aria-controls"));

    expect(controlled.every((id) => !!id)).toBe(true);
    expect(new Set(controlled).size).toBe(2);
  });

  it("shows the tab the reader clicks", async () => {
    const fixture = await tabsOn("login");
    const asked = chosenOn(fixture);

    host(fixture).querySelectorAll("button")[1]?.click();

    expect(asked).toEqual(["register"]);
  });
});
