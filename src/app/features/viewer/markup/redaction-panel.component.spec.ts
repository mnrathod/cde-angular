/**
 * Redaction without a pointer, and with something announced.
 *
 * <p>Jumping to a found match was an `<li>` with a click handler — not
 * focusable, no role, so §1A.2's "never paper over a div with a click
 * handler" applied exactly and there was no keyboard route to a match at
 * all. The preset toggles showed their state only as a darker background,
 * which is colour as the sole carrier of meaning and nothing whatever to a
 * screen reader. And the count a preview found — the number a reader checks
 * before destroying content that cannot be recovered — appeared silently.
 */
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";

import { TextMatch } from "../../../core/services/redaction.service";
import { ViewerStateService } from "../../../../viewer-core/viewer-state.service";
import { RedactionPanelComponent } from "./redaction-panel.component";
import { RedactionSearchService } from "./redaction-search.service";

function match(page: number, text: string): TextMatch {
  return { page, text, pattern: "preset:email", x: 0, y: 0, width: 10, height: 4 };
}

describe("the redaction panel", () => {
  let fixture: ComponentFixture<RedactionPanelComponent>;
  let panel: RedactionPanelComponent;
  let state: ViewerStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [RedactionPanelComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), ViewerStateService],
    });
    fixture = TestBed.createComponent(RedactionPanelComponent);
    panel = fixture.componentInstance;
    state = TestBed.inject(ViewerStateService);
    fixture.detectChanges();
  });

  function host() {
    return fixture.nativeElement as HTMLElement;
  }

  /** The search state the panel renders, reached as the panel reaches it. */
  function search(): RedactionSearchService {
    return panel.search;
  }

  describe("the list of matches", () => {
    beforeEach(() => {
      search().matches.set([match(3, "someone@example.invalid")]);
      fixture.detectChanges();
    });

    it("makes each match a button, so it can be reached without a pointer", () => {
      const jump = Array.from(host().querySelectorAll("button"))
        .find((button) => (button.getAttribute("aria-label") ?? "").includes("example.invalid"));

      expect(jump).toBeDefined();
    });

    it("names the page each match is on, since the abbreviation is decorative", () => {
      const jump = Array.from(host().querySelectorAll("button"))
        .find((button) => (button.getAttribute("aria-label") ?? "").includes("example.invalid"));

      expect(jump!.getAttribute("aria-label")).toContain("3");
    });

    it("goes to the page when the match is pressed", () => {
      const navigate = vi.spyOn(state, "navigateTo");
      const jump = Array.from(host().querySelectorAll("button"))
        .find((button) => (button.getAttribute("aria-label") ?? "").includes("example.invalid"));

      jump!.click();

      expect(navigate).toHaveBeenCalledWith(3);
    });
  });

  describe("the preset toggles", () => {
    it("says whether each is on, rather than only colouring it", () => {
      const pressed = Array.from(host().querySelectorAll("button[aria-pressed]"));

      expect(pressed.length).toBeGreaterThan(0);
      expect(pressed.every((button) => button.getAttribute("aria-pressed") === "false")).toBe(true);
    });

    it("flips that state when one is switched on", () => {
      const first = host().querySelector<HTMLButtonElement>("button[aria-pressed]")!;

      first.click();
      fixture.detectChanges();

      expect(host().querySelector("button[aria-pressed]")!.getAttribute("aria-pressed"))
        .toBe("true");
    });

    it("forgets a preview when the search changes under it", () => {
      // A preview that outlived its search could be applied stale, against
      // content the reader never saw listed.
      search().matches.set([match(1, "someone@example.invalid")]);

      host().querySelector<HTMLButtonElement>("button[aria-pressed]")!.click();

      expect(search().matches()).toEqual([]);
    });
  });

  describe("what the panel announces", () => {
    it("announces the result of a preview rather than only showing it", () => {
      search().message.set("No matches found.");
      fixture.detectChanges();

      const region = host().querySelector('[role="status"]');
      expect(region?.getAttribute("aria-live")).toBe("polite");
      expect(region?.textContent).toContain("No matches found.");
    });
  });

  describe("the drawn regions", () => {
    it("names the region each remove control discards", () => {
      state.redactionRegions.set([
        { id: "a", page: 5, x: 1, y: 2, width: 30, height: 10 },
      ]);
      fixture.detectChanges();

      const remove = Array.from(host().querySelectorAll("button"))
        .map((button) => button.getAttribute("aria-label") ?? "")
        .filter((label) => /remove/i.test(label));

      expect(remove).toHaveLength(1);
      expect(remove[0]).toContain("5");
    });

    it("teaches when nothing has been drawn", () => {
      state.redactionRegions.set([]);
      fixture.detectChanges();

      expect(host().textContent).toContain("No regions drawn yet.");
    });
  });
});
