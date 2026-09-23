/**
 * The redaction areas someone drew by hand.
 *
 * <p>Each row's remove control had the same two defects as the reply one:
 * `opacity-0 group-hover:opacity-100` with nothing for focus, so tabbing to
 * it put focus on something invisible (SC 2.4.7), and `✕` as its whole
 * content, so that glyph was its accessible name on every row alike.
 */
import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, Output,
} from "@angular/core";

import { RedactionRegion } from "../../../../viewer-core/viewer-state.service";

@Component({
  selector: "app-redaction-regions",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div i18n="Heading for redaction areas drawn by hand, as opposed to found by search@@redaction.drawnHeading"
         class="text-xs font-semibold text-gray-500 mb-1.5 pt-2 border-t border-gray-100">
      Drawn regions
    </div>
    <p i18n="How to draw a redaction area. The two emphasised names must match the toolbar labels.@@redaction.drawnInstructions"
       class="text-xs text-gray-500 mb-2">
      Pick the <span class="font-medium">Redact</span> tool and draw over content, then
      <span class="font-medium">Apply Redaction</span> in the toolbar.
    </p>

    @if (regions.length === 0) {
      <div i18n="@@redaction.noRegions" class="text-center text-gray-400 text-xs py-4">No regions drawn yet.</div>
    } @else {
      <ul class="list-none m-0 p-0">
        @for (region of regions; track region.id) {
          <li class="flex items-center gap-2 p-1.5 rounded hover:bg-gray-50 group mb-1 border border-gray-100">
            <div class="w-3 h-3 rounded-sm bg-black flex-shrink-0" aria-hidden="true"></div>
            <span i18n="One drawn redaction area — which page it is on and how big it is in points@@redaction.regionSummary"
                  class="text-xs text-gray-600 flex-1">
              Page {{ region.page }} · {{ region.width.toFixed(0) }}×{{ region.height.toFixed(0) }}pt
            </span>
            <button type="button" (click)="removed.emit(region.id)"
              [attr.aria-label]="removeLabel(region)" [title]="removeLabel(region)"
              class="remove"><span aria-hidden="true">✕</span></button>
          </li>
        }
      </ul>
    }
  `,
  styles: [`
    .remove {
      min-width: 24px; min-height: 24px;
      opacity: 0; color: #f87171; border-radius: .25rem;
      transition: opacity .15s, color .15s;
    }
    /* Separate rules on purpose: a browser that does not know
       :focus-visible drops the whole comma-grouped selector with it, and
       the plain :focus fallback is the one that must survive. */
    .group:hover .remove { opacity: 1; }
    .remove:focus { opacity: 1; }
    .remove:focus-visible { opacity: 1; }
    .remove:hover { color: #dc2626; }
  `],
})
export class RedactionRegionsComponent {
  @Input({ required: true }) regions: readonly RedactionRegion[] = [];

  @Output() removed = new EventEmitter<string>();

  /**
   * Names the region each control removes.
   *
   * <p>"Remove this region" is announced identically on every row, which
   * tells a reader nothing about which of them they are about to discard.
   */
  removeLabel(region: RedactionRegion): string {
    const page = region.page;
    return $localize`:Button that discards one drawn redaction area, naming the page it is on@@redaction.removeRegionOn:Remove the region drawn on page ${page}:page:`;
  }
}
