/**
 * Finding what a redaction would destroy, and then destroying it.
 *
 * <p>Out of the panel because none of it is rendering, and because the
 * preview is the load-bearing part of this feature: redaction is the one
 * operation whose result cannot be recovered from inside the file, so the
 * matches are found, shown and counted before anything is touched.
 */
import { Injectable, computed, inject, signal } from "@angular/core";

import {
  RedactionService, TextMatch, TextSearch,
} from "../../../core/services/redaction.service";
import { ViewerStateService } from "../../../../viewer-core/viewer-state.service";
import { problemMessage } from "../../../core/handlers/problem-detail";

@Injectable()
export class RedactionSearchService {
  private redaction = inject(RedactionService);
  private state = inject(ViewerStateService);

  readonly matches = signal<readonly TextMatch[]>([]);
  readonly searching = signal(false);
  readonly redacting = signal(false);
  readonly message = signal("");
  readonly messageIsError = signal(false);

  readonly busy = computed(() => this.searching() || this.redacting());

  /** Redacting all requires a previewed, non-empty result. */
  readonly canRedactMatches = computed(() => this.matches().length > 0);

  /** Any change to the search invalidates the preview, so it cannot go stale. */
  forget(): void {
    this.matches.set([]);
    this.message.set("");
  }

  preview(search: TextSearch): void {
    this.searching.set(true);
    this.message.set("");

    this.redaction.findText(this.state.documentId(), search).subscribe({
      next: (result) => {
        this.searching.set(false);
        if (!result.success) {
          // The server's own `error` string used to reach the screen — English
          // prose from the service layer, neither translated nor actionable.
          this.report(this.searchFailedText(), true);
          return;
        }
        this.matches.set(result.matches ?? []);
        if (!result.matchCount) this.report(this.nothingFoundText(result.pagesWithoutText), false);
      },
      error: (err: unknown) => {
        this.searching.set(false);
        this.report(this.reasonFor(err, this.searchFailedText()), true);
      },
    });
  }

  redactMatches(search: TextSearch): void {
    if (!this.canRedactMatches()) return;
    this.redacting.set(true);

    this.redaction.redactMatching(this.state.documentId(), search).subscribe({
      next: (result) => {
        this.redacting.set(false);
        this.matches.set([]);
        this.state.applyVersionCommit(result.version, result.summary);
        this.report(result.summary, false);
      },
      error: (err: unknown) => {
        this.redacting.set(false);
        this.report(
          this.reasonFor(
            err,
            $localize`:Fallback when redaction fails without a reason@@redaction.failed:Redaction failed.`,
          ),
          true,
        );
      },
    });
  }

  /** Said from two places, which is why it is a method rather than a field. */
  private searchFailedText(): string {
    return $localize`:Shown when the document cannot be searched at all@@redaction.searchFailed:The document could not be searched.`;
  }

  private nothingFoundText(pagesWithoutText: number | undefined): string {
    return pagesWithoutText
      ? $localize`:Shown when a search finds nothing and the document has unsearchable scanned pages@@redaction.noMatchesNeedsOcr:No matches. Some pages have no text layer — run OCR to make them searchable.`
      : $localize`:Shown when a search finds nothing@@redaction.noMatches:No matches found.`;
  }

  private report(text: string, isError: boolean): void {
    this.message.set(text);
    this.messageIsError.set(isError);
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
      return $localize`:Shown when the backend conversion service is unreachable@@redaction.converterDown:The document conversion service is not running.`;
    }
    return problemMessage(err, fallback);
  }
}
