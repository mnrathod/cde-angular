/**
 * The markup on this document: what has been drawn and not yet saved, and
 * what has been saved already.
 *
 * <p>The two are separated deliberately. Unsaved shapes are the user's own
 * uncommitted work and can still be undone; saved annotations are records
 * other people can see. Showing them as one list would make losing the first
 * kind look the same as losing the second.
 */
import { ChangeDetectionStrategy, Component, inject, output } from "@angular/core";

import { Annotation } from "../../../core/models";
import { AnnotationService } from "../../../core/services/viewer/annotation.service";
import { abbreviatedPageLabel } from "../../../../viewer-core/page-labels";
import { ViewerStateService } from "../../../../viewer-core/viewer-state.service";

@Component({
  selector: "app-annotations-panel",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  <div class="flex-1 overflow-y-auto">
    @if (state.annotations().length === 0 && state.shapes().length === 0) {
      <div i18n="Empty state for the markup panel. The line break separates the statement from the next action.@@sidebar.noAnnotations"
           class="text-center text-gray-400 text-xs py-10 px-3">
        No annotations yet.<br>Use the toolbar to add markup.
      </div>
    }

    <!-- Unsaved shapes -->
    @if (state.dirty() && state.shapes().length > 0) {
      <div class="px-3 pt-2">
        <div class="text-xs font-semibold text-amber-600 mb-1.5 flex items-center gap-1">
          <span class="w-2 h-2 rounded-full bg-amber-400 inline-block" aria-hidden="true"></span>
          <ng-container i18n="Heading over markup drawn but not yet saved, with how many@@sidebar.unsavedCount"
            >Unsaved ({{ state.shapes().length }})</ng-container
          >
        </div>
        @for (s of state.shapes(); track s.id) {
          <div class="flex items-center gap-2 p-1.5 rounded hover:bg-gray-50 group mb-1">
            <div class="w-3 h-3 rounded-sm flex-shrink-0" [style.background]="s.color"></div>
            <span class="text-xs text-gray-600 flex-1 capitalize">{{ s.tool }}{{ s.text ? ': ' + s.text : '' }}</span>
            <span class="text-xs text-gray-400">{{ pageShort(s.pageNumber) }}</span>
            <button (click)="state.removeShape(s.id)"
              i18n-aria-label="@@sidebar.removeShape"
              aria-label="Remove this markup"
              class="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-xs ms-1">✕</button>
          </div>
        }
      </div>
    }

    <!-- Saved annotations -->
    @if (state.annotations().length > 0) {
      <div class="px-3 pt-2">
        <div i18n="Heading over markup already saved to the server, with how many@@sidebar.savedCount"
             class="text-xs font-semibold text-gray-500 mb-1.5">
          Saved ({{ state.annotations().length }})
        </div>
        @for (ann of state.annotations(); track ann.id) {
          <div class="p-2 rounded border-s-2 mb-1.5 text-xs hover:bg-gray-50 cursor-pointer"
               [style.border-inline-start-color]="colourOf(ann)"
               (click)="goToPage(ann.pageNumber)">
            <div class="flex items-center justify-between gap-1">
              <span class="font-medium text-gray-700">{{ ann.authorName }}</span>
              <span class="text-gray-400">{{ pageShort(ann.pageNumber) }}</span>
            </div>
            @if (ann.comment) {
              <div class="text-gray-500 mt-0.5 truncate">{{ ann.comment }}</div>
            }
            <div class="flex items-center justify-between mt-1">
              <span class="px-1.5 py-0.5 rounded text-xs font-semibold"
                [class]="ann.status === 'OPEN' ? 'bg-amber-100 text-amber-700'
                         : ann.status === 'RESOLVED' ? 'bg-green-100 text-green-700'
                         : 'bg-gray-100 text-gray-500'">
                {{ ann.status }}
              </span>
              @if (ann.status === 'OPEN') {
                <button (click)="resolve(ann); $event.stopPropagation()"
                  class="text-xs text-green-600 hover:text-green-700"
                  ><span aria-hidden="true">✓</span>
                  <ng-container i18n="Closes an annotation as dealt with@@sidebar.resolve"
                    >Resolve</ng-container
                  ></button>
              }
            </div>
          </div>
        }
      </div>
    }
  </div>
  `,
})
export class AnnotationsPanelComponent {
  /** Go to the page an annotation is on. */
  pageRequested = output<number>();

  readonly state = inject(ViewerStateService);
  private annotations = inject(AnnotationService);

  pageShort = abbreviatedPageLabel;

  goToPage(page: number): void {
    this.pageRequested.emit(page);
  }

  resolve(annotation: Annotation): void {
    this.annotations.resolveAnnotation(annotation.id).subscribe((updated) =>
      this.state.annotations.update((all) =>
        all.map((each) => (each.id === updated.id ? updated : each)),
      ),
    );
  }

  /**
   * The colour a saved annotation was drawn in.
   *
   * <p>Read back out of the stored shape rather than held as a column: the
   * shape is what the viewer draws, and a second copy of the colour could
   * disagree with it. An unreadable shape falls back to the default rather
   * than throwing — one corrupt record must not empty the list.
   */
  colourOf(annotation: Annotation): string {
    try {
      return JSON.parse(annotation.shapeData).color || DEFAULT_MARKUP_COLOUR;
    } catch {
      return DEFAULT_MARKUP_COLOUR;
    }
  }
}

/** What the markup tools draw in before anyone picks something else. */
const DEFAULT_MARKUP_COLOUR = "#1e5fbe";
