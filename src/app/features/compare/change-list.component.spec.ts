/**
 * What the comparison found.
 *
 * <p>The grouping is what the whole list is rendered from, and it has to cope
 * with a change the server sent without a category — dropping one would lose
 * a real difference between two documents, which is the one thing this screen
 * exists to show.
 */
import { ComponentFixture, TestBed } from "@angular/core/testing";

import { CompareResult } from "../../core/models";
import { ChangeListComponent } from "./change-list.component";

function comparison(overrides: Partial<CompareResult> = {}): CompareResult {
  return {
    success: true,
    fileType: "PDF",
    overall: "changed",
    totalChanges: 0,
    added: 0,
    removed: 0,
    changes: [],
    doc1Name: "Site plan Rev A",
    doc2Name: "Site plan Rev B",
    ...overrides,
  } as CompareResult;
}

function change(category: string) {
  return {
    category,
    severity: "low",
    type: "modified",
    description: "A line moved",
  } as never;
}

describe("ChangeListComponent", () => {
  let fixture: ComponentFixture<ChangeListComponent>;
  let list: ChangeListComponent;

  beforeEach(() => {
    fixture = TestBed.createComponent(ChangeListComponent);
    list = fixture.componentInstance;
  });

  /** Renders the given comparison and returns the visible text. */
  function render(result: CompareResult | null): string {
    fixture.componentRef.setInput("result", result);
    fixture.detectChanges();
    return fixture.nativeElement.textContent ?? "";
  }

  describe("grouping", () => {
    it("has nothing to group before a comparison has run", () => {
      expect(list.groupedChanges()).toEqual([]);
    });

    it("puts changes of the same category together", () => {
      fixture.componentRef.setInput(
        "result",
        comparison({
          changes: [change("GEOMETRY"), change("TEXT"), change("GEOMETRY")],
        }),
      );

      const groups = list.groupedChanges();

      expect(groups.map((group) => group.category).sort()).toEqual([
        "GEOMETRY",
        "TEXT",
      ]);
      expect(
        groups.find((group) => group.category === "GEOMETRY")?.items,
      ).toHaveLength(2);
    });

    it("gives a change with no category somewhere to go", () => {
      fixture.componentRef.setInput(
        "result",
        comparison({ changes: [change("")] }),
      );

      expect(list.groupedChanges()).toHaveLength(1);
    });

    it("keeps the categories in the order the server sent them", () => {
      // Stable across renders, so a list does not reshuffle under the reader.
      fixture.componentRef.setInput(
        "result",
        comparison({ changes: [change("TEXT"), change("GEOMETRY")] }),
      );

      expect(list.groupedChanges().map((group) => group.category)).toEqual([
        "TEXT",
        "GEOMETRY",
      ]);
    });
  });

  describe("what it shows", () => {
    it("teaches rather than apologises before anything is chosen", () => {
      expect(render(null)).toContain("Select two");
    });

    it("says when the two documents match", () => {
      // Lowercase, which is what the converter sends (`'identical' if not
      // changes`). The banner compares against that exact value.
      expect(render(comparison({ overall: "identical" }))).toContain(
        "Files are identical",
      );
    });

    it("counts the changes it found", () => {
      const text = render(
        comparison({
          totalChanges: 2,
          added: 1,
          removed: 1,
          changes: [change("GEOMETRY"), change("TEXT")],
        }),
      );

      expect(text).toContain("Changes detected");
      expect(text).toContain("GEOMETRY");
      expect(text).toContain("TEXT");
    });

    it("names both documents and the type they share", () => {
      const text = render(comparison());

      expect(text).toContain("Site plan Rev A");
      expect(text).toContain("Site plan Rev B");
      expect(text).toContain("PDF");
    });

    it("passes on a warning the server attached to the result", () => {
      // A comparison can succeed and still be partial — a page that would not
      // render, say — and the reader has to know before trusting it.
      const text = render(
        comparison({ warning: "Page 4 could not be rendered." }),
      );

      expect(text).toContain("Page 4 could not be rendered.");
    });
  });
});
