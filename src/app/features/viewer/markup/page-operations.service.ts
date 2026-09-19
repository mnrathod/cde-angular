/**
 * The two requests the page organiser makes, and what it says about them.
 *
 * <p>Out of the component because each one is a request, a flag saying it is
 * in flight, and a sentence to show if it fails — the same shape as
 * `DocumentOperationsService`, and none of it is about drawing a grid of
 * thumbnails (§3.3).
 *
 * <p>Provided per viewer, alongside ViewerStateService, because the
 * in-flight flag belongs to one open document.
 */
import { Injectable, inject, signal } from "@angular/core";

import { problemMessage } from "../../../core/handlers/problem-detail";
import { PageService } from "../../../core/services/page.service";
import { ViewerStateService } from "../../../../viewer-core/viewer-state.service";

/** One page's place in the pending layout, as the server wants it. */
export interface PagePlacement {
  page: number;
  rotate: number;
}

@Injectable()
export class PageOperationsService {
  private pageService = inject(PageService);
  private state = inject(ViewerStateService);

  readonly working = signal(false);
  readonly message = signal("");
  readonly messageIsError = signal(false);

  /**
   * Commits the pending layout.
   *
   * <p>`onApplied` runs only on success. The reload it triggers rebuilds the
   * draft from the new page count, so the caller does not reset it as well —
   * doing both would fight.
   */
  arrange(layout: readonly PagePlacement[], onApplied: () => void): void {
    if (this.working()) return;
    this.working.set(true);
    this.clearMessage();

    this.pageService.arrange(this.state.documentId(), [...layout]).subscribe({
      next: (result) => {
        this.working.set(false);
        onApplied();
        this.state.applyVersionCommit(result.version, result.summary);
      },
      error: (err: unknown) =>
        this.failed(
          err,
          $localize`:Fallback when applying page changes fails@@pageOrganiser.rearrangeFailed:The pages could not be rearranged.`,
        ),
    });
  }

  /** Copies the given source pages into a new document in the same project. */
  extract(pages: readonly number[], onExtracted: () => void): void {
    if (!pages.length || this.working()) return;
    this.working.set(true);
    this.clearMessage();

    this.pageService.extract(this.state.documentId(), [...pages]).subscribe({
      next: (result) => {
        this.working.set(false);
        onExtracted();
        const name = result.name;
        const pageCount = result.pageCount;
        this.report(
          $localize`:Confirms an extraction, naming the new document and its size@@pageOrganiser.extracted:Created "${name}:name:" with ${pageCount}:pageCount: page(s). It is in this project alongside the original.`,
          false,
        );
      },
      error: (err: unknown) =>
        this.failed(
          err,
          $localize`:Fallback when extracting pages fails@@pageOrganiser.extractFailed:The pages could not be extracted.`,
        ),
    });
  }

  /** Says something went wrong, in words the reader can act on. */
  report(text: string, isError: boolean): void {
    this.message.set(text);
    this.messageIsError.set(isError);
  }

  clearMessage(): void {
    this.message.set("");
  }

  private failed(err: unknown, fallback: string): void {
    this.working.set(false);
    this.report(this.reasonFor(err, fallback), true);
  }

  /**
   * Why an operation failed.
   *
   * <p>503 is named specially because it is the one cause a reader can do
   * something about — the converter sidecar is a separate process, and
   * "not running" is actionable where a generic failure is not.
   */
  private reasonFor(err: unknown, fallback: string): string {
    if ((err as { status?: number } | null)?.status === 503) {
      return $localize`:Shown when the backend conversion service is unreachable@@pageOrganiser.converterDown:The document conversion service is not running.`;
    }
    return problemMessage(err, fallback);
  }
}
