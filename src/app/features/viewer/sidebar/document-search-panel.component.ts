/**
 * Searching the open document.
 *
 * <p>A result is a button, not a row: keyboard users search more than most,
 * and a result list that cannot be reached by Tab makes search itself
 * unusable.
 */
import { ChangeDetectionStrategy, Component, inject, output } from "@angular/core";
import { FormsModule } from "@angular/forms";

import { DrawingMatch } from "../../../../viewer-core/drawing-search.service";
import {
  SearchResult,
  ViewerStateService,
} from "../../../../viewer-core/viewer-state.service";

@Component({
  selector: "app-document-search-panel",
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  <div class="flex flex-col h-full">
    <div class="p-3 border-b border-gray-200">
      <div class="flex gap-1">
        <input
          [ngModel]="state.searchQuery()"
          (ngModelChange)="state.searchQuery.set($event)"
          (keydown.enter)="doSearch()"
          i18n-placeholder="@@sidebar.searchPlaceholder"
          placeholder="Search document..."
          class="flex-1 px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent" />
        <button (click)="doSearch()"
          i18n="Runs the document search. Very short — it sits beside the search box.@@sidebar.searchGo"
          class="px-2 py-1.5 text-xs bg-accent text-white rounded hover:bg-blue-700">Go</button>
      </div>
      @if (state.searchResults().length > 0) {
        <div i18n="How many search hits were found@@sidebar.searchMatchCount"
             class="text-xs text-gray-500 mt-1">
          {state.searchResults().length, plural, =1 {1 match} other {{{ state.searchResults().length }} matches}}
        </div>
      }
    </div>
    <div class="flex-1 overflow-y-auto">
      @for (result of state.searchResults(); track $index) {
        <!-- A search hit navigates the document, so it is a button.
             Keyboard users search more than most, and a result list that
             cannot be reached by Tab makes search itself unusable. -->
        <button type="button" (click)="goToSearchResult(result)"
          class="w-full text-start px-3 py-2 text-xs border-b border-gray-100 cursor-pointer hover:bg-blue-50">
          @if (state.totalPages() > 1) {
            <div i18n="Which page a search hit is on@@sidebar.searchResultPage"
                 class="font-medium text-gray-600 mb-0.5">Page {{ result.pageIndex }}</div>
          }
          <div class="text-gray-500">{{ snippetOf(result) }}</div>
        </button>
      }
      <!--
        "No matches found" is only true when there was something to look
        through. A drawing whose text has not been indexed, or an image,
        has nothing to search, and saying so is the difference between a
        document that holds no match and a viewer that cannot look.
      -->
      @if (state.searchQuery() && state.searchResults().length === 0) {
        @if (state.searchable()) {
          <div i18n="Search found nothing, in a document that does have searchable text@@sidebar.noMatches"
               class="text-center text-gray-400 text-xs py-8">No matches found</div>
        } @else {
          <div i18n="Search is impossible — a scan or a drawing with no text layer@@sidebar.notSearchable"
               class="text-center text-gray-400 text-xs py-8 px-4">
            This document has no text to search.
          </div>
        }
      }
    </div>
  </div>
  `,
})
export class DocumentSearchPanelComponent {
  /** Run the search. The shell owns the engine that answers it. */
  searchRequested = output<void>();
  /** Go to a page a match was found on. */
  pageRequested = output<number>();

  readonly state = inject(ViewerStateService);

  doSearch(): void {
    this.searchRequested.emit();
  }

  /**
   * How a result reads in the list.
   *
   * <p>A PDF match is a window cut out of the page's text, so it usually
   * begins and ends mid-sentence and is bracketed to say so. A drawing match
   * is a whole label, and bracketing it would suggest text that is not there.
   */
  snippetOf(result: SearchResult): string {
    return (result as DrawingMatch).item ? result.text : `…${result.text}…`;
  }

  /**
   * Show the match. A PDF scrolls to the page; a drawing has one sheet, so it
   * marks the hit where it sits and brings that into view instead.
   */
  goToSearchResult(result: SearchResult): void {
    this.state.searchIndex.set(result.matchIndex);

    const hit = (result as DrawingMatch).item;
    if (hit) {
      this.state.searchFocus.set(hit);
      return;
    }
    this.pageRequested.emit(result.pageIndex);
  }
}
