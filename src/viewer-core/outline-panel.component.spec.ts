/**
 * The document's bookmarks.
 *
 * <p>pdf.js has always exposed the outline and nothing read it, so a
 * specification with a hundred sections offered no way to reach one except
 * scrolling. For a keyboard or screen-reader user that is not an inconvenience
 * — it is the only structural navigation a long PDF has.
 *
 * <p>Three behaviours carry weight here.
 *
 * <p>**A bookmark can point nowhere.** Destinations are resolved against the
 * page tree, and a PDF assembled from several sources — or one whose pages have
 * been rearranged by this application's own page organiser — will have some
 * that resolve to nothing. Such a row is `disabled` with a tooltip saying why,
 * rather than clickable and silently inert: a control that does nothing when
 * pressed teaches the reader to stop trusting the panel.
 *
 * <p>**A deep outline opens collapsed below the second level**, so a long
 * specification does not arrive as several hundred rows. That is a default, not
 * a restriction, and the expand control has to actually work — a collapse state
 * with no way out is worse than no collapsing.
 *
 * <p>**The outline is re-read when a new version replaces the document**,
 * because this application's own page manipulation moves and removes the pages
 * bookmarks point at. An outline left over from the previous version sends the
 * reader to the wrong page with every appearance of working.
 */
import { ComponentFixture, TestBed } from "@angular/core/testing";

import { OutlineEntry, OutlineService } from "./outline.service";
import { OutlinePanelComponent } from "./outline-panel.component";
import { ViewerStateService } from "./viewer-state.service";

function entry(
  title: string,
  page: number | null,
  depth: number,
  children: OutlineEntry[] = [],
): OutlineEntry {
  return { title, page, depth, children };
}

describe("OutlinePanelComponent", () => {
  let fixture: ComponentFixture<OutlinePanelComponent>;
  let panel: OutlinePanelComponent;
  let state: ViewerStateService;

  let outlineToReturn: OutlineEntry[];
  let outlineFails: boolean;
  let outlineReads: number;

  const outlineStub = {
    getOutline: async () => {
      outlineReads += 1;
      if (outlineFails) throw new Error("unreadable outline");
      return outlineToReturn;
    },
  };

  beforeEach(() => {
    outlineToReturn = [];
    outlineFails = false;
    outlineReads = 0;

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [ViewerStateService, { provide: OutlineService, useValue: outlineStub }],
    });
    state = TestBed.inject(ViewerStateService);
    fixture = TestBed.createComponent(OutlinePanelComponent);
    panel = fixture.componentInstance;
    fixture.detectChanges();
  });

  /** Opens a document whose outline is `entries`, and settles the read. */
  async function openWithOutline(entries: OutlineEntry[]): Promise<void> {
    outlineToReturn = entries;
    state.pdfDoc.set({ numPages: 200 });
    state.totalPages.set(200);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? "";
  }

  function rowButtons(): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll("button"));
  }

  function bookmarkTitled(title: string): HTMLButtonElement | undefined {
    return rowButtons().find((button) => button.textContent?.trim() === title);
  }

  describe("a document with no bookmarks", () => {
    it("teaches rather than showing an empty panel", async () => {
      // §1.1: an empty state says what the object is and why it is empty. A
      // blank panel reads as a panel that failed to load.
      await openWithOutline([]);

      expect(text()).toContain("no bookmarks");
    });

    it("says nothing about bookmarks before a document is open", () => {
      // Nothing has been read yet, so claiming there are none would be a guess.
      expect(panel.entries()).toEqual([]);
      expect(outlineReads).toBe(0);
    });
  });

  describe("listing the bookmarks", () => {
    it("names each one", async () => {
      await openWithOutline([entry("Introduction", 1, 0), entry("Foundations", 12, 0)]);

      expect(text()).toContain("Introduction");
      expect(text()).toContain("Foundations");
    });

    it("says which page each one goes to", async () => {
      // The page number is how a reader decides whether a bookmark is worth
      // following, and how they cite it to someone else.
      await openWithOutline([entry("Foundations", 12, 0)]);

      expect(text()).toContain("12");
    });

    it("indents by depth, so the structure is visible", async () => {
      await openWithOutline([
        entry("Part A", 1, 0, [entry("Section 1", 2, 1)]),
      ]);

      const indents = Array.from(
        fixture.nativeElement.querySelectorAll("[style*='padding-inline-start']"),
      ).map((element) => (element as HTMLElement).style.paddingInlineStart);

      expect(new Set(indents).size).toBeGreaterThan(1);
    });

    it("marks the bookmark for the page being read, not only by position", async () => {
      await openWithOutline([entry("Introduction", 1, 0), entry("Foundations", 12, 0)]);
      state.currentPage.set(12);
      fixture.detectChanges();

      expect(bookmarkTitled("Foundations")!.classList.toString()).toContain("font-medium");
      expect(bookmarkTitled("Introduction")!.classList.toString()).not.toContain("font-medium");
    });
  });

  describe("following a bookmark", () => {
    it("goes to its page", async () => {
      await openWithOutline([entry("Foundations", 12, 0)]);

      bookmarkTitled("Foundations")!.click();

      expect(state.currentPage()).toBe(12);
    });

    it("a bookmark that points nowhere cannot be pressed", async () => {
      // A clickable row that does nothing is worse than a disabled one: the
      // reader cannot tell a broken destination from a broken application.
      await openWithOutline([entry("Appendix C", null, 0)]);

      expect(bookmarkTitled("Appendix C")!.disabled).toBe(true);
    });

    it("and says why, rather than just being dead", async () => {
      // The disabled state teaches, which is §1.1's exception to hiding.
      await openWithOutline([entry("Appendix C", null, 0)]);

      expect(bookmarkTitled("Appendix C")!.title.toLowerCase()).toContain("nowhere");
    });

    it("a working bookmark says where it goes", async () => {
      await openWithOutline([entry("Foundations", 12, 0)]);

      expect(bookmarkTitled("Foundations")!.title).toContain("12");
    });

    it("shows no page number beside a bookmark that has none", async () => {
      // A blank where the number goes reads as page zero.
      await openWithOutline([entry("Appendix C", null, 0)]);

      expect(text()).not.toMatch(/Appendix C\s*0/);
    });

    it("does not move the reader when a broken bookmark is invoked directly", async () => {
      // The disabled attribute is the UI half. A keyboard or script path that
      // reached `go` anyway must not navigate to a page the bookmark does not
      // name.
      await openWithOutline([entry("Appendix C", null, 0)]);
      state.currentPage.set(5);

      panel.go(entry("Appendix C", null, 0));

      expect(state.currentPage()).toBe(5);
    });
  });

  describe("a deep outline", () => {
    const deep = (): OutlineEntry[] => [
      entry("Part A", 1, 0, [
        entry("Section 1", 2, 1, [entry("Clause 1.1", 3, 2)]),
        entry("Section 2", 9, 1, [entry("Clause 2.1", 10, 2)]),
      ]),
    ];

    it("opens with the deeper levels folded away", async () => {
      // A hundred-section specification arriving as several hundred rows is not
      // navigation, it is the scrolling the panel exists to replace.
      await openWithOutline(deep());

      expect(text()).toContain("Part A");
      expect(text()).toContain("Section 1");
      expect(text()).not.toContain("Clause 1.1");
    });

    it("the top two levels are open, so the panel is not a single row", async () => {
      await openWithOutline(deep());

      expect(text()).toContain("Section 2");
    });

    it("a folded entry can be opened", async () => {
      // Collapsing with no way out would be worse than not collapsing.
      await openWithOutline(deep());
      const expand = rowButtons().find((button) => button.textContent?.includes("▸"));

      expand!.click();
      fixture.detectChanges();

      expect(text()).toContain("Clause 1.1");
    });

    it("and folded again", async () => {
      await openWithOutline(deep());
      rowButtons().find((button) => button.textContent?.includes("▸"))!.click();
      fixture.detectChanges();

      rowButtons().find((button) => button.textContent?.includes("▾"))!.click();
      fixture.detectChanges();

      expect(text()).not.toContain("Clause 1.1");
    });

    it("opening one branch does not open its sibling", async () => {
      // The collapse key is the path through the tree. A key derived from the
      // title or the depth alone would make every branch at that level move
      // together.
      await openWithOutline(deep());

      rowButtons().find((button) => button.textContent?.includes("▸"))!.click();
      fixture.detectChanges();

      expect(text()).toContain("Clause 1.1");
      expect(text()).not.toContain("Clause 2.1");
    });

    it("a bookmark with no children offers no expand control", async () => {
      // An expand arrow on a leaf is a control that does nothing, which §1.1
      // excludes on its own.
      await openWithOutline([entry("Introduction", 1, 0)]);

      expect(rowButtons().some((button) => button.textContent?.includes("▸"))).toBe(false);
      expect(rowButtons().some((button) => button.textContent?.includes("▾"))).toBe(false);
    });

    it("the expand control says which way it will go", async () => {
      await openWithOutline(deep());

      const collapsedRow = rowButtons().find((button) => button.textContent?.includes("▸"));
      expect(collapsedRow!.title.toLowerCase()).toContain("expand");

      collapsedRow!.click();
      fixture.detectChanges();

      expect(
        rowButtons().find((button) => button.textContent?.includes("▾"))!.title.toLowerCase(),
      ).toContain("collapse");
    });
  });

  describe("when a new version replaces the document", () => {
    it("re-reads the outline", async () => {
      // This application's own page organiser moves and removes pages, so an
      // outline left over from the previous version sends the reader to the
      // wrong page with every appearance of working.
      await openWithOutline([entry("Introduction", 1, 0)]);
      expect(outlineReads).toBe(1);

      outlineToReturn = [entry("Introduction", 1, 0), entry("New section", 4, 0)];
      state.reloadToken.set(1);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(outlineReads).toBe(2);
      expect(text()).toContain("New section");
    });

    it("does not read anything while no document is open", async () => {
      state.reloadToken.set(1);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(outlineReads).toBe(0);
    });
  });

  describe("an outline that cannot be read", () => {
    it("shows the empty state rather than a failure", async () => {
      // An unreadable outline is not something a reader can act on, and the
      // document itself is fine. §8.2's graceful degradation: lose the panel,
      // not the page.
      outlineFails = true;
      state.pdfDoc.set({ numPages: 10 });
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(panel.entries()).toEqual([]);
      expect(text()).toContain("no bookmarks");
    });

    it("stops saying it is loading", async () => {
      // A spinner left spinning after a failure is the worst of both: no
      // content and no reason.
      outlineFails = true;
      state.pdfDoc.set({ numPages: 10 });
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(panel.loading()).toBe(false);
      expect(text()).not.toContain("Reading bookmarks");
    });
  });
});
