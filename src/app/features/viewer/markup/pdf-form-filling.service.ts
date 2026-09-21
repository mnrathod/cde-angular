/**
 * The two requests the form panel makes, and what it says about them.
 *
 * <p>Third of this shape, after `DocumentOperationsService` and
 * `PageOperationsService` — a request, a flag saying it is in flight, and a
 * sentence to show if it fails. None of that is about laying out a form
 * (§3.3: components render and dispatch).
 *
 * <p>Provided per viewer, alongside `ViewerStateService`, because the
 * in-flight flag belongs to one open document.
 */
import { Injectable, inject, signal } from "@angular/core";

import { problemMessage } from "../../../core/handlers/problem-detail";
import {
  PdfFormField, PdfFormService,
} from "../../../core/services/pdf-form.service";
import { ProcessingResult } from "../../../core/services/document-version.service";

@Injectable()
export class PdfFormFillingService {
  private formService = inject(PdfFormService);

  readonly loading = signal(true);
  readonly error = signal("");
  readonly submitting = signal(false);
  readonly message = signal("");
  readonly messageIsError = signal(false);

  /** Reads the document's fillable fields; `onFields` runs only on success. */
  readFields(documentId: number, onFields: (fields: PdfFormField[]) => void): void {
    this.loading.set(true);
    this.error.set("");

    this.formService.getFields(documentId).subscribe({
      next: (response) => {
        this.loading.set(false);
        if (!response.success) {
          // The server's own sentence is an English diagnostic about the
          // file's internals ("no AcroForm found") — neither translated nor
          // actionable. What the reader needs is which of the two things
          // went wrong and what to do next (§1.4).
          this.error.set($localize`:Shown when a document's form fields could not be read, so it either has none or is damaged@@pdfForm.unreadable:This document's form fields could not be read. It may have none, or the file may be damaged — try re-uploading it.`);
          return;
        }
        // Push buttons carry no value to fill, so they would only add noise.
        onFields((response.fields || []).filter((field) => field.kind !== "button"));
      },
      error: (err: unknown) => {
        this.loading.set(false);
        this.error.set(this.reasonFor(
          err,
          $localize`:Shown when a PDF's form fields cannot be read@@pdfForm.readFailed:Could not read form fields from this document.`,
        ));
      },
    });
  }

  /** Writes the values into a new version; `onFilled` runs only on success. */
  fill(
    documentId: number,
    values: Record<string, string | boolean>,
    flatten: boolean,
    onFilled: (result: ProcessingResult) => void,
  ): void {
    if (this.submitting()) return;
    this.submitting.set(true);
    this.message.set("");

    this.formService.fillForm(documentId, values, flatten).subscribe({
      next: (result) => {
        this.submitting.set(false);
        this.messageIsError.set(false);
        const version = result.version;
        const summary = result.summary;
        this.message.set(
          $localize`:Confirms a filled form was saved, naming the new version@@pdfForm.saved:Saved as version ${version}:version: — ${summary}:summary:`,
        );
        onFilled(result);
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.messageIsError.set(true);
        this.message.set(this.reasonFor(
          err,
          $localize`:Fallback when filling a form fails without a reason@@pdfForm.fillFailed:Filling the form failed.`,
        ));
      },
    });
  }

  /**
   * Why a request failed.
   *
   * <p>503 is named specially because it is the one cause a reader can do
   * something about: the converter is a separate process (§5.13.10), so
   * "not running" is a problem with the deployment, not with the document.
   */
  private reasonFor(err: unknown, fallback: string): string {
    if ((err as { status?: number } | null)?.status === 503) {
      return $localize`:Shown when the backend document converter is unreachable@@pdfForm.converterDown:The document converter service is not running.`;
    }
    return problemMessage(err, fallback);
  }
}
