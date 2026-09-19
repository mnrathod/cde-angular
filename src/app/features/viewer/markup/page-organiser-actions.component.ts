/**
 * What can be done to the selected pages, and what is pending.
 *
 * <p>Every icon-only button here carries an `aria-label`. They did not: a
 * button whose whole content is "↺" has that glyph as its accessible name,
 * because content wins over `title` in the name computation. Four controls
 * therefore announced themselves as a symbol — the rotate pair, duplicate
 * and delete. The `title` stays for whoever is using a mouse.
 */
import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, Output,
} from "@angular/core";

@Component({
  selector: "app-page-organiser-actions",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap gap-1 p-2 border-b border-gray-200 flex-shrink-0"
         role="group"
         i18n-aria-label="Names the row of controls acting on the selected pages@@pageOrganiser.actionsGroup"
         aria-label="Page actions">
      <button (click)="selectAllToggled.emit()" class="action">
        {{ allSelected ? selectNoneLabel : selectAllLabel }}
      </button>
      <button (click)="rotated.emit(-90)" [disabled]="!hasSelection"
        class="action" [attr.aria-label]="rotateLeftLabel" [title]="rotateLeftLabel"
        ><span aria-hidden="true">↺</span></button>
      <button (click)="rotated.emit(90)" [disabled]="!hasSelection"
        class="action" [attr.aria-label]="rotateRightLabel" [title]="rotateRightLabel"
        ><span aria-hidden="true">↻</span></button>
      <button (click)="duplicated.emit()" [disabled]="!hasSelection"
        class="action" [attr.aria-label]="duplicateLabel" [title]="duplicateLabel"
        ><span aria-hidden="true">⧉</span></button>
      <button (click)="deleted.emit()" [disabled]="!canDelete"
        class="action danger"
        [attr.aria-label]="deleteHint"
        [title]="canDelete ? deleteHint : lastPageHint"
        ><span aria-hidden="true">🗑</span></button>
      <button (click)="extracted.emit()" [disabled]="!hasSelection || dirty || working"
        class="action" [title]="dirty ? applyFirstHint : extractHint"
        ><span aria-hidden="true">⇱</span>
        <ng-container i18n="Copies the selected pages into a new document@@pageOrganiser.extract"
          >Extract</ng-container
        ></button>
      <button (click)="insertRequested.emit()" [disabled]="dirty || working"
        class="action" [title]="dirty ? applyFirstHint : insertHint"
        ><span aria-hidden="true">⇲</span>
        <ng-container i18n="Adds pages from another document@@pageOrganiser.insert"
          >Insert</ng-container
        ></button>
    </div>

    @if (dirty) {
      <div class="flex items-center gap-2 px-2 py-1.5 bg-amber-50 border-b border-amber-200 flex-shrink-0">
        <span class="text-xs text-amber-800 flex-1">{{ pendingLabel }}</span>
        <button (click)="discarded.emit()" [disabled]="working"
          i18n="Throws away unapplied page changes@@pageOrganiser.discard"
          class="text-xs px-2 py-0.5 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40">
          Discard
        </button>
        <button (click)="applied.emit()" [disabled]="working"
          class="text-xs px-2 py-0.5 rounded bg-accent text-white hover:opacity-90 disabled:opacity-40">
          {{ working ? applyingLabel : applyLabel }}
        </button>
      </div>
    }

    @if (message) {
      <!-- A live region: the result of pressing Apply is announced rather
           than only appearing (§1A.2). -->
      <div class="px-2 py-1.5 text-xs flex-shrink-0"
           role="status" aria-live="polite"
           [class]="messageIsError ? 'text-red-700 bg-red-50' : 'text-emerald-800 bg-emerald-50'">
        {{ message }}
      </div>
    }
  `,
  styles: [`
    .action {
      font-size: .75rem;
      min-width: 24px; min-height: 24px;
      padding: .25rem .5rem;
      border-radius: .25rem;
      border: 1px solid #d1d5db;
    }
    .action:hover:not(:disabled) { background: #f9fafb; }
    .action:disabled { opacity: .3; }
    .action.danger { border-color: #fca5a5; color: #dc2626; }
    .action.danger:hover:not(:disabled) { background: #fef2f2; }
  `],
})
export class PageOrganiserActionsComponent {
  @Input() allSelected = false;
  @Input() hasSelection = false;
  @Input() canDelete = false;
  @Input() dirty = false;
  @Input() working = false;
  @Input() pendingLabel = "";
  @Input() message = "";
  @Input() messageIsError = false;

  @Output() selectAllToggled = new EventEmitter<void>();
  @Output() rotated = new EventEmitter<number>();
  @Output() duplicated = new EventEmitter<void>();
  @Output() deleted = new EventEmitter<void>();
  @Output() extracted = new EventEmitter<void>();
  @Output() insertRequested = new EventEmitter<void>();
  @Output() discarded = new EventEmitter<void>();
  @Output() applied = new EventEmitter<void>();

  /**
   * Labels and tooltips that live in expressions, so `i18n` cannot mark them
   * — see the note in login.component.ts.
   */
  readonly selectAllLabel = $localize`:Selects every page. Very short — it shares a row with six icon buttons.@@pageOrganiser.selectAll:All`;
  readonly selectNoneLabel = $localize`:Clears the page selection. Very short — it shares a row with six icon buttons.@@pageOrganiser.selectNone:None`;
  readonly applyLabel = $localize`:Commits the pending page changes to the document@@pageOrganiser.apply:Apply`;
  readonly applyingLabel = $localize`:Apply button while the request is in flight@@pageOrganiser.applying:Applying...`;
  readonly rotateLeftLabel = $localize`:Button that turns the selected pages a quarter turn anticlockwise@@pageOrganiser.rotateLeft:Rotate selected pages 90° anticlockwise`;
  readonly rotateRightLabel = $localize`:Button that turns the selected pages a quarter turn clockwise@@pageOrganiser.rotateRight:Rotate selected pages 90° clockwise`;
  readonly duplicateLabel = $localize`:Button that copies the selected pages in place@@pageOrganiser.duplicate:Duplicate selected pages`;
  readonly deleteHint = $localize`:Tooltip on the enabled delete-pages button@@pageOrganiser.deleteHint:Delete selected pages`;
  readonly lastPageHint = $localize`:Tooltip explaining why pages cannot be deleted@@pageOrganiser.lastPageHint:A document must keep at least one page`;
  readonly applyFirstHint = $localize`:Tooltip explaining why extract and insert are unavailable while changes are pending@@pageOrganiser.applyFirstHint:Apply or discard your changes first`;
  readonly extractHint = $localize`:Tooltip on the enabled extract button@@pageOrganiser.extractHint:Copy selected pages into a new document`;
  readonly insertHint = $localize`:Tooltip on the enabled insert button@@pageOrganiser.insertHint:Insert pages from another document`;
}
