/**
 * Taking every page of another document in this project and putting it into
 * this one.
 *
 * <p>Offers only the siblings it could actually insert — the document itself
 * is excluded, and so is anything that is not a PDF, because the page
 * operations only exist for PDFs and offering one that will be refused is
 * worse than not offering it (§1.1).
 */
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  signal,
} from "@angular/core";

import { Document } from "../../../core/models";
import { DocumentService } from "../../../core/services/document.service";
import { PageService } from "../../../core/services/page.service";
import { ViewerStateService } from "../../../../viewer-core/viewer-state.service";

@Component({
  selector: "app-insert-pages-panel",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="p-2 border-b border-gray-200 bg-gray-50 flex-shrink-0">
      <div class="flex items-center justify-between mb-1">
        <span
          i18n="Heading over the list of documents to take pages from@@pageOrganiser.insertFromHeading"
          class="text-xs font-semibold text-gray-700"
          >Insert all pages from</span
        >
        <button
          (click)="closed.emit()"
          i18n-aria-label="@@pageOrganiser.closeInsertPicker"
          aria-label="Close"
          class="text-xs text-gray-500 hover:text-gray-800"
        >
          ✕
        </button>
      </div>
      @if (candidates().length === 0) {
        <p
          i18n="@@pageOrganiser.noInsertCandidates"
          class="text-xs text-gray-500 py-1"
        >
          No other PDF in this project to insert from.
        </p>
      }
      <ul class="max-h-32 overflow-y-auto">
        @for (candidate of candidates(); track candidate.id) {
          <li>
            <button
              (click)="insertFrom(candidate.id)"
              [disabled]="busy()"
              class="w-full text-start text-xs px-1.5 py-1 rounded hover:bg-white disabled:opacity-40 truncate"
            >
              {{ candidate.name }}
            </button>
          </li>
        }
      </ul>
      <p
        i18n="Says where inserted pages will land, e.g. 'Inserted at the end.'@@pageOrganiser.insertPosition"
        class="text-xs text-gray-400 mt-1"
      >
        Inserted {{ insertAtLabel() }}.
      </p>
    </div>
  `,
})
export class InsertPagesPanelComponent {
  /**
   * Where the pages land, one-based, or undefined for the end of the
   * document. Worked out by the draft, which knows what is selected.
   */
  insertPosition = input<number | undefined>(undefined);

  /** The panel should go away. */
  closed = output<void>();
  /** Something went wrong, in words the parent can put in its message strip. */
  failed = output<string>();
  /** Pages went in, and the document has a new version. */
  inserted = output<void>();

  private documents = inject(DocumentService);
  private pageService = inject(PageService);
  private state = inject(ViewerStateService);

  readonly candidates = signal<Document[]>([]);
  readonly busy = signal(false);

  constructor() {
    this.loadCandidates();
  }

  /** Where the pages will land, as a phrase completing "Inserted …". */
  insertAtLabel(): string {
    const position = this.insertPosition();
    return position === undefined
      ? $localize`:Completes "Inserted ..." when nothing is selected@@pageOrganiser.insertAtEnd:at the end`
      : $localize`:Completes "Inserted ..." with the page it lands before@@pageOrganiser.insertBeforePage:before page ${position}:position:`;
  }

  /**
   * Inserts every page of the chosen document.
   *
   * <p>Asks the donor how many pages it has rather than assuming: the server
   * rejects an empty selection, and it is right to — "insert nothing" is
   * never what someone meant.
   */
  insertFrom(sourceDocumentId: number): void {
    if (this.busy()) return;
    this.busy.set(true);

    this.pageService.getPages(sourceDocumentId).subscribe({
      next: (info) => {
        if (!info.success || !info.pageCount) {
          this.busy.set(false);
          this.failed.emit(
            $localize`:Shown when the chosen document turns out to be empty@@pageOrganiser.sourceEmpty:That document has no pages to insert.`,
          );
          return;
        }
        this.sendInsert(sourceDocumentId, info.pageCount);
      },
      error: () => {
        this.busy.set(false);
        this.failed.emit(this.insertFailedLabel());
      },
    });
  }

  private sendInsert(sourceDocumentId: number, pageCount: number): void {
    const pages = Array.from({ length: pageCount }, (_unused, i) => i + 1);
    this.pageService
      .insert(
        this.state.documentId(),
        sourceDocumentId,
        pages,
        this.insertPosition(),
      )
      .subscribe({
        next: (result) => {
          this.busy.set(false);
          this.state.applyVersionCommit(result.version, result.summary);
          this.inserted.emit();
          this.closed.emit();
        },
        error: (err: { status?: number }) => {
          this.busy.set(false);
          this.failed.emit(
            err.status === 503 ? converterDownLabel() : this.insertFailedLabel(),
          );
        },
      });
  }

  /** The siblings in this project that pages could come from. */
  private loadCandidates(): void {
    const documentId = this.state.documentId();
    this.documents.getById(documentId).subscribe({
      next: (current) =>
        this.documents.listByProject(current.projectId).subscribe({
          next: (documents) =>
            this.candidates.set(
              documents.filter(
                (candidate) => candidate.id !== documentId && isPdf(candidate),
              ),
            ),
          error: () =>
            this.failed.emit(
              $localize`:Shown when the list of documents to insert from cannot be read@@pageOrganiser.listFailed:Could not list the documents in this project.`,
            ),
        }),
      error: () =>
        this.failed.emit(
          $localize`:Shown when the document's project cannot be determined@@pageOrganiser.projectUnknown:Could not identify this document's project.`,
        ),
    });
  }

  private insertFailedLabel(): string {
    return $localize`:Fallback when inserting pages fails@@pageOrganiser.insertFailed:The pages could not be inserted.`;
  }
}

/** Page operations exist for PDFs only. */
function isPdf(candidate: Document): boolean {
  return (
    candidate.fileType?.toLowerCase().includes("pdf") ||
    candidate.fileName?.toLowerCase().endsWith(".pdf") ||
    false
  );
}

function converterDownLabel(): string {
  return $localize`:Shown when the backend conversion service is unreachable@@pageOrganiser.converterDown:The document conversion service is not running.`;
}
