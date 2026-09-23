/**
 * Taking every page of a sibling document and putting it into this one.
 *
 * <p>Out of the panel because none of it is rendering: which siblings are
 * eligible, how many pages the donor has, and what to say when any of it
 * fails are all decisions, not markup (§3.3).
 */
import { Injectable, inject, signal } from "@angular/core";
import { switchMap } from "rxjs/operators";

import { Document } from "../../../core/models";
import { DocumentService } from "../../../core/services/document.service";
import { PageService } from "../../../core/services/page.service";
import { ViewerStateService } from "../../../../viewer-core/viewer-state.service";

/** Page operations exist for PDFs only. */
export function isPdf(candidate: Document): boolean {
  return (
    candidate.fileType?.toLowerCase().includes("pdf") ||
    candidate.fileName?.toLowerCase().endsWith(".pdf") ||
    false
  );
}

@Injectable()
export class PageInsertionService {
  private documents = inject(DocumentService);
  private pageService = inject(PageService);
  private state = inject(ViewerStateService);

  readonly candidates = signal<readonly Document[]>([]);
  readonly busy = signal(false);

  /**
   * The siblings in this project that pages could come from.
   *
   * <p>`switchMap` rather than a subscribe inside a subscribe: the second
   * request depends on the first, and nesting them buries the failure paths
   * two callbacks deep where they are easy to leave out.
   */
  loadCandidates(onFailure: (said: string) => void): void {
    const documentId = this.state.documentId();

    this.documents
      .getById(documentId)
      .pipe(switchMap((current) => this.documents.listByProject(current.projectId)))
      .subscribe({
        next: (documents) =>
          this.candidates.set(
            documents.filter((candidate) => candidate.id !== documentId && isPdf(candidate)),
          ),
        error: () =>
          onFailure(
            $localize`:Shown when the list of documents to insert from cannot be read@@pageOrganiser.listFailed:Could not list the documents in this project.`,
          ),
      });
  }

  /**
   * Inserts every page of the chosen document.
   *
   * <p>Asks the donor how many pages it has rather than assuming: the server
   * rejects an empty selection, and it is right to — "insert nothing" is
   * never what someone meant.
   */
  insertAllFrom(
    sourceDocumentId: number,
    insertPosition: number | undefined,
    outcome: { inserted: () => void; failed: (said: string) => void },
  ): void {
    if (this.busy()) return;
    this.busy.set(true);

    this.pageService.getPages(sourceDocumentId).subscribe({
      next: (info) => {
        if (!info.success || !info.pageCount) {
          this.busy.set(false);
          outcome.failed(
            $localize`:Shown when the chosen document turns out to be empty@@pageOrganiser.sourceEmpty:That document has no pages to insert.`,
          );
          return;
        }
        this.send(sourceDocumentId, info.pageCount, insertPosition, outcome);
      },
      error: () => {
        this.busy.set(false);
        outcome.failed(this.insertFailedText());
      },
    });
  }

  private send(
    sourceDocumentId: number,
    pageCount: number,
    insertPosition: number | undefined,
    outcome: { inserted: () => void; failed: (said: string) => void },
  ): void {
    const pages = Array.from({ length: pageCount }, (_unused, index) => index + 1);

    this.pageService
      .insert(this.state.documentId(), sourceDocumentId, pages, insertPosition)
      .subscribe({
        next: (result) => {
          this.busy.set(false);
          this.state.applyVersionCommit(result.version, result.summary);
          outcome.inserted();
        },
        error: (err: { status?: number }) => {
          this.busy.set(false);
          outcome.failed(
            err.status === 503 ? this.converterDownText() : this.insertFailedText(),
          );
        },
      });
  }

  private insertFailedText(): string {
    return $localize`:Fallback when inserting pages fails@@pageOrganiser.insertFailed:The pages could not be inserted.`;
  }

  private converterDownText(): string {
    return $localize`:Shown when the backend conversion service is unreachable@@pageOrganiser.converterDown:The document conversion service is not running.`;
  }
}
