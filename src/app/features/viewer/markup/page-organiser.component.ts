import {
  Component, inject, signal, computed, effect, ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { CdkDropList, CdkDrag, CdkDragHandle, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';

import { PageService } from '../../../core/services/page.service';
import { DocumentService } from '../../../core/services/document.service';
import { ViewerStateService } from '../../../../viewer-core/viewer-state.service';
import { Document } from '../../../core/models';
import { problemMessage } from '../../../core/handlers/problem-detail';

/**
 * One page of the layout being edited.
 *
 * `id` exists because `sourcePage` is not unique once a page is duplicated,
 * and both drag-drop tracking and the selection need to tell two copies of
 * page 3 apart.
 */
export interface DraftPage {
  id:         number;
  sourcePage: number;
  rotate:     number;
}

/**
 * Reorder, rotate, duplicate, delete and extract pages.
 *
 * <p>Edits are collected locally and applied in one request. Committing on
 * every drag would be simpler but would bury the version history under an
 * entry per movement, and a half-finished reordering is not a state worth
 * recording. Nothing is written until Apply, so Discard is a true undo.
 */
@Component({
  selector: 'app-page-organiser',
  standalone: true,
  imports: [CommonModule, CdkDropList, CdkDrag, CdkDragHandle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    .cdk-drag-preview { box-shadow: 0 5px 14px rgba(0,0,0,.3); border-radius: 4px; }
    .cdk-drag-placeholder { opacity: .35; }
    .cdk-drop-list-dragging .page-card:not(.cdk-drag-placeholder) {
      transition: transform 200ms cubic-bezier(0, 0, .2, 1);
    }
  `],
  template: `
    <div class="flex flex-col h-full">

      <!-- Action bar -->
      <div class="flex flex-wrap gap-1 p-2 border-b border-gray-200 flex-shrink-0">
        <button (click)="selectAll()" class="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50">
          {{ allSelected() ? selectNoneLabel : selectAllLabel }}
        </button>
        <button (click)="rotateSelection(-90)" [disabled]="!hasSelection()"
          i18n-title="@@pageOrganiser.rotateLeft"
          title="Rotate selected pages 90° anticlockwise"
          class="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-30">↺</button>
        <button (click)="rotateSelection(90)" [disabled]="!hasSelection()"
          i18n-title="@@pageOrganiser.rotateRight"
          title="Rotate selected pages 90° clockwise"
          class="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-30">↻</button>
        <button (click)="duplicateSelection()" [disabled]="!hasSelection()"
          i18n-title="@@pageOrganiser.duplicate"
          title="Duplicate selected pages"
          class="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-30">⧉</button>
        <button (click)="deleteSelection()" [disabled]="!canDeleteSelection()"
          [title]="canDeleteSelection() ? deleteHint : lastPageHint"
          class="text-xs px-2 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-30">🗑</button>
        <button (click)="extractSelection()" [disabled]="!hasSelection() || dirty() || working()"
          [title]="dirty() ? applyFirstHint : extractHint"
          class="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-30"
          ><span aria-hidden="true">⇱</span>
          <ng-container i18n="Copies the selected pages into a new document@@pageOrganiser.extract"
            >Extract</ng-container
          ></button>
        <button (click)="openInsertPicker()" [disabled]="dirty() || working()"
          [title]="dirty() ? applyFirstHint : insertHint"
          class="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-30"
          ><span aria-hidden="true">⇲</span>
          <ng-container i18n="Adds pages from another document@@pageOrganiser.insert"
            >Insert</ng-container
          ></button>
      </div>

      <!-- Insert picker: siblings in the same project -->
      @if (picking()) {
        <div class="p-2 border-b border-gray-200 bg-gray-50 flex-shrink-0">
          <div class="flex items-center justify-between mb-1">
            <span i18n="Heading over the list of documents to take pages from@@pageOrganiser.insertFromHeading"
                  class="text-xs font-semibold text-gray-700">Insert all pages from</span>
            <button (click)="picking.set(false)"
              i18n-aria-label="@@pageOrganiser.closeInsertPicker" aria-label="Close"
              class="text-xs text-gray-500 hover:text-gray-800">✕</button>
          </div>
          @if (candidates().length === 0) {
            <p i18n="@@pageOrganiser.noInsertCandidates" class="text-xs text-gray-500 py-1">
              No other PDF in this project to insert from.
            </p>
          }
          <ul class="max-h-32 overflow-y-auto">
            @for (candidate of candidates(); track candidate.id) {
              <li>
                <button (click)="insertFrom(candidate.id)" [disabled]="working()"
                  class="w-full text-start text-xs px-1.5 py-1 rounded hover:bg-white disabled:opacity-40 truncate">
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
      }

      <!-- Pending changes -->
      @if (dirty()) {
        <div class="flex items-center gap-2 px-2 py-1.5 bg-amber-50 border-b border-amber-200 flex-shrink-0">
          <span class="text-xs text-amber-800 flex-1">{{ pendingLabel() }}</span>
          <button (click)="discard()" [disabled]="working()"
            i18n="Throws away unapplied page changes@@pageOrganiser.discard"
            class="text-xs px-2 py-0.5 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40">
            Discard
          </button>
          <button (click)="apply()" [disabled]="working()"
            class="text-xs px-2 py-0.5 rounded bg-accent text-white hover:opacity-90 disabled:opacity-40">
            {{ working() ? applyingLabel : applyLabel }}
          </button>
        </div>
      }

      @if (message()) {
        <div class="px-2 py-1.5 text-xs flex-shrink-0"
             [class]="messageIsError() ? 'text-red-700 bg-red-50' : 'text-emerald-800 bg-emerald-50'">
          {{ message() }}
        </div>
      }

      <!-- Pages. Two columns with a capped thumbnail height: reordering means
           comparing pages against each other, which a single tall column
           makes impossible — five pages ran past the bottom of the screen. -->
      <div class="flex-1 overflow-y-auto p-2 grid grid-cols-2 gap-2 content-start"
           cdkDropList cdkDropListOrientation="mixed" (cdkDropListDropped)="onDrop($event)">
        @if (draft().length === 0) {
          <div i18n="@@pageOrganiser.loadingThumbnails" class="col-span-2 text-center text-gray-400 text-xs py-8">Generating thumbnails...</div>
        }
        @for (page of draft(); track page.id; let index = $index) {
          <div cdkDrag class="page-card rounded border-2 transition-colors overflow-hidden"
            [class]="isSelected(page.id)
              ? 'border-accent bg-blue-50'
              : 'border-gray-200 hover:border-gray-400 bg-white'">

            <button (click)="toggle(page.id, $event)" class="block w-full text-start p-1">
              <div class="h-20 flex items-center justify-center overflow-hidden bg-white">
                <img [src]="thumbnailFor(page.sourcePage)"
                     [style.transform]="'rotate(' + page.rotate + 'deg)'"
                     class="max-h-full max-w-full object-contain transition-transform"
                     [alt]="pageThumbnailLabel(page.sourcePage)" />
              </div>
            </button>

            <div class="flex items-center gap-1 px-1 pb-1 text-xs text-gray-500">
              <!-- The grip owns the drag: starting it from the thumbnail
                   would fight with click-to-select. -->
              <span cdkDragHandle class="cursor-move text-gray-400 hover:text-gray-700 select-none"
                    i18n-title="Tooltip on the grip that reorders a page. Reordering also works from the keyboard.@@pageOrganiser.dragHandle"
                    title="Drag to reorder">⠿</span>
              <span class="font-medium text-gray-700">{{ index + 1 }}</span>
              @if (page.rotate) { <span class="text-amber-600">{{ page.rotate }}°</span> }
              @if (page.sourcePage !== index + 1 || duplicated(page.sourcePage)) {
                <span i18n="Shows where a page sat before it was moved or copied@@pageOrganiser.wasPage"
                      class="text-gray-400 truncate">was {{ page.sourcePage }}</span>
              }
            </div>
          </div>
        }
      </div>
    </div>
  `
})
export class PageOrganiserComponent {
  private pageService     = inject(PageService);
  private documentService = inject(DocumentService);
  private state           = inject(ViewerStateService);

  readonly draft     = signal<DraftPage[]>([]);
  readonly selection = signal<Set<number>>(new Set());
  readonly working   = signal(false);
  readonly message   = signal('');
  readonly messageIsError = signal(false);

  /** Insert picker state: whether it is open, and the documents it offers. */
  readonly picking    = signal(false);
  readonly candidates = signal<Document[]>([]);

  /** Layout as it was when loaded, to tell an edit from a no-op. */
  private baseline: DraftPage[] = [];
  private nextId = 1;

  readonly dirty = computed(() => {
    const current = this.draft();
    if (current.length !== this.baseline.length) return true;
    return current.some((page, index) => {
      // Lengths were compared above, so the index is in range. Treating a
      // missing baseline entry as "changed" is also the right answer if that
      // ever stops holding: the draft would differ from the baseline.
      const original = this.baseline[index];
      return !original
          || page.sourcePage !== original.sourcePage
          || page.rotate     !== original.rotate;
    });
  });

  readonly hasSelection = computed(() => this.selection().size > 0);
  readonly allSelected  = computed(() =>
    this.draft().length > 0 && this.selection().size === this.draft().length);

  /** Deleting everything would leave no document, so the last page is kept. */
  readonly canDeleteSelection = computed(() =>
    this.hasSelection() && this.selection().size < this.draft().length);

  constructor() {
    // Rebuild whenever the document reloads — a committed version may have a
    // different page count, and a draft over stale pages would apply nonsense.
    effect(() => {
      this.state.reloadToken();
      const thumbnails = this.state.thumbnails();
      if (thumbnails.length) this.reset(thumbnails.length);
    });
  }

  // ── Selection ────────────────────────────────────────────────

  isSelected(id: number): boolean {
    return this.selection().has(id);
  }

  /** Plain click replaces the selection; ctrl/meta or shift adds to it. */
  toggle(id: number, event: MouseEvent) {
    const additive = event.ctrlKey || event.metaKey || event.shiftKey;
    this.selection.update(current => {
      const next = additive ? new Set(current) : new Set<number>();
      if (current.has(id) && (additive || current.size === 1)) next.delete(id);
      else next.add(id);
      return next;
    });

    // Clicking a page that is still where it started is also a request to see
    // it, which is what the panel was for before it became editable.
    const page = this.draft().find(entry => entry.id === id);
    if (page && !this.dirty()) this.state.navigateTo(page.sourcePage);
  }

  selectAll() {
    this.selection.set(this.allSelected()
      ? new Set()
      : new Set(this.draft().map(page => page.id)));
  }

  // ── Editing ──────────────────────────────────────────────────

  onDrop(event: CdkDragDrop<DraftPage[]>) {
    if (event.previousIndex === event.currentIndex) return;
    this.draft.update(pages => {
      const next = [...pages];
      moveItemInArray(next, event.previousIndex, event.currentIndex);
      return next;
    });
    this.clearMessage();
  }

  rotateSelection(degrees: number) {
    const selected = this.selection();
    this.draft.update(pages => pages.map(page => page.id === undefined || !selected.has(page.id)
      ? page
      : { ...page, rotate: (((page.rotate + degrees) % 360) + 360) % 360 }));
    this.clearMessage();
  }

  duplicateSelection() {
    const selected = this.selection();
    this.draft.update(pages => pages.flatMap(page => selected.has(page.id)
      ? [page, { ...page, id: this.nextId++ }]
      : [page]));
    this.clearMessage();
  }

  deleteSelection() {
    if (!this.canDeleteSelection()) return;
    const selected = this.selection();
    this.draft.update(pages => pages.filter(page => !selected.has(page.id)));
    this.selection.set(new Set());
    this.clearMessage();
  }

  discard() {
    this.draft.set(this.baseline.map(page => ({ ...page })));
    this.selection.set(new Set());
    this.clearMessage();
  }

  // ── Applying ─────────────────────────────────────────────────

  apply() {
    if (!this.dirty() || this.working()) return;

    this.working.set(true);
    this.clearMessage();
    const layout = this.draft().map(page => ({ page: page.sourcePage, rotate: page.rotate }));

    this.pageService.arrange(this.state.documentId(), layout).subscribe({
      next: result => {
        this.working.set(false);
        this.selection.set(new Set());
        // The reload rebuilds the draft from the new page count, so there is
        // no need to reset it here — doing both would fight.
        this.state.applyVersionCommit(result.version, result.summary);
      },
      error: err => {
        this.working.set(false);
        this.report(
          this.errorText(
            err,
            $localize`:Fallback when applying page changes fails@@pageOrganiser.rearrangeFailed:The pages could not be rearranged.`,
          ),
          true,
        );
      }
    });
  }

  // ── Inserting from another document ──────────────────────────

  /**
   * Offers the other PDFs in this project.
   *
   * <p>The viewer only knows its own document, so the project comes from the
   * document record; the list is fetched when the picker opens rather than up
   * front, since most sessions never insert anything.
   */
  openInsertPicker() {
    this.picking.set(true);
    if (this.candidates().length) return;

    const documentId = this.state.documentId();
    this.documentService.getById(documentId).subscribe({
      next: current => this.documentService.listByProject(current.projectId).subscribe({
        next: documents => this.candidates.set(
          documents.filter(candidate =>
            candidate.id !== documentId && this.isPdf(candidate))),
        error: () =>
          this.report(
            $localize`:Shown when the list of documents to insert from cannot be read@@pageOrganiser.listFailed:Could not list the documents in this project.`,
            true,
          )
      }),
      error: () =>
        this.report(
          $localize`:Shown when the document's project cannot be determined@@pageOrganiser.projectUnknown:Could not identify this document's project.`,
          true,
        )
    });
  }

  /**
   * Inserts every page of the chosen document after the selected page, or at
   * the end when nothing is selected.
   */
  insertFrom(sourceDocumentId: number) {
    this.working.set(true);
    this.clearMessage();

    // Ask the donor how many pages it has rather than assuming: the server
    // rejects an empty selection, and it is right to — "insert nothing" is
    // never what someone meant.
    this.pageService.getPages(sourceDocumentId).subscribe({
      next: info => {
        if (!info.success || !info.pageCount) {
          this.working.set(false);
          this.report(
            $localize`:Shown when the chosen document turns out to be empty@@pageOrganiser.sourceEmpty:That document has no pages to insert.`,
            true,
          );
          return;
        }
        const pages = Array.from({ length: info.pageCount }, (_, index) => index + 1);
        this.pageService.insert(
          this.state.documentId(), sourceDocumentId, pages, this.insertPosition()
        ).subscribe({
          next: result => {
            this.working.set(false);
            this.picking.set(false);
            this.selection.set(new Set());
            this.state.applyVersionCommit(result.version, result.summary);
          },
          error: err => {
            this.working.set(false);
            this.report(
              this.errorText(
                err,
                $localize`:Fallback when inserting pages fails@@pageOrganiser.insertFailed:The pages could not be inserted.`,
              ),
              true,
            );
          }
        });
      },
      error: err => {
        this.working.set(false);
        this.report(
          this.errorText(
            err,
            $localize`:Fallback when the source document cannot be read@@pageOrganiser.sourceUnreadable:That document's pages could not be read.`,
          ),
          true,
        );
      }
    });
  }

  /** Insertion goes after the last selected page, or at the end. */
  private insertPosition(): number | undefined {
    const selected = this.selection();
    if (!selected.size) return undefined;
    const lastIndex = this.draft().reduce(
      (last, page, index) => selected.has(page.id) ? index : last, -1);
    return lastIndex >= 0 ? lastIndex + 2 : undefined;
  }

  insertAtLabel(): string {
    const position = this.insertPosition();
    return position === undefined
      ? $localize`:Completes "Inserted ..." when nothing is selected@@pageOrganiser.insertAtEnd:at the end`
      : $localize`:Completes "Inserted ..." with the page it lands before@@pageOrganiser.insertBeforePage:before page ${position}:position:`;
  }

  /** Alternative text for a page thumbnail. */
  pageThumbnailLabel(sourcePage: number): string {
    return $localize`:Alternative text on a page thumbnail@@pageOrganiser.pageThumbnail:Page ${sourcePage}:page:`;
  }

  /**
   * Labels and tooltips that live in expressions, so `i18n` cannot mark them
   * — see the note in login.component.ts.
   */
  readonly selectAllLabel = $localize`:Selects every page. Very short — it shares a row with six icon buttons.@@pageOrganiser.selectAll:All`;
  readonly selectNoneLabel = $localize`:Clears the page selection. Very short — it shares a row with six icon buttons.@@pageOrganiser.selectNone:None`;
  readonly applyLabel = $localize`:Commits the pending page changes to the document@@pageOrganiser.apply:Apply`;
  readonly applyingLabel = $localize`:Apply button while the request is in flight@@pageOrganiser.applying:Applying...`;
  readonly deleteHint = $localize`:Tooltip on the enabled delete-pages button@@pageOrganiser.deleteHint:Delete selected pages`;
  readonly lastPageHint = $localize`:Tooltip explaining why pages cannot be deleted@@pageOrganiser.lastPageHint:A document must keep at least one page`;
  readonly applyFirstHint = $localize`:Tooltip explaining why extract and insert are unavailable while changes are pending@@pageOrganiser.applyFirstHint:Apply or discard your changes first`;
  readonly extractHint = $localize`:Tooltip on the enabled extract button@@pageOrganiser.extractHint:Copy selected pages into a new document`;
  readonly insertHint = $localize`:Tooltip on the enabled insert button@@pageOrganiser.insertHint:Insert pages from another document`;

  private isPdf(candidate: { fileName?: string; fileType?: string }): boolean {
    return (candidate.fileType ?? '').toLowerCase().includes('pdf')
        || (candidate.fileName ?? '').toLowerCase().endsWith('.pdf');
  }

  extractSelection() {
    const pages = this.selectedSourcePages();
    if (!pages.length) return;

    this.working.set(true);
    this.clearMessage();
    this.pageService.extract(this.state.documentId(), pages).subscribe({
      next: result => {
        this.working.set(false);
        this.selection.set(new Set());
        const name = result.name;
        const pageCount = result.pageCount;
        this.report(
          $localize`:Confirms an extraction, naming the new document and its size@@pageOrganiser.extracted:Created "${name}:name:" with ${pageCount}:pageCount: page(s). It is in this project alongside the original.`,
          false,
        );
      },
      error: err => {
        this.working.set(false);
        this.report(
          this.errorText(
            err,
            $localize`:Fallback when extracting pages fails@@pageOrganiser.extractFailed:The pages could not be extracted.`,
          ),
          true,
        );
      }
    });
  }

  // ── View helpers ─────────────────────────────────────────────

  thumbnailFor(sourcePage: number): string {
    return this.state.thumbnails().find(t => t.pageNumber === sourcePage)?.dataUrl ?? '';
  }

  /** True when this source page appears more than once in the draft. */
  duplicated(sourcePage: number): boolean {
    return this.draft().filter(page => page.sourcePage === sourcePage).length > 1;
  }

  pendingLabel(): string {
    const before = this.baseline.length;
    const after  = this.draft().length;
    if (after === before) {
      return $localize`:Shown when pages were rotated or reordered but the count is unchanged@@pageOrganiser.pendingSameCount:Page changes not yet applied`;
    }
    return $localize`:Shown when the page count has changed and nothing is saved yet@@pageOrganiser.pendingCountChanged:${after}:after: pages, was ${before}:before: — not yet applied`;
  }

  // ── Internals ────────────────────────────────────────────────

  private reset(pageCount: number) {
    this.nextId = 1;
    const pages = Array.from({ length: pageCount }, (_, index) => ({
      id:         this.nextId++,
      sourcePage: index + 1,
      rotate:     0
    }));
    this.baseline = pages.map(page => ({ ...page }));
    this.draft.set(pages);
    this.selection.set(new Set());
  }

  /** Selected pages as source page numbers, in document order, deduplicated. */
  private selectedSourcePages(): number[] {
    const selected = this.selection();
    return [...new Set(
      this.draft().filter(page => selected.has(page.id)).map(page => page.sourcePage)
    )].sort((a, b) => a - b);
  }

  private report(text: string, isError: boolean) {
    this.message.set(text);
    this.messageIsError.set(isError);
  }

  private clearMessage() {
    this.message.set('');
  }

  private errorText(err: { status?: number; error?: { message?: string } }, fallback: string): string {
    if (err.status === 503) {
      return $localize`:Shown when the backend conversion service is unreachable@@pageOrganiser.converterDown:The document conversion service is not running.`;
    }
    return problemMessage(err, fallback);
  }
}
