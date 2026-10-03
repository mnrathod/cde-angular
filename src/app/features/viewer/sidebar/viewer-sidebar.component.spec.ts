/**
 * The viewer's side panel: ten tabs, one visible at a time.
 *
 * <p>The tab strip is the interesting part, and it is interesting for
 * accessibility reasons. Each tab is an icon with a seven-character label under
 * it, so the label is doing three jobs at once — visible text, tooltip, and
 * accessible name. A tab whose label went missing would still look fine and
 * would announce as "button", which is why the assertions check every entry in
 * the table rather than the ones somebody remembered to add.
 *
 * <p>`aria-current` is the other half: which panel is open is carried by a
 * border colour and a background tint, and §1A.2 is explicit that colour is
 * never the sole carrier of meaning. Without the attribute a screen-reader user
 * cycling the strip has no way to tell which tab they are on.
 *
 * <p>Switching every tab in turn also renders every panel, which is deliberate:
 * a panel that throws on construction takes the whole sidebar with it, and that
 * is a failure the reader meets as a blank half-screen with no explanation.
 */
import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";

import { SidebarTab, ViewerStateService } from "../../../../viewer-core/viewer-state.service";
import { ViewerSidebarComponent } from "./viewer-sidebar.component";

describe("ViewerSidebarComponent", () => {
  let fixture: ComponentFixture<ViewerSidebarComponent>;
  let sidebar: ViewerSidebarComponent;
  let state: ViewerStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), ViewerStateService],
    });
    state = TestBed.inject(ViewerStateService);
    state.documentId.set(42);
    state.totalPages.set(20);
    fixture = TestBed.createComponent(ViewerSidebarComponent);
    sidebar = fixture.componentInstance;
    fixture.detectChanges();
  });

  function tabButtons(): HTMLButtonElement[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll(".grid button") as NodeListOf<HTMLButtonElement>,
    );
  }

  function tabFor(id: SidebarTab): HTMLButtonElement {
    const label = sidebar.tabs.find((tab) => tab.id === id)!.label;
    return tabButtons().find((button) => button.title === label)!;
  }

  describe("the tab strip", () => {
    it("offers every panel in the table", () => {
      // The strip is built from the table, so a panel added to one and not the
      // other is unreachable with no sign that it exists.
      expect(tabButtons()).toHaveLength(sidebar.tabs.length);
    });

    it("every tab is named, not left as a bare icon", () => {
      // §1A.2. An icon-only button announces as "button", so the label is the
      // accessible name as well as the visible text.
      for (const tab of sidebar.tabs) {
        expect(tab.label.trim()).not.toBe("");
        expect(tabFor(tab.id).title).toBe(tab.label);
      }
    });

    it("no two tabs share a name", () => {
      // Two panels announcing identically is two panels a screen-reader user
      // cannot choose between.
      const labels = sidebar.tabs.map((tab) => tab.label);

      expect(new Set(labels).size).toBe(labels.length);
    });

    it("no two tabs share an identifier", () => {
      // The id is what selects the panel. A duplicate would make one tab open
      // another's contents.
      const ids = sidebar.tabs.map((tab) => tab.id);

      expect(new Set(ids).size).toBe(ids.length);
    });

    it("every tab carries an icon", () => {
      for (const tab of sidebar.tabs) {
        expect(tab.icon.trim()).not.toBe("");
      }
    });

    it("every label is short enough for the cell it renders in", () => {
      // The cells are about seven characters wide and truncate past that. A
      // label that truncates is a label nobody can read, which costs the tab its
      // visible name even though the tooltip survives.
      for (const tab of sidebar.tabs) {
        expect(tab.label.length).toBeLessThanOrEqual(8);
      }
    });

    it("marks which panel is open for a screen reader, not only with a colour", () => {
      state.sidebarTab.set("threads");
      fixture.detectChanges();

      const marked = tabButtons().filter(
        (button) => button.getAttribute("aria-current") === "page",
      );

      expect(marked).toHaveLength(1);
      expect(marked[0]!.title).toBe(sidebar.tabs.find((tab) => tab.id === "threads")!.label);
    });

    it("marks exactly one, whichever panel is open", () => {
      for (const tab of sidebar.tabs) {
        state.sidebarTab.set(tab.id);
        fixture.detectChanges();

        const marked = tabButtons().filter(
          (button) => button.getAttribute("aria-current") === "page",
        );
        expect(marked).toHaveLength(1);
      }
    });
  });

  describe("choosing a panel", () => {
    it("opens the one that was pressed", () => {
      tabFor("versions").click();
      fixture.detectChanges();

      expect(state.sidebarTab()).toBe("versions");
    });

    for (const id of [
      "annotations",
      "threads",
      "signatures",
      "redact",
      "form",
      "measure",
      "thumbnails",
      "search",
      "outline",
      "versions",
    ] as const) {
      it(`renders the ${id} panel without failing`, () => {
        // A panel that throws on construction takes the sidebar with it, and the
        // reader meets that as a blank half-screen with no explanation. Opening
        // each in turn is the cheapest guard against that there is.
        state.sidebarTab.set(id);

        expect(() => fixture.detectChanges()).not.toThrow();
      });
    }

    it("shows one panel at a time", () => {
      // Two panels on screen at once in a 240px column is unreadable, and the
      // @if blocks are the only thing preventing it.
      state.sidebarTab.set("outline");
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelectorAll("app-version-history")).toHaveLength(0);
      expect(fixture.nativeElement.querySelectorAll("app-outline-panel")).toHaveLength(1);
    });

    it("tears the previous panel down when another is chosen", () => {
      // Keeping them mounted would leave the redaction panel listening for
      // drawn regions while the reader is reading version history.
      state.sidebarTab.set("outline");
      fixture.detectChanges();
      state.sidebarTab.set("versions");
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelectorAll("app-outline-panel")).toHaveLength(0);
    });
  });

  describe("going to a page from a panel", () => {
    it("moves the viewer there", () => {
      sidebar.goToPage(7);

      expect(state.currentPage()).toBe(7);
    });

    it("tells the shell too, so it can scroll the page into view", () => {
      // Setting the page signal changes which page is current; it does not move
      // the scroll position. The shell owns the DOM that has to move, so both
      // halves are needed and a test that checked only one would pass with the
      // reader left looking at the wrong page.
      const told: number[] = [];
      sidebar.pageSelected.subscribe((page) => told.push(page));

      sidebar.goToPage(7);

      expect(told).toEqual([7]);
    });

    it("does not navigate past the end of the document", () => {
      state.totalPages.set(3);

      sidebar.goToPage(99);

      expect(state.currentPage()).toBe(3);
    });
  });

  describe("asking for a search", () => {
    it("signals the shell rather than searching itself", () => {
      // The engine lives in the shell, which knows whether this is a PDF or a
      // converted drawing — two different searches. The sidebar only asks.
      const told: number[] = [];
      sidebar.pageSelected.subscribe((page) => told.push(page));

      sidebar.doSearch();

      expect(told).toEqual([-1]);
    });

    it("does not move the reader off their page while asking", () => {
      // -1 is a signal and not a page. Treating it as one would navigate to the
      // first page every time somebody searched.
      state.currentPage.set(4);

      sidebar.doSearch();

      expect(state.currentPage()).toBe(4);
    });
  });
});
