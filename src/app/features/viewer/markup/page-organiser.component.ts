import {
  Component, inject, signal, computed, effect, ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { CdkDropList, CdkDrag, CdkDragHandle, CdkDragDrop } from '@angular/cdk/drag-drop';

import { PageService } from '../../../core/services/page.service';
import { DocumentService } from '../../../core/services/document.service';
import { ViewerStateService } from '../../../../viewer-core/viewer-state.service';
import { InsertPagesPanelComponent } from './insert-pages-panel.component';
import { PageDraft, DraftPage } from './page-draft';
import { problemMessage } from '../../../core/handlers/problem-detail';

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
    CommonModule, CdkDropList, CdkDrag, CdkDragHandle, InsertPagesPanelComponent,
  ],
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
        <button (click)="pages.toggleSelectAll()" class="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50">
          {{ pages.allSelected() ? selectNoneLabel : selectAllLabel }}
        </button>
        <button (click)="rotateSelection(-90)" [disabled]="!pages.hasSelection()"
          i18n-title="@@pageOrganiser.rotateLeft"
          title="Rotate selected pages 90° anticlockwise"
          class="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-30">↺</button>
        <button (click)="rotateSelection(90)" [disabled]="!pages.hasSelection()"
          i18n-title="@@pageOrganiser.rotateRight"
          title="Rotate selected pages 90° clockwise"
          class="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-30">↻</button>
        <button (click)="duplicateSelection()" [disabled]="!pages.hasSelection()"
          i18n-title="@@pageOrganiser.duplicate"
          title="Duplicate selected pages"
          class="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-30">⧉</button>
        <button (click)="deleteSelection()" [disabled]="!pages.canDeleteSelection()"
          [title]="pages.canDeleteSelection() ? deleteHint : lastPageHint"
          class="text-xs px-2 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-30">🗑</button>
        <button (click)="extractSelection()" [disabled]="!pages.hasSelection() || pages.dirty() || working()"
          [title]="pages.dirty() ? applyFirstHint : extractHint"
          class="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-30"
          ><span aria-hidden="true">⇱</span>
          <ng-container i18n="Copies the selected pages into a new document@@pageOrganiser.extract"
            >Extract</ng-container
          ></button>
        <button (click)="openInsertPicker()" [disabled]="pages.dirty() || working()"
          [title]="pages.dirty() ? applyFirstHint : insertHint"
          class="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-30"
          ><span aria-hidden="true">⇲</span>
          <ng-container i18n="Adds pages from another document@@pageOrganiser.insert"
            >Insert</ng-container
          ></button>
      </div>

      @if (picking()) {
        <app-insert-pages-panel
          [insertPosition]="pages.insertPosition()"
          (closed)="picking.set(false)"
          (failed)="reportInsertFailure($event)"
          (inserted)="onPagesInserted()"
        />
      }

      <!-- Pending changes -->
      @if (pages.dirty()) {
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
        @if (pages.pages().length === 0) {
          <div i18n="@@pageOrganiser.loadingThumbnails" class="col-span-2 text-center text-gray-400 text-xs py-8">Generating thumbnails...</div>
        }
        @for (page of pages.pages(); track page.id; let index = $index) {
          <div cdkDrag class="page-card rounded border-2 transition-colors overflow-hidden"
            [class]="pages.isSelected(page.id)
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

  /** The pending rearrangement — see `page-draft.ts`. */
  readonly pages = new PageDraft();

  readonly working   = signal(false);
  readonly message   = signal('');
  readonly messageIsError = signal(false);

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

  // ── Selection ────────────────────────────────────────────────

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

  // ── Editing ──────────────────────────────────────────────────

  onDrop(event: CdkDragDrop<DraftPage[]>) {
    this.pages.move(event.previousIndex, event.currentIndex);
    this.clearMessage();
  }

  rotateSelection(degrees: number) {
    this.pages.rotateSelection(degrees);
    this.clearMessage();
  }

  duplicateSelection() {
    this.pages.duplicateSelection();
    this.clearMessage();
  }

  deleteSelection() {
    this.pages.deleteSelection();
    this.clearMessage();
  }

  discard() {
    this.pages.discard();
    this.clearMessage();
  }

  // ── Applying ─────────────────────────────────────────────────

  apply() {
    if (!this.pages.dirty() || this.working()) return;

    this.working.set(true);
    this.clearMessage();
    const layout = this.pages.pages().map(page => ({ page: page.sourcePage, rotate: page.rotate }));

    this.pageService.arrange(this.state.documentId(), layout).subscribe({
      next: result => {
        this.working.set(false);
        this.pages.selection.set(new Set());
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
  /** The insert panel could not do what was asked; say so where messages go. */
  reportInsertFailure(text: string) {
    this.report(text, true);
  }

  /**
   * The document has a new version with the inserted pages in it, so the
   * selection refers to a layout that no longer exists.
   */
  onPagesInserted() {
    this.pages.selection.set(new Set());
  }

  openInsertPicker() {
    this.picking.set(true);
    this.clearMessage();
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


  extractSelection() {
    const pages = this.pages.selectedSourcePages();
    if (!pages.length) return;

    this.working.set(true);
    this.clearMessage();
    this.pageService.extract(this.state.documentId(), pages).subscribe({
      next: result => {
        this.working.set(false);
        this.pages.selection.set(new Set());
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

  // ── Internals ────────────────────────────────────────────────

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
