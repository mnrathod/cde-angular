/**
 * The three panels the sidebar used to hold inline.
 *
 * <p>Two behaviours worth guarding, both about not losing information when
 * something is malformed: a corrupt shape must not empty the annotation list,
 * and an uncalibrated document must say so rather than showing numbers that
 * look like measurements.
 */
import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";

import { Annotation } from "../../../core/models";
import { ViewerStateService } from "../../../../viewer-core/viewer-state.service";
import { AnnotationsPanelComponent } from "./annotations-panel.component";
import { DocumentSearchPanelComponent } from "./document-search-panel.component";
import { MeasurementsPanelComponent } from "./measurements-panel.component";

/** An annotation carrying the given stored shape. */
function annotation(shapeData: string): Annotation {
  return { id: 1, shapeData } as unknown as Annotation;
}

describe("sidebar panels", () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ViewerStateService,
      ],
    }),
  );

  describe("annotations", () => {
    let fixture: ReturnType<typeof TestBed.createComponent<AnnotationsPanelComponent>>;
    let panel: AnnotationsPanelComponent;

    beforeEach(() => {
      fixture = TestBed.createComponent(AnnotationsPanelComponent);
      panel = fixture.componentInstance;
    });

    /** Renders the current state and returns the visible text. */
    function render(): string {
      fixture.detectChanges();
      return fixture.nativeElement.textContent ?? "";
    }

    it("teaches rather than apologises with nothing on the document", () => {
      expect(render()).toContain("No annotations yet");
    });

    it("keeps unsaved markup separate from what has been saved", () => {
      // Losing uncommitted work and losing a saved record are different
      // things, and one list would make them look the same.
      panel.state.dirty.set(true);
      panel.state.shapes.set([{ id: "s1", tool: "rect", pageNumber: 1 }] as never);

      expect(render()).not.toContain("No annotations yet");
    });

    it("lists a saved annotation with its author", () => {
      panel.state.annotations.set([
        {
          id: 1,
          authorName: "A Reviewer",
          pageNumber: 3,
          comment: "Check this dimension",
          shapeData: '{"color":"#ff0000"}',
          type: "RECTANGLE",
          status: "OPEN",
        },
      ] as never);

      const text = render();

      expect(text).toContain("A Reviewer");
      expect(text).toContain("Check this dimension");
    });

    it("takes the colour from the shape the annotation stores", () => {
      // Read back out of the shape rather than held separately: the shape is
      // what the viewer draws, and a second copy could disagree with it.
      expect(panel.colourOf(annotation('{"color":"#ff0000"}'))).toBe("#ff0000");
    });

    it("falls back when the stored shape names no colour", () => {
      expect(panel.colourOf(annotation('{"tool":"rect"}'))).toMatch(/^#/);
    });

    it("survives a shape it cannot read at all", () => {
      // One corrupt record must not throw and empty the whole list.
      expect(() => panel.colourOf(annotation("not json"))).not.toThrow();
      expect(panel.colourOf(annotation("not json"))).toMatch(/^#/);
    });
  });

  describe("measurements", () => {
    let fixture: ReturnType<typeof TestBed.createComponent<MeasurementsPanelComponent>>;
    let panel: MeasurementsPanelComponent;

    beforeEach(() => {
      fixture = TestBed.createComponent(MeasurementsPanelComponent);
      panel = fixture.componentInstance;
    });

    function render(): string {
      fixture.detectChanges();
      return fixture.nativeElement.textContent ?? "";
    }

    it("warns that readings are in pixels until a scale is set", () => {
      // The reason the warning matters: the numbers are already on screen and
      // look like measurements.
      const text = render();

      expect(text).toContain("uncalibrated");
      expect(text).toContain("pixels");
    });

    it("stops warning once a scale has been set", () => {
      panel.state.setScale({ unitsPerPixel: 0.01, unit: "m" });

      expect(render()).not.toContain("Results are in pixels");
    });

    it("lists a measurement with its reading and its page", () => {
      panel.state.addMeasurement({
        id: "m1",
        value: "4.20 m",
        kind: "Length",
        detail: "2 points",
        page: 3,
      } as never);

      const text = render();

      expect(text).toContain("4.20 m");
      expect(text).toContain("3");
    });

    it("says what one pixel is worth, in the unit it was calibrated in", () => {
      panel.state.setScale({ unitsPerPixel: 0.00423, unit: "m" });

      const label = panel.calibratedScale();

      expect(label).toContain("0.00423");
      expect(label).toContain("m");
    });

    it("rounds the ratio before a translator ever sees it", () => {
      // So nobody has to reason about decimal places in a message.
      panel.state.setScale({ unitsPerPixel: 1 / 3, unit: "m" });

      expect(panel.calibratedScale()).toContain("0.33333");
    });

    it("says it is uncalibrated rather than showing a number", () => {
      // A list of numbers with no units looks like an answer.
      expect(panel.uncalibratedLabel).toMatch(/\p{Letter}/u);
    });
  });

  describe("search", () => {
    let fixture: ReturnType<typeof TestBed.createComponent<DocumentSearchPanelComponent>>;
    let panel: DocumentSearchPanelComponent;

    beforeEach(() => {
      fixture = TestBed.createComponent(DocumentSearchPanelComponent);
      panel = fixture.componentInstance;
    });

    it("offers every hit as a button", () => {
      // Keyboard users search more than most, and a result list that cannot
      // be reached by Tab makes search itself unusable.
      panel.state.searchResults.set([
        { pageIndex: 2, matchIndex: 0, text: "wall type A" },
        { pageIndex: 5, matchIndex: 1, text: "wall type B" },
      ] as never);
      fixture.detectChanges();

      const hits = fixture.nativeElement.querySelectorAll("button");
      expect(hits.length).toBeGreaterThanOrEqual(2);
    });

    it("counts the matches it found", () => {
      panel.state.searchResults.set([
        { pageIndex: 2, matchIndex: 0, text: "wall" },
      ] as never);
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain("1 match");
    });

    it("brackets a PDF match, which is cut out of a longer line", () => {
      const snippet = panel.snippetOf({
        pageIndex: 2,
        matchIndex: 0,
        text: "wall type A",
      } as never);

      expect(snippet).toBe("…wall type A…");
    });

    it("leaves a drawing match whole, because it is a whole label", () => {
      // Bracketing it would suggest text that is not there.
      const snippet = panel.snippetOf({
        pageIndex: 1,
        matchIndex: 0,
        text: "GRID A",
        item: { x: 1, y: 2 },
      } as never);

      expect(snippet).toBe("GRID A");
    });

    it("marks a drawing hit in place rather than turning a page", () => {
      // A drawing has one sheet; there is no page to go to.
      const pages: number[] = [];
      panel.pageRequested.subscribe((page) => pages.push(page));

      panel.goToSearchResult({
        pageIndex: 1,
        matchIndex: 3,
        text: "GRID A",
        item: { x: 10, y: 20 },
      } as never);

      expect(pages).toEqual([]);
      expect(panel.state.searchFocus()).toEqual({ x: 10, y: 20 });
    });

    it("turns to the page a PDF hit is on", () => {
      const pages: number[] = [];
      panel.pageRequested.subscribe((page) => pages.push(page));

      panel.goToSearchResult({
        pageIndex: 4,
        matchIndex: 1,
        text: "wall",
      } as never);

      expect(pages).toEqual([4]);
    });
  });
});
