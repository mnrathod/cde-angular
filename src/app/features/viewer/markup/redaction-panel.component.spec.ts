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

/**
 * What the panel will and will not let the reader destroy.
 *
 * <p>Redaction is the one operation in the product whose result cannot be
 * recovered from inside the resulting file. Everything else commits a version
 * that can be restored; this destroys content. So the guards are the feature,
 * and each of them fails silently if it goes wrong: a disabled button that
 * should be enabled looks like a product that cannot do the thing, and an
 * enabled one that should be disabled destroys content on a request that had
 * nothing in it.
 */
describe("what the redaction panel will act on", () => {
  let fixture: ComponentFixture<RedactionPanelComponent>;
  let panel: RedactionPanelComponent;
  let asked: string[];

  beforeEach(() => {
    asked = [];
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [RedactionPanelComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), ViewerStateService],
    });
    fixture = TestBed.createComponent(RedactionPanelComponent);
    panel = fixture.componentInstance;
    fixture.detectChanges();
    vi.stubGlobal("confirm", (question: string) => {
      asked.push(question);
      return true;
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  function previewButton(): HTMLButtonElement {
    return Array.from(
      fixture.nativeElement.querySelectorAll("button") as NodeListOf<HTMLButtonElement>,
    ).find((button) => /Preview|Searching/.test(button.textContent ?? ""))!;
  }

  describe("whether there is anything to search for", () => {
    it("there is not, on a panel nobody has touched", () => {
      expect(panel.hasSearch()).toBe(false);
      expect(previewButton().disabled).toBe(true);
    });

    it("a typed word is something to search for", () => {
      panel.term = "Okonkwo";

      expect(panel.hasSearch()).toBe(true);
    });

    it("a word of nothing but spaces is not", () => {
      // Searching for "   " matches the gaps between every word on the page,
      // which is a preview the reader cannot read and a redaction that destroys
      // the document.
      panel.term = "   ";

      expect(panel.hasSearch()).toBe(false);
    });

    it("a chosen preset is something to search for, with no word typed", () => {
      // The presets are the common case — emails, phone numbers — and requiring
      // a word alongside one would make them useless.
      panel.togglePreset("email");

      expect(panel.hasSearch()).toBe(true);
    });

    it("a preset switched on and back off leaves nothing to search for", () => {
      panel.togglePreset("email");
      panel.togglePreset("email");

      expect(panel.hasSearch()).toBe(false);
      expect(panel.isPresetOn("email")).toBe(false);
    });

    it("several presets can be on at once", () => {
      // A document usually carries more than one kind of personal identifier,
      // and making them exclusive would mean three passes over it.
      panel.togglePreset("email");
      panel.togglePreset("phone");

      expect(panel.isPresetOn("email")).toBe(true);
      expect(panel.isPresetOn("phone")).toBe(true);
    });

    it("previewing does nothing when there is nothing to search for", () => {
      // The button is disabled, and this is the other half: a keyboard or script
      // path that reached the method anyway must not send an empty search, which
      // the server would answer with every match on the page.
      const preview = vi.spyOn(panel.search, "preview");

      panel.preview();

      expect(preview).not.toHaveBeenCalled();
    });
  });

  describe("what a search is sent as", () => {
    it("carries the typed word, trimmed", () => {
      const preview = vi.spyOn(panel.search, "preview").mockImplementation(() => undefined);
      panel.term = "  Okonkwo  ";

      panel.preview();

      expect(preview.mock.calls[0]![0]).toMatchObject({ terms: ["Okonkwo"] });
    });

    it("carries no term at all when only presets were chosen", () => {
      // An empty string in the term list is a term that matches everything.
      const preview = vi.spyOn(panel.search, "preview").mockImplementation(() => undefined);
      panel.togglePreset("email");

      panel.preview();

      expect(preview.mock.calls[0]![0]).toMatchObject({ terms: [], presets: ["email"] });
    });

    it("carries the case and whole-word choices", () => {
      // Both change what is destroyed. "smith" whole-word-off also takes
      // "Smithson", and a reader who ticked the box expects it not to.
      const preview = vi.spyOn(panel.search, "preview").mockImplementation(() => undefined);
      panel.term = "smith";
      panel.matchCase = true;
      panel.wholeWord = true;

      panel.preview();

      expect(preview.mock.calls[0]![0]).toMatchObject({ matchCase: true, wholeWord: true });
    });
  });

  describe("forgetting a stale preview", () => {
    it("a preview is dropped when a preset changes under it", () => {
      // The count on screen is what the reader checks before destroying content.
      // Leaving yesterday's count beside today's search is how somebody confirms
      // the wrong number.
      const forget = vi.spyOn(panel.search, "forget");

      panel.togglePreset("email");

      expect(forget).toHaveBeenCalled();
    });
  });

  describe("destroying the matches", () => {
    it("does nothing when a preview found none", () => {
      // "Redact all" with nothing found would ask the reader to confirm
      // destroying zero things, and then commit a version that changed nothing.
      const redact = vi.spyOn(panel.search, "redactMatches");

      panel.redactMatches();

      expect(redact).not.toHaveBeenCalled();
      expect(asked).toEqual([]);
    });

    it("asks before destroying anything", () => {
      panel.search.matches.set([match(1, "a@b.test")]);
      vi.spyOn(panel.search, "redactMatches").mockImplementation(() => undefined);

      panel.redactMatches();

      expect(asked).toHaveLength(1);
    });

    it("says how many it will destroy", () => {
      // The number is the whole decision. "Redact all matches?" on a document
      // where the preview found four hundred is not a question anyone can answer.
      panel.search.matches.set([match(1, "a@b.test"), match(2, "c@d.test")]);
      vi.spyOn(panel.search, "redactMatches").mockImplementation(() => undefined);

      panel.redactMatches();

      expect(asked[0]).toContain("2");
    });

    it("says that it cannot be undone, and that the history survives", () => {
      // Both halves matter. Without the first the reader does not know this is
      // different from every other operation; without the second they reasonably
      // refuse, believing the original is about to be lost.
      panel.search.matches.set([match(1, "a@b.test")]);
      vi.spyOn(panel.search, "redactMatches").mockImplementation(() => undefined);

      panel.redactMatches();

      expect(asked[0]!.toLowerCase()).toContain("cannot be recovered");
      expect(asked[0]!.toLowerCase()).toContain("history");
    });

    it("destroys nothing when the reader says no", () => {
      vi.unstubAllGlobals();
      vi.stubGlobal("confirm", () => false);
      panel.search.matches.set([match(1, "a@b.test")]);
      const redact = vi.spyOn(panel.search, "redactMatches");

      panel.redactMatches();

      expect(redact).not.toHaveBeenCalled();
    });

    it("sends the same search the preview ran, not a fresh one", () => {
      // If the two could differ, the reader would be confirming a count from one
      // search and destroying the results of another.
      const redact = vi.spyOn(panel.search, "redactMatches").mockImplementation(() => undefined);
      const preview = vi.spyOn(panel.search, "preview").mockImplementation(() => undefined);
      panel.term = "Okonkwo";
      panel.matchCase = true;
      panel.preview();
      panel.search.matches.set([match(1, "Okonkwo")]);

      panel.redactMatches();

      expect(redact.mock.calls[0]![0]).toEqual(preview.mock.calls[0]![0]);
    });
  });

  describe("the warning above the controls", () => {
    it("says what redaction does before anything is chosen", () => {
      // §1.1: the panel teaches rather than waiting for the confirmation to
      // break the news.
      const text = (fixture.nativeElement as HTMLElement).textContent ?? "";

      expect(text).toContain("Permanently destroys");
      expect(text.toLowerCase()).toContain("history");
    });

    it("says it is for PDFs only, since that is why the tool may be disabled", () => {
      const text = (fixture.nativeElement as HTMLElement).textContent ?? "";

      expect(text).toContain("PDF");
    });
  });

  describe("the term box", () => {
    it("has a name, even though its label is visually hidden", () => {
      // sr-only rather than a placeholder: a placeholder is not an accessible
      // name and disappears as soon as anything is typed.
      const input = fixture.nativeElement.querySelector("#redaction-term") as HTMLInputElement;
      const label = fixture.nativeElement.querySelector(
        'label[for="redaction-term"]',
      ) as HTMLLabelElement | null;

      expect(input).not.toBeNull();
      expect(label).not.toBeNull();
      expect(label!.textContent!.trim().length).toBeGreaterThan(0);
    });
  });
});
