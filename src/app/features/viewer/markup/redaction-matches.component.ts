/**
 * What a preview found, and would destroy.
 *
 * <p>Each row was an `<li>` with a click handler — not focusable, carrying
 * no role — so jumping to a match was pointer-only. §1A.2 names this
 * exactly: never paper over a `<div>` with a click handler. They are
 * buttons, and each one says which page it goes to, because the `p3`
 * abbreviation beside it is decoration a screen reader should not read.
 */
import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, Output,
} from "@angular/core";

import { TextMatch } from "../../../core/services/redaction.service";
import { abbreviatedPageLabel } from "../../../../viewer-core/page-labels";

@Component({
  selector: "app-redaction-matches",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (matches.length) {
      <div i18n="How many occurrences the search found, above the list of them@@redaction.matchCount"
           class="text-xs font-semibold text-gray-500 mb-1">
        {matches.length, plural, =1 {1 match — this will be destroyed} other {{{ matches.length }} matches — these will be destroyed}}
      </div>
      <ul class="mb-3 max-h-40 overflow-y-auto border border-gray-100 rounded list-none p-0 m-0">
        @for (match of matches; track $index) {
          <li>
            <button type="button" (click)="chosen.emit(match.page)"
              [attr.aria-label]="goToLabel(match)"
              class="w-full text-start flex items-center gap-2 px-1.5 py-1 text-xs hover:bg-gray-50 min-h-6">
              <span class="text-gray-400 w-8 flex-shrink-0" aria-hidden="true">{{ pageShort(match.page) }}</span>
              <span class="font-mono truncate flex-1 text-gray-700">{{ match.text }}</span>
            </button>
          </li>
        }
      </ul>
    }
  `,
})
export class RedactionMatchesComponent {
  @Input({ required: true }) matches: readonly TextMatch[] = [];

  @Output() chosen = new EventEmitter<number>();

  pageShort = abbreviatedPageLabel;

  goToLabel(match: TextMatch): string {
    const page = match.page;
    const text = match.text;
    return $localize`:Button that scrolls the document to one search match@@redaction.goToMatch:Go to "${text}:text:" on page ${page}:page:`;
  }
}
