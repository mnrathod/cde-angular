/**
 * One page in the pending layout.
 *
 * <p>Carries the single-pointer alternative to the drag. The grip was the
 * only way to reorder a page, and the tooltip's translator note said
 * "Reordering also works from the keyboard" — which was not true. Angular's
 * CDK drag-drop has no keyboard mode, and a `<span cdkDragHandle>` cannot
 * take focus, so a reader without a mouse could select, rotate, duplicate
 * and delete pages but never move one. SC 2.5.7 requires an alternative to
 * every drag, and §1A.2 makes that a functional defect.
 *
 * <p>Two buttons, then. They are the boring answer, they work everywhere,
 * and they announce which page they move and where it goes.
 *
 * <p>`cdkDrag` sits on this component in the organiser's template, not in a
 * `host` block here. A directive does not match the host element of its own
 * component — written here it would only have added an attribute, leaving
 * the grip inert and the pointer with no way to reorder either.
 */
import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, Output,
} from "@angular/core";
import { CdkDragHandle } from "@angular/cdk/drag-drop";

import { DraftPage } from "./page-draft";

@Component({
  selector: "app-page-card",
  standalone: true,
  imports: [CdkDragHandle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-card rounded border-2 transition-colors overflow-hidden"
      [class]="selected
        ? 'border-accent bg-blue-50'
        : 'border-gray-200 hover:border-gray-400 bg-white'">

      <button (click)="chosen.emit($event)"
        [attr.aria-pressed]="selected"
        class="block w-full text-start p-1">
        <div class="h-20 flex items-center justify-center overflow-hidden bg-white">
          <img [src]="thumbnail"
               [style.transform]="'rotate(' + page.rotate + 'deg)'"
               class="max-h-full max-w-full object-contain transition-transform"
               [alt]="thumbnailLabel()" />
        </div>
      </button>

      <div class="flex items-center gap-1 px-1 pb-1 text-xs text-gray-500">
        <!-- The grip owns the drag: starting it from the thumbnail would
             fight with click-to-select. The two buttons beside it are the
             route for anyone not using a pointer. -->
        <span cdkDragHandle class="cursor-move text-gray-400 hover:text-gray-700 select-none"
              aria-hidden="true"
              i18n-title="Tooltip on the grip that reorders a page by dragging@@pageOrganiser.dragHandle"
              title="Drag to reorder">⠿</span>

        <button (click)="movedEarlier.emit()" [disabled]="position === 1"
          class="nudge" [attr.aria-label]="moveEarlierLabel()">
          <span aria-hidden="true">↑</span>
        </button>
        <button (click)="movedLater.emit()" [disabled]="position === total"
          class="nudge" [attr.aria-label]="moveLaterLabel()">
          <span aria-hidden="true">↓</span>
        </button>

        <span class="font-medium text-gray-700">{{ position }}</span>
        @if (page.rotate) { <span class="text-amber-600">{{ page.rotate }}°</span> }
        @if (movedOrCopied) {
          <span i18n="Shows where a page sat before it was moved or copied@@pageOrganiser.wasPage"
                class="text-gray-400 truncate">was {{ page.sourcePage }}</span>
        }
      </div>
    </div>
  `,
  styles: [`
    /* 24px floor, per SC 2.5.8. These sit in the densest row in the panel,
       which is exactly where a target gets shaved below it. */
    .nudge {
      min-width: 24px; min-height: 24px;
      color: #6b7280; border-radius: .25rem;
    }
    .nudge:hover:not(:disabled) { background: #f3f4f6; color: #111827; }
    .nudge:disabled { opacity: .3; }
  `],
})
export class PageCardComponent {
  @Input({ required: true }) page!: DraftPage;
  /** Where this page sits now, one-based, as the reader sees it. */
  @Input({ required: true }) position!: number;
  @Input({ required: true }) total!: number;
  @Input() selected = false;
  @Input() thumbnail = "";
  /** Whether this page has been moved from its original place, or copied. */
  @Input() movedOrCopied = false;

  @Output() chosen = new EventEmitter<MouseEvent>();
  @Output() movedEarlier = new EventEmitter<void>();
  @Output() movedLater = new EventEmitter<void>();

  thumbnailLabel(): string {
    const page = this.page.sourcePage;
    return $localize`:Alternative text on a page thumbnail@@pageOrganiser.pageThumbnail:Page ${page}:page:`;
  }

  /**
   * Names the page and where it goes.
   *
   * <p>"Move up" on its own is announced identically on all forty cards,
   * which tells a reader nothing about which one they are on.
   */
  moveEarlierLabel(): string {
    const position = this.position;
    return $localize`:Button that moves a page one place earlier in the document@@pageOrganiser.moveEarlier:Move page ${position}:position: earlier`;
  }

  moveLaterLabel(): string {
    const position = this.position;
    return $localize`:Button that moves a page one place later in the document@@pageOrganiser.moveLater:Move page ${position}:position: later`;
  }
}
