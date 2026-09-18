/**
 * The bar above an open document: what it is, who else has it open, which
 * page you are on, and the way back.
 */
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  output,
} from "@angular/core";

import { CollaborationService } from "../../core/services/collaboration.service";
import { IconComponent } from "../../../viewer-core/icon.component";
import { ViewerStateService } from "../../../viewer-core/viewer-state.service";

@Component({
  selector: "app-viewer-top-bar",
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-center h-11 px-3 gap-2 flex-shrink-0 text-white"
         style="background:var(--nav);box-shadow:0 2px 4px rgba(0,0,0,.15)">
      <button type="button" (click)="backRequested.emit()"
        i18n-title="@@viewerShell.backHint" title="Back to documents"
        class="h-7 px-2.5 inline-flex items-center gap-1.5 text-xs rounded-md
               bg-white/10 hover:bg-white/20 transition-colors">
        <app-icon name="arrow-left" [size]="15" />
        <span i18n="Leaves the viewer and returns to the document list@@viewerShell.back">Back</span>
      </button>

      <div class="flex items-center gap-2 flex-1 min-w-0">
        <span class="font-semibold text-sm truncate">{{ state.viewerData()?.name || loadingLabel }}</span>
        @if (state.viewerData()?.revision) {
          <span i18n="The document's revision identifier, abbreviated to fit the title bar@@viewerShell.revision"
                class="text-xs px-2 py-0.5 rounded bg-white/20">Rev {{ state.viewerData()?.revision }}</span>
        }
        @if (state.viewerData()?.drawingNumber) {
          <span class="text-xs text-white/70">{{ state.viewerData()?.drawingNumber }}</span>
        }
      </div>

      <!-- Who else is viewing this document -->
      @if (collaboration.others().length) {
        <div class="flex items-center -space-x-1.5 me-1"
             [title]="presenceTitle()">
          @for (participant of collaboration.others(); track participant.username) {
            <span class="w-6 h-6 rounded-full flex items-center justify-center
                         text-[10px] font-bold text-white border-2 border-white/70"
                  [style.background]="participant.colour">
              {{ initialsOf(participant.username) }}
            </span>
          }
        </div>
      }
      @if (collaboration.connected()) {
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 me-1"
              i18n-title="Tooltip on the indicator that real-time collaboration is connected@@viewerShell.liveHint"
              title="Live — changes from others appear as they happen"></span>
      }

      <!-- Page navigation (PDF only) -->
      @if (state.totalPages() > 1) {
        <div class="flex items-center gap-1 text-xs">
          <button type="button" (click)="state.navigateTo(state.currentPage()-1)"
            [disabled]="state.currentPage() <= 1"
            i18n-title="@@viewerShell.previousPage" title="Previous page"
            i18n-aria-label="@@viewerShell.previousPageLabel" aria-label="Previous page"
            class="w-7 h-7 inline-flex items-center justify-center rounded-md
                   bg-white/10 hover:bg-white/20 disabled:opacity-30">
            <app-icon name="chevron-left" [size]="15" />
          </button>
          <span class="w-20 text-center tabular-nums">{{ state.currentPage() }} / {{ state.totalPages() }}</span>
          <button type="button" (click)="state.navigateTo(state.currentPage()+1)"
            [disabled]="state.currentPage() >= state.totalPages()"
            i18n-title="@@viewerShell.nextPage" title="Next page"
            i18n-aria-label="@@viewerShell.nextPageLabel" aria-label="Next page"
            class="w-7 h-7 inline-flex items-center justify-center rounded-md
                   bg-white/10 hover:bg-white/20 disabled:opacity-30">
            <app-icon name="chevron-right" [size]="15" />
          </button>
        </div>
      }

      <!-- Toggle sidebar -->
      <button type="button" (click)="state.sidebarOpen.update(v => !v)"
        [title]="state.sidebarOpen() ? hideSidebarHint : showSidebarHint"
        [attr.aria-pressed]="state.sidebarOpen()"
        class="w-7 h-7 inline-flex items-center justify-center rounded-md
               bg-white/10 hover:bg-white/20">
        <app-icon name="panel" [size]="15" />
      </button>
    </div>
  `,
})
export class ViewerTopBarComponent {
  /** Leave the viewer and go back to the document list. */
  backRequested = output<void>();

  readonly state = inject(ViewerStateService);
  readonly collaboration = inject(CollaborationService);

  readonly loadingLabel = $localize`:Stands in for the document title until it has loaded@@viewerShell.loadingTitle:Loading...`;
  readonly hideSidebarHint = $localize`:Tooltip on the control that closes the side panel@@viewerShell.hideSidebar:Hide side panel`;
  readonly showSidebarHint = $localize`:Tooltip on the control that opens the side panel@@viewerShell.showSidebar:Show side panel`;

  /** Who else has this document open, for the tooltip on their avatars. */
  presenceTitle(): string {
    const names = this.collaboration
      .others()
      .map((participant) => participant.username)
      .join(", ");
    return $localize`:Tooltip listing the other people with this document open@@viewerShell.alsoViewing:${names}:names: also viewing`;
  }

  /** Two letters for an avatar bubble, which has room for no more. */
  initialsOf(username: string): string {
    return username.slice(0, 2).toUpperCase();
  }
}
