/**
 * The operations the toolbar starts on the document itself: redaction, text
 * recognition, flattening, and moving annotations in and out as XFDF.
 *
 * <p>These sat in the toolbar component, which made it a 660-line file whose
 * largest part was not a toolbar. They belong together and not there: each
 * one is a request, a flag saying it is in flight, and a sentence to show if
 * it fails, and none of that is about drawing a row of buttons (§3.3).
 *
 * <p>Three of them commit a new version of the document, which is why they
 * are grouped rather than left as separate services — they share the same
 * failure wording, the same in-flight handling, and the same rule that the
 * result becomes what every later reader sees.
 *
 * <p>Provided per viewer, alongside ViewerStateService, because the in-flight
 * flags belong to one open document.
 */
import { Injectable, inject, signal } from "@angular/core";

import { problemMessage } from "../../../core/handlers/problem-detail";
import { AnnotationService } from "../../../core/services/viewer/annotation.service";
import { FlattenService } from "../../../core/services/viewer/flatten.service";
import { OcrService } from "../../../core/services/ocr.service";
import { RedactionService } from "../../../core/services/redaction.service";
import { ViewerStateService } from "../../../../viewer-core/viewer-state.service";

/** The two sentences a failed operation may need. */
interface FailureWording {
  /** When the converter sidecar is unreachable, which is the usual cause. */
  whenConverterDown: string;
  /** Anything else the server did not explain itself. */
  otherwise: string;
}

@Injectable()
export class DocumentOperationsService {
  private state = inject(ViewerStateService);
  private annotations = inject(AnnotationService);
  private flattenService = inject(FlattenService);
  private redactionService = inject(RedactionService);
  private ocrService = inject(OcrService);

  // Signals, not plain fields: the toolbar is OnPush, so a bare field mutated
  // from an async HTTP callback never re-renders and the button stays stuck
  // on "Redacting" after the call has finished.
  readonly redacting = signal(false);
  readonly ocrRunning = signal(false);
  readonly flattening = signal(false);

  /** Whether the open document is one the PDF-only operations can act on. */
  isPdf(): boolean {
    return this.state.viewerData()?.type === "pdf";
  }

  /**
   * Burn the marked regions out of the document.
   *
   * <p>The result becomes the document's current version, so the removed
   * content is gone for every later reader and every later operation — not
   * just in a copy the person who ran it happens to hold.
   */
  applyRedaction(): void {
    const regions = this.state.redactionRegions();
    if (!regions.length || this.redacting()) return;

    this.redacting.set(true);
    this.redactionService.redact(this.state.documentId(), regions).subscribe({
      next: (result) => {
        this.redacting.set(false);
        this.state.clearRedactionRegions();
        this.state.applyVersionCommit(result.version, result.summary);
      },
      error: (err) => {
        this.redacting.set(false);
        this.report(err, {
          whenConverterDown: $localize`:Redaction failed because the backend converter is unreachable@@toolbar.redactionConverterDown:Redaction failed — the document converter service is not running.`,
          otherwise: $localize`:Fallback when redaction fails without a reason@@toolbar.redactionFailed:Redaction failed.`,
        });
      },
    });
  }

  /**
   * Turn a scanned PDF into a searchable one by adding an invisible text
   * layer, committed as a new version so the text is available to search,
   * selection and any later processing rather than living in a side copy.
   */
  runOcr(): void {
    if (!this.isPdf() || this.ocrRunning()) return;

    this.ocrRunning.set(true);
    this.ocrService.makeSearchable(this.state.documentId()).subscribe({
      next: (result) => {
        this.ocrRunning.set(false);
        this.state.applyVersionCommit(result.version, result.summary);
      },
      error: (err) => {
        this.ocrRunning.set(false);
        this.report(err, {
          whenConverterDown: $localize`:Text recognition failed because the backend converter is unreachable@@toolbar.ocrConverterDown:OCR failed — the document converter service is not running.`,
          otherwise: $localize`:Fallback when text recognition fails without a reason@@toolbar.ocrFailed:OCR failed.`,
        });
      },
    });
  }

  /**
   * Bake the markup into the page itself, server-side, and commit the result
   * as a new version.
   *
   * <p>Flattening is destructive by definition: once the shapes are page
   * content they are no longer editable annotations, so the annotation
   * records that produced them are removed to stop the overlay drawing a
   * second copy on top of the baked-in one. The pre-flatten file stays in the
   * version history, so the document itself can be restored.
   *
   * <p>`confirmWith` is passed in rather than calling `confirm` here, so the
   * decision to interrupt someone belongs to the interface and this stays
   * testable without stubbing a global.
   */
  flattenToPage(confirmWith: (question: string) => boolean): void {
    const shapes = this.state.shapes();
    if (!this.isPdf() || !shapes.length) {
      this.state.processingMessage.set(
        $localize`:Shown when flatten is used on a document with no markup@@toolbar.nothingToFlatten:There are no annotations to flatten.`,
      );
      return;
    }
    if (this.flattening()) return;

    const shapeCount = shapes.length;
    const question = $localize`:Confirmation before making markup a permanent part of the page@@toolbar.confirmFlattenQuestion:Flatten ${shapeCount}:count: annotation(s) into the page?`;
    const consequence = $localize`:Second paragraph of the flatten confirmation@@toolbar.confirmFlattenConsequence:They become permanent page content and will no longer be editable. The current version stays in the history and can be restored.`;
    if (!confirmWith(`${question}\n\n${consequence}`)) return;

    this.flattening.set(true);
    this.flattenService
      .flattenToPdf({
        documentId: this.state.documentId(),
        shapes,
        quality: "print",
      })
      .subscribe({
        next: (result) => {
          this.flattening.set(false);
          this.discardFlattenedAnnotations();
          this.state.applyVersionCommit(result.version, result.summary);
        },
        error: (err) => {
          this.flattening.set(false);
          this.report(err, {
            whenConverterDown: $localize`:Flattening failed because the backend converter is unreachable@@toolbar.flattenConverterDown:Flatten failed — the document converter service is not running.`,
            otherwise: $localize`:Fallback when flattening fails without a reason@@toolbar.flattenFailed:Flatten failed.`,
          });
        },
      });
  }

  /** Hands the document's annotations over in the interchange format. */
  exportXfdf(): void {
    const documentId = this.state.documentId();
    this.annotations
      .exportXfdf(documentId)
      .subscribe((blob) =>
        downloadBlob(blob, `annotations-doc-${documentId}.xfdf`),
      );
  }

  /** Takes annotations from another tool's XFDF export. */
  importXfdf(file: File): void {
    this.annotations.importXfdf(this.state.documentId(), file).subscribe({
      next: (imported) => {
        this.state.setAnnotationsSaved(imported);
        const shapes = this.annotations.annotationsToShapes(imported);
        this.state.shapes.update((all) => [...all, ...shapes]);
      },
      error: () =>
        this.state.processingMessage.set(
          $localize`:Fallback when reading an annotation file fails@@toolbar.importFailed:Could not read that annotation file.`,
        ),
    });
  }

  /**
   * Drops the annotations now living in the page content, locally and on the
   * server. Without this they reload on the next open and render on top of
   * the flattened copy of themselves.
   */
  private discardFlattenedAnnotations(): void {
    const saved = this.state.annotations();
    this.state.shapes.set([]);
    this.state.annotations.set([]);
    this.state.dirty.set(false);
    saved.forEach((annotation) =>
      this.annotations.deleteAnnotation(annotation.id).subscribe({
        error: () => {
          // The flatten already succeeded; a stale record is cosmetic.
        },
      }),
    );
  }

  /**
   * Turns a failed request into something a person can act on.
   *
   * <p>Two complete sentences rather than a noun interpolated into
   * "{action} failed." — a sentence assembled from an English noun and an
   * English verb cannot be translated, because neither the word order nor the
   * agreement carries over.
   */
  private report(
    err: { status?: number },
    wording: FailureWording,
  ): void {
    this.state.processingMessage.set(
      err.status === 503
        ? wording.whenConverterDown
        : problemMessage(err, wording.otherwise),
    );
  }
}

/** Hands a generated file to the browser's download machinery. */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
