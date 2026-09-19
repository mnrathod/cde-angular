import {
  Component, inject, effect, signal, ChangeDetectionStrategy
} from '@angular/core';
import { CdkDropList, CdkDragDrop } from '@angular/cdk/drag-drop';

import { ViewerStateService } from '../../../../viewer-core/viewer-state.service';
import { InsertPagesPanelComponent } from './insert-pages-panel.component';
import { PageCardComponent } from './page-card.component';
import { PageOrganiserActionsComponent } from './page-organiser-actions.component';
import { PageOperationsService } from './page-operations.service';
import { PageDraft, DraftPage } from './page-draft';

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
  imports: [
    CdkDropList, InsertPagesPanelComponent, PageCardComponent,
    PageOrganiserActionsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [PageOperationsService],
  styles: [`
    .cdk-drag-preview { box-shadow: 0 5px 14px rgba(0,0,0,.3); border-radius: 4px; }
    .cdk-drag-placeholder { opacity: .35; }
    .cdk-drop-list-dragging app-page-card:not(.cdk-drag-placeholder) {
      transition: transform 200ms cubic-bezier(0, 0, .2, 1);
    }
  `],
  template: `
    <div class="flex flex-col h-full">

      <app-page-organiser-actions
        [allSelected]="pages.allSelected()"
        [hasSelection]="pages.hasSelection()"
        [canDelete]="pages.canDeleteSelection()"
        [dirty]="pages.dirty()"
        [working]="operations.working()"
        [pendingLabel]="pendingLabel()"
        [message]="operations.message()"
        [messageIsError]="operations.messageIsError()"
        (selectAllToggled)="pages.toggleSelectAll()"
        (rotated)="rotateSelection($event)"
        (duplicated)="duplicateSelection()"
        (deleted)="deleteSelection()"
        (extracted)="extractSelection()"
        (insertRequested)="openInsertPicker()"
        (discarded)="discard()"
        (applied)="apply()"
      />

      @if (picking()) {
        <app-insert-pages-panel
          [insertPosition]="pages.insertPosition()"
          (closed)="picking.set(false)"
          (failed)="operations.report($event, true)"
          (inserted)="clearSelection()"
        />
      }

      <!-- Pages. Two columns with a capped thumbnail height: reordering means
           comparing pages against each other, which a single tall column
           makes impossible — five pages ran past the bottom of the screen. -->
      <div class="flex-1 overflow-y-auto p-2 grid grid-cols-2 gap-2 content-start"
           cdkDropList cdkDropListOrientation="mixed" (cdkDropListDropped)="onDrop($event)">
        @if (pages.pages().length === 0) {
          <div i18n="@@pageOrganiser.loadingThumbnails" class="col-span-2 text-center text-gray-400 text-xs py-8">Generating thumbnails...</div>
        }
        @for (page of pages.pages(); track page.id; let index = $index) {
          <app-page-card
            [page]="page"
            [position]="index + 1"
            [total]="pages.pages().length"
            [selected]="pages.isSelected(page.id)"
            [thumbnail]="thumbnailFor(page.sourcePage)"
            [movedOrCopied]="page.sourcePage !== index + 1 || duplicated(page.sourcePage)"
            (chosen)="toggle(page.id, $event)"
            (movedEarlier)="moveTo(index, index - 1)"
            (movedLater)="moveTo(index, index + 1)"
          />
        }
      </div>
    </div>
  `
})
export class PageOrganiserComponent {
  private state = inject(ViewerStateService);
  operations = inject(PageOperationsService);

  /** The pending rearrangement — see `page-draft.ts`. */
  readonly pages = new PageDraft();

  /** Whether the panel for taking pages from another document is open. */
  readonly picking = signal(false);

  constructor() {
    // Rebuild whenever the document reloads — a committed version may have a
    // different page count, and a draft over stale pages would apply nonsense.
    effect(() => {
      this.state.reloadToken();
      const thumbnails = this.state.thumbnails();
      if (thumbnails.length) this.pages.reset(thumbnails.length);
    });
  }

  /** Plain click replaces the selection; ctrl, meta or shift adds to it. */
  toggle(id: number, event: MouseEvent) {
    this.pages.select(id, {
      additive: event.ctrlKey || event.metaKey || event.shiftKey,
    });

    // Clicking a page that is still where it started is also a request to see
    // it, which is what the panel was for before it became editable.
    const page = this.pages.pageWithId(id);
    if (page && !this.pages.dirty()) this.state.navigateTo(page.sourcePage);
  }

  onDrop(event: CdkDragDrop<DraftPage[]>) {
    this.moveTo(event.previousIndex, event.currentIndex);
  }

  /** The keyboard route to reordering, and the one the drag ends in. */
  moveTo(from: number, to: number) {
    if (to < 0 || to >= this.pages.pages().length) return;
    this.pages.move(from, to);
    this.operations.clearMessage();
  }

  rotateSelection(degrees: number) {
    this.pages.rotateSelection(degrees);
    this.operations.clearMessage();
  }

  duplicateSelection() {
    this.pages.duplicateSelection();
    this.operations.clearMessage();
  }

  deleteSelection() {
    this.pages.deleteSelection();
    this.operations.clearMessage();
  }

  /**
   * Drops the selection, after a commit that moved the pages it named.
   *
   * <p>A method rather than an inline `new Set()`: Angular's template
   * parser has no `new`.
   */
  clearSelection() {
    this.pages.selection.set(new Set());
  }

  discard() {
    this.pages.discard();
    this.operations.clearMessage();
  }

  apply() {
    if (!this.pages.dirty()) return;
    const layout = this.pages.pages()
      .map(page => ({ page: page.sourcePage, rotate: page.rotate }));
    this.operations.arrange(layout, () => this.clearSelection());
  }

  extractSelection() {
    this.operations.extract(
      this.pages.selectedSourcePages(),
      () => this.clearSelection());
  }

  openInsertPicker() {
    this.picking.set(true);
    this.operations.clearMessage();
  }

  thumbnailFor(sourcePage: number): string {
    return this.state.thumbnails().find(t => t.pageNumber === sourcePage)?.dataUrl ?? '';
  }

  /** True when this source page appears more than once in the draft. */
  duplicated(sourcePage: number): boolean {
    return this.pages.pages().filter(page => page.sourcePage === sourcePage).length > 1;
  }

  pendingLabel(): string {
    const before = this.pages.originalPageCount();
    const after  = this.pages.pages().length;
    if (after === before) {
      return $localize`:Shown when pages were rotated or reordered but the count is unchanged@@pageOrganiser.pendingSameCount:Page changes not yet applied`;
    }
    return $localize`:Shown when the page count has changed and nothing is saved yet@@pageOrganiser.pendingCountChanged:${after}:after: pages, was ${before}:before: — not yet applied`;
  }
}
