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
} from "@angular/core";

import { PageInsertionService } from "./page-insertion.service";

@Component({
  selector: "app-insert-pages-panel",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [PageInsertionService],
  template: `
    <div class="p-2 border-b border-gray-200 bg-gray-50 flex-shrink-0">
      <div class="flex items-center justify-between mb-1">
        <span id="insert-pages-heading"
          i18n="Heading over the list of documents to take pages from@@pageOrganiser.insertFromHeading"
          class="text-xs font-semibold text-gray-700"
          >Insert all pages from</span
        >
        <button type="button" (click)="closed.emit()"
          i18n-aria-label="@@pageOrganiser.closeInsertPicker" aria-label="Close"
          class="text-xs text-gray-500 hover:text-gray-800 min-w-6 min-h-6"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      @if (insertion.candidates().length === 0) {
        <p i18n="@@pageOrganiser.noInsertCandidates" class="text-xs text-gray-500 py-1">
          No other PDF in this project to insert from.
        </p>
      }

      <ul class="max-h-32 overflow-y-auto list-none m-0 p-0"
          aria-labelledby="insert-pages-heading">
        @for (candidate of insertion.candidates(); track candidate.id) {
          <li>
            <button type="button" (click)="insertFrom(candidate.id)"
              [disabled]="insertion.busy()"
              [attr.aria-busy]="insertion.busy() ? 'true' : null"
              class="w-full text-start text-xs px-1.5 py-1 rounded hover:bg-white disabled:opacity-40 truncate min-h-6"
            >
              {{ candidate.name }}
            </button>
          </li>
        }
      </ul>

      <p i18n="Says where inserted pages will land, e.g. 'Inserted at the end.'@@pageOrganiser.insertPosition"
         class="text-xs text-gray-400 mt-1">
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

  readonly insertion = inject(PageInsertionService);

  constructor() {
    this.insertion.loadCandidates((said) => this.failed.emit(said));
  }

  /** Where the pages will land, as a phrase completing "Inserted …". */
  insertAtLabel(): string {
    const position = this.insertPosition();
    return position === undefined
      ? $localize`:Completes "Inserted ..." when nothing is selected@@pageOrganiser.insertAtEnd:at the end`
      : $localize`:Completes "Inserted ..." with the page it lands before@@pageOrganiser.insertBeforePage:before page ${position}:position:`;
  }

  insertFrom(sourceDocumentId: number): void {
    this.insertion.insertAllFrom(sourceDocumentId, this.insertPosition(), {
      inserted: () => {
        this.inserted.emit();
        this.closed.emit();
      },
      failed: (said) => this.failed.emit(said),
    });
  }
}
