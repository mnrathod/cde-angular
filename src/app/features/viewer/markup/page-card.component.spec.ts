/**
 * Reordering a page without a pointer.
 *
 * <p>The grip was the only way to move a page. Angular's CDK drag-drop has
 * no keyboard mode and a `<span cdkDragHandle>` cannot take focus, so a
 * reader without a mouse could select, rotate, duplicate and delete pages
 * and never move one — while the grip's own translator note claimed
 * "Reordering also works from the keyboard".
 *
 * <p>SC 2.5.7 requires a single-pointer alternative to every drag. These
 * tests are what say there is one.
 */
import { ComponentFixture, TestBed } from "@angular/core/testing";

import { PageCardComponent } from "./page-card.component";
import { DraftPage } from "./page-draft";

const PAGE: DraftPage = { id: 7, sourcePage: 3, rotate: 0 };

async function cardFor(inputs: Record<string, unknown> = {}) {
  TestBed.configureTestingModule({ imports: [PageCardComponent] });
  const fixture = TestBed.createComponent(PageCardComponent);
  const all = { page: PAGE, position: 2, total: 4, ...inputs };
  for (const [name, value] of Object.entries(all)) {
    fixture.componentRef.setInput(name, value);
  }
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

function buttonNamed(fixture: ComponentFixture<PageCardComponent>, pattern: RegExp) {
  const host = fixture.nativeElement as HTMLElement;
  return Array.from(host.querySelectorAll("button")).find((button) =>
    pattern.test(button.getAttribute("aria-label") ?? ""));
}

describe("a page in the pending layout", () => {
  it("offers a control that moves it earlier", async () => {
    const fixture = await cardFor();

    expect(buttonNamed(fixture, /earlier/i)).toBeDefined();
  });

  it("offers a control that moves it later", async () => {
    const fixture = await cardFor();

    expect(buttonNamed(fixture, /later/i)).toBeDefined();
  });

  it("names the page each control moves", async () => {
    // "Move up" is announced identically on all forty cards, which tells a
    // reader nothing about which one they are on.
    const fixture = await cardFor({ position: 3 });

    expect(buttonNamed(fixture, /earlier/i)?.getAttribute("aria-label"))
      .toContain("3");
  });

  it("asks to be moved earlier when that control is pressed", async () => {
    const fixture = await cardFor();
    let moved = false;
    fixture.componentInstance.movedEarlier.subscribe(() => (moved = true));

    buttonNamed(fixture, /earlier/i)?.click();

    expect(moved).toBe(true);
  });

  it("asks to be moved later when that control is pressed", async () => {
    const fixture = await cardFor();
    let moved = false;
    fixture.componentInstance.movedLater.subscribe(() => (moved = true));

    buttonNamed(fixture, /later/i)?.click();

    expect(moved).toBe(true);
  });

  it("cannot be moved earlier than the first page", async () => {
    const fixture = await cardFor({ position: 1 });

    expect(buttonNamed(fixture, /earlier/i)?.disabled).toBe(true);
  });

  it("cannot be moved later than the last page", async () => {
    const fixture = await cardFor({ position: 4, total: 4 });

    expect(buttonNamed(fixture, /later/i)?.disabled).toBe(true);
  });

  it("hides the drag grip from assistive technology", async () => {
    // It is the pointer's affordance. Announcing a control that cannot be
    // operated from the keyboard is worse than not announcing it (§1A.2).
    const fixture = await cardFor();
    const host = fixture.nativeElement as HTMLElement;

    const grip = host.querySelector('[title]');
    expect(grip?.getAttribute("aria-hidden")).toBe("true");
  });

  it("says whether it is selected", async () => {
    const fixture = await cardFor({ selected: true });
    const host = fixture.nativeElement as HTMLElement;

    const thumbnail = host.querySelector("button");
    expect(thumbnail?.getAttribute("aria-pressed")).toBe("true");
  });

  it("names the page its thumbnail shows", async () => {
    const fixture = await cardFor();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector("img")?.getAttribute("alt")).toContain("3");
  });
});
