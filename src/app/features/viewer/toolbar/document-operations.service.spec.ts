/**
 * The operations the toolbar starts on the document itself.
 *
 * <p>All three of redaction, text recognition and flattening commit a new
 * version, which means what they do is what every later reader sees. None of
 * them had a test while they sat in the toolbar component.
 *
 * <p>The failure wording is the part most worth guarding. A converter that is
 * not running is by far the commonest cause, and "Redaction failed." sends
 * whoever reads it to look at the wrong thing.
 */
import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { of, throwError } from "rxjs";

import { Annotation } from "../../../core/models";
import { ProcessingResult } from "../../../core/services/document-version.service";
import { OcrService } from "../../../core/services/ocr.service";
import { RedactionService } from "../../../core/services/redaction.service";
import { AnnotationService } from "../../../core/services/viewer/annotation.service";
import { FlattenService } from "../../../core/services/viewer/flatten.service";
import { ViewerStateService } from "../../../../viewer-core/viewer-state.service";
import { DocumentOperationsService } from "./document-operations.service";

/** A committed result, as every one of these operations returns. */
const COMMITTED = { version: 4, summary: "2 regions removed" };

/** A shape, with only the fields these operations read. */
function shape(id = "s1") {
  return {
    id,
    tool: "rect" as const,
    pageNumber: 1,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    color: "#000",
    strokeWidth: 1,
    opacity: 1,
  };
}

/** A drawn redaction region. */
function region(id = "r1") {
  return { id, page: 1, x: 0, y: 0, width: 10, height: 10 };
}

describe("DocumentOperationsService", () => {
  let operations: DocumentOperationsService;
  let state: ViewerStateService;
  let redaction: RedactionService;
  let ocr: OcrService;
  let flatten: FlattenService;
  let annotations: AnnotationService;

  /** Answers every confirmation the same way. */
  const alwaysConfirm = () => true;
  const neverConfirm = () => false;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ViewerStateService,
        DocumentOperationsService,
      ],
    });
    operations = TestBed.inject(DocumentOperationsService);
    state = TestBed.inject(ViewerStateService);
    redaction = TestBed.inject(RedactionService);
    ocr = TestBed.inject(OcrService);
    flatten = TestBed.inject(FlattenService);
    annotations = TestBed.inject(AnnotationService);
    state.documentId.set(11);
  });

  /** Makes the open document a PDF, which the PDF-only operations require. */
  function openPdf(): void {
    state.viewerData.set({ type: "pdf" } as never);
  }

  describe("redaction", () => {
    it("does nothing when no regions were drawn", () => {
      const redact = vi.spyOn(redaction, "redact");

      operations.applyRedaction();

      expect(redact).not.toHaveBeenCalled();
    });

    it("commits the new version and clears the drawn regions", () => {
      // The regions have been burned out; leaving them on screen would
      // invite a second redaction of content that is already gone.
      vi.spyOn(redaction, "redact").mockReturnValue(of(COMMITTED as unknown as ProcessingResult));
      state.redactionRegions.set([region()] as never);

      operations.applyRedaction();

      expect(state.redactionRegions()).toEqual([]);
      expect(operations.redacting()).toBe(false);
    });

    it("names the converter when the converter is what is down", () => {
      // 503 from this endpoint means the sidecar is not running. "Redaction
      // failed." sends whoever reads it to look at the wrong thing.
      vi.spyOn(redaction, "redact").mockReturnValue(
        throwError(() => ({ status: 503 })),
      );
      state.redactionRegions.set([region()] as never);

      operations.applyRedaction();

      expect(state.processingMessage()).toContain("converter service");
    });

    it("keeps the regions when the redaction failed", () => {
      // Nothing was removed, so clearing them would lose the work of
      // drawing them and suggest it had been done.
      vi.spyOn(redaction, "redact").mockReturnValue(
        throwError(() => ({ status: 500 })),
      );
      state.redactionRegions.set([region()] as never);

      operations.applyRedaction();

      expect(state.redactionRegions()).toHaveLength(1);
      expect(operations.redacting()).toBe(false);
    });

    it("refuses a second run while the first is in flight", () => {
      const redact = vi.spyOn(redaction, "redact").mockReturnValue(of(COMMITTED as unknown as ProcessingResult));
      state.redactionRegions.set([region()] as never);
      operations.redacting.set(true);

      operations.applyRedaction();

      expect(redact).not.toHaveBeenCalled();
    });
  });

  describe("text recognition", () => {
    it("refuses a document that is not a PDF", () => {
      // The button is disabled, but the keyboard shortcut is not.
      const makeSearchable = vi.spyOn(ocr, "makeSearchable");
      state.viewerData.set({ type: "cad" } as never);

      operations.runOcr();

      expect(makeSearchable).not.toHaveBeenCalled();
    });

    it("commits the version it comes back with", () => {
      vi.spyOn(ocr, "makeSearchable").mockReturnValue(of(COMMITTED as unknown as ProcessingResult));
      openPdf();

      operations.runOcr();

      expect(state.processingMessage()).toContain("v4");
      expect(operations.ocrRunning()).toBe(false);
    });

    it("names the converter when the converter is what is down", () => {
      vi.spyOn(ocr, "makeSearchable").mockReturnValue(
        throwError(() => ({ status: 503 })),
      );
      openPdf();

      operations.runOcr();

      expect(state.processingMessage()).toContain("converter service");
    });
  });

  describe("flattening", () => {
    it("says there is nothing to do rather than asking", () => {
      openPdf();
      const flattenToPdf = vi.spyOn(flatten, "flattenToPdf");

      operations.flattenToPage(alwaysConfirm);

      expect(flattenToPdf).not.toHaveBeenCalled();
      expect(state.processingMessage()).toContain("no annotations to flatten");
    });

    it("asks before it starts, and stops if the answer is no", () => {
      // Flattening cannot be undone — the shapes stop being annotations.
      const flattenToPdf = vi.spyOn(flatten, "flattenToPdf");
      openPdf();
      state.shapes.set([shape()] as never);

      operations.flattenToPage(neverConfirm);

      expect(flattenToPdf).not.toHaveBeenCalled();
    });

    it("says in the question how many annotations it will consume", () => {
      let asked = "";
      vi.spyOn(flatten, "flattenToPdf").mockReturnValue(of(COMMITTED as unknown as ProcessingResult));
      openPdf();
      state.shapes.set([shape("a"), shape("b"), shape("c")] as never);

      operations.flattenToPage((question) => {
        asked = question;
        return false;
      });

      expect(asked).toContain("3");
      expect(asked).toContain("no longer be editable");
    });

    it("drops the annotations now living in the page content", () => {
      // Without this they reload on the next open and render on top of the
      // flattened copy of themselves.
      vi.spyOn(flatten, "flattenToPdf").mockReturnValue(of(COMMITTED as unknown as ProcessingResult));
      const remove = vi
        .spyOn(annotations, "deleteAnnotation")
        .mockReturnValue(of(undefined));
      openPdf();
      state.shapes.set([shape()] as never);
      state.annotations.set([{ id: 7 }] as never);

      operations.flattenToPage(alwaysConfirm);

      expect(state.shapes()).toEqual([]);
      expect(state.annotations()).toEqual([]);
      expect(state.dirty()).toBe(false);
      expect(remove).toHaveBeenCalledWith(7);
    });

    it("keeps the markup when the flatten failed", () => {
      // The page was not changed, so throwing the shapes away would lose
      // work for nothing.
      vi.spyOn(flatten, "flattenToPdf").mockReturnValue(
        throwError(() => ({ status: 503 })),
      );
      openPdf();
      state.shapes.set([shape()] as never);

      operations.flattenToPage(alwaysConfirm);

      expect(state.shapes()).toHaveLength(1);
      expect(state.processingMessage()).toContain("converter service");
      expect(operations.flattening()).toBe(false);
    });
  });

  describe("annotations in and out", () => {
    it("adds imported annotations to what is already on the page", () => {
      // Replacing would silently discard whatever the user had drawn before
      // importing someone else's markup.
      const imported = [{ id: 21 }];
      vi.spyOn(annotations, "importXfdf").mockReturnValue(of(imported as unknown as Annotation[]));
      vi.spyOn(annotations, "annotationsToShapes").mockReturnValue([
        shape("imported"),
      ] as never);
      state.shapes.set([shape("mine")] as never);

      operations.importXfdf(new File(["x"], "markup.xfdf"));

      expect(state.shapes().map((each) => each.id)).toEqual([
        "mine",
        "imported",
      ]);
    });

    it("says so when the file could not be read", () => {
      // The previous behaviour logged to the console and told the user
      // nothing at all.
      vi.spyOn(annotations, "importXfdf").mockReturnValue(
        throwError(() => ({ status: 400 })),
      );

      operations.importXfdf(new File(["x"], "markup.xfdf"));

      expect(state.processingMessage()).toContain("annotation file");
    });
  });
});
