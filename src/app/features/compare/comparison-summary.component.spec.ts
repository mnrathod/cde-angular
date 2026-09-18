/**
 * The written summary of a comparison.
 *
 * <p>The one place on this screen that reaches a third party, and the failure
 * that matters is a summary that could not be produced replacing the
 * comparison rather than sitting beside it.
 */
import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { of, throwError } from "rxjs";

import { CompareResult } from "../../core/models";
import {
  ComparisonReport,
  CompareService,
} from "../../core/services/compare.service";
import { ComparisonSummaryComponent } from "./comparison-summary.component";

const COMPARISON = {
  success: true,
  fileType: "PDF",
  overall: "changed",
  totalChanges: 1,
  added: 1,
  removed: 0,
  changes: [],
  doc1Name: "Rev A",
  doc2Name: "Rev B",
} as unknown as CompareResult;

describe("ComparisonSummaryComponent", () => {
  let fixture: ComponentFixture<ComparisonSummaryComponent>;
  let summary: ComparisonSummaryComponent;
  let service: CompareService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(ComparisonSummaryComponent);
    summary = fixture.componentInstance;
    service = TestBed.inject(CompareService);
  });

  /** Gives the component a comparison to summarise. */
  function givenComparison(): void {
    fixture.componentRef.setInput("result", COMPARISON);
    fixture.detectChanges();
  }

  it("has nothing to summarise before a comparison has run", () => {
    const report = vi.spyOn(service, "getComparisonReport");

    summary.generate();

    expect(report).not.toHaveBeenCalled();
  });

  it("shows the summary the server produced", () => {
    vi.spyOn(service, "getComparisonReport").mockReturnValue(
      of({ report: "## Summary\nTwo walls moved." } as ComparisonReport),
    );
    givenComparison();

    summary.generate();

    expect(summary.reportLines().length).toBeGreaterThan(0);
    expect(summary.aiLoading()).toBe(false);
  });

  it("says the comparison itself is unaffected when the summary fails", () => {
    // The changes are still on screen and still correct. A failure here must
    // not read as a failure of the comparison.
    vi.spyOn(service, "getComparisonReport").mockReturnValue(
      throwError(() => ({ status: 503 })),
    );
    givenComparison();

    summary.generate();

    expect(summary.aiText()).toContain("comparison itself is unaffected");
    expect(summary.aiLoading()).toBe(false);
  });

  it("refuses a second request while the first is in flight", () => {
    const report = vi
      .spyOn(service, "getComparisonReport")
      .mockReturnValue(of({ report: "x" } as ComparisonReport));
    givenComparison();
    summary.aiLoading.set(true);

    summary.generate();

    expect(report).not.toHaveBeenCalled();
  });

  it("offers to regenerate once there is a summary to replace", () => {
    // Two whole messages rather than a prefix stuck on a noun: the verb and
    // the noun agree differently in other languages.
    const before = summary.actionLabel();
    summary.aiText.set("An existing summary");

    expect(summary.actionLabel()).not.toBe(before);
  });

  it("forgets a summary written about a different pair", () => {
    // It describes documents that are no longer on screen, and leaving it
    // there reads as a summary of the new comparison.
    summary.aiText.set("An earlier summary");

    summary.forget();

    expect(summary.aiText()).toBe("");
  });
});
