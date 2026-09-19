/**
 * Wiping between two drawings without a pointer.
 *
 * <p>The wipe was a `<div>` driven by mousemove and touchmove only. There
 * was no keyboard route to it, so the slider comparison could not be used at
 * all without a mouse — WCAG 2.2 SC 2.5.7 requires a single-pointer
 * alternative to every drag, and §1A.2 treats that as a functional defect.
 *
 * <p>These tests drive the control the way a reader would: by its accessible
 * name, and with the keys a range responds to.
 */
import { ComponentFixture, TestBed } from "@angular/core/testing";

import { CompareSliderComponent } from "./compare-slider.component";

function wipeControl(fixture: ComponentFixture<CompareSliderComponent>) {
  const host = fixture.nativeElement as HTMLElement;
  const control = host.querySelector<HTMLInputElement>('input[type="range"]');
  expect(control, "the wipe has no control a reader can reach").not.toBeNull();
  return control!;
}

async function sliderFixture() {
  TestBed.configureTestingModule({ imports: [CompareSliderComponent] });
  const fixture = TestBed.createComponent(CompareSliderComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

describe("the comparison wipe", () => {
  it("is operable from the keyboard, not by dragging alone", async () => {
    const fixture = await sliderFixture();

    const control = wipeControl(fixture);

    // A range carries arrow keys, Home and End without anything added.
    expect(control.type).toBe("range");
    expect(control.disabled).toBe(false);
  });

  it("says what it does, rather than being an unnamed handle", async () => {
    const fixture = await sliderFixture();

    expect(wipeControl(fixture).getAttribute("aria-label")).toBeTruthy();
  });

  it("announces its position as a proportion", async () => {
    const fixture = await sliderFixture();
    const control = wipeControl(fixture);

    expect(control.min).toBe("0");
    expect(control.max).toBe("100");
    expect(control.value).toBe("50");
  });

  it("moves the wipe when the control is moved", async () => {
    const fixture = await sliderFixture();
    const control = wipeControl(fixture);

    control.value = "75";
    control.dispatchEvent(new Event("input"));
    fixture.detectChanges();

    expect(fixture.componentInstance.wipePercent()).toBe(75);
  });

  it("starts each page from the middle", async () => {
    const fixture = await sliderFixture();
    fixture.componentInstance.wipePercent.set(90);

    fixture.componentRef.setInput("resetToken", 2);
    fixture.detectChanges();

    expect(fixture.componentInstance.wipePercent()).toBe(50);
  });

  it("keeps the handle where the wipe is", async () => {
    const fixture = await sliderFixture();
    fixture.componentInstance.wipePercent.set(25);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const handle = host.querySelector<HTMLElement>('[aria-hidden="true"]');
    expect(handle?.style.left).toBe("25%");
  });

  it("hides the decorative handle from assistive technology", async () => {
    // The range is the control; a second thing announcing itself beside it
    // would be one control too many (§1A.2 — bad ARIA is worse than none).
    const fixture = await sliderFixture();

    const host = fixture.nativeElement as HTMLElement;
    const handle = host.querySelector<HTMLElement>(".w-0\\.5");
    expect(handle?.getAttribute("aria-hidden")).toBe("true");
  });
});
