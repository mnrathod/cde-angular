/**
 * The comparison's command bar and its "what am I looking at" row.
 *
 * <p>Together because they answer one question between them — which two
 * documents, shown which way, on which page — and because they were more
 * than half of a 372-line component that also had to render three canvases.
 */
import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, Output,
} from "@angular/core";
import { FormsModule } from "@angular/forms";

import { Document } from "../../../core/models";

export type CompareMode = "side-by-side" | "slider" | "overlay";

/**
 * The three ways of comparing two drawings.
 *
 * <p>`$localize` rather than plain strings: labels in a lookup table are
 * invisible to the template markup guard. They sit in a crowded toolbar, so
 * the descriptions ask for short translations.
 */
export const COMPARE_MODES: readonly { id: CompareMode; icon: string; label: string }[] = [
  { id: "side-by-side", icon: "⊟",
    label: $localize`:Comparison mode — the two drawings in adjacent panels. Short; it sits in a crowded toolbar.@@compareMode.sideBySide:Side by Side` },
  { id: "slider", icon: "⇔",
    label: $localize`:Comparison mode — one drawing revealed over the other by dragging. Short; it sits in a crowded toolbar.@@compareMode.slider:Slider` },
  { id: "overlay", icon: "⊕",
    label: $localize`:Comparison mode — the two drawings stacked, differences highlighted. Short; it sits in a crowded toolbar.@@compareMode.overlay:Overlay` },
];

@Component({
  selector: "app-visual-compare-header",
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-center h-11 px-4 gap-3 flex-shrink-0 text-white"
         style="background:var(--nav);box-shadow:0 2px 4px rgba(0,0,0,.2)">
      <button (click)="backRequested.emit()"
        class="text-xs px-3 py-1 rounded border border-white/30 bg-white/10 hover:bg-white/20">
        <span aria-hidden="true">←</span>
        <ng-container i18n="Leaves the comparison view@@visualCompare.back">Back</ng-container>
      </button>
      <h1 i18n="Title of the side-by-side drawing comparison view@@visualCompare.heading"
          class="font-semibold text-sm">Visual Comparison</h1>

      <div class="flex gap-1 ms-4" role="group"
           i18n-aria-label="Names the group of buttons choosing how the two drawings are compared@@visualCompare.modeGroup"
           aria-label="Comparison mode">
        @for (option of modes; track option.id) {
          <button (click)="modeChosen.emit(option.id)"
            class="text-xs px-3 py-1 rounded transition-all"
            [attr.aria-pressed]="mode === option.id"
            [class]="mode === option.id
              ? 'bg-white text-nav font-semibold'
              : 'border border-white/30 bg-white/10 hover:bg-white/20'">
            <span aria-hidden="true">{{ option.icon }}</span> {{ option.label }}
          </button>
        }
      </div>

      <div class="flex-1"></div>

      @if (totalPages > 1) {
        <div class="flex items-center gap-1 text-xs">
          <button (click)="pageChanged.emit(currentPage - 1)" [disabled]="currentPage <= 1"
            i18n-aria-label="@@visualCompare.previousPage" aria-label="Previous page"
            class="px-2 py-1 rounded border border-white/30 bg-white/10 disabled:opacity-30">‹</button>
          <span class="w-20 text-center">{{ currentPage }} / {{ totalPages }}</span>
          <button (click)="pageChanged.emit(currentPage + 1)" [disabled]="currentPage >= totalPages"
            i18n-aria-label="@@visualCompare.nextPage" aria-label="Next page"
            class="px-2 py-1 rounded border border-white/30 bg-white/10 disabled:opacity-30">›</button>
        </div>
      }

      @if (mode === 'overlay') {
        <div class="flex items-center gap-2 text-xs">
          <label i18n="How strongly the revised drawing shows through the original@@visualCompare.opacity"
                 class="text-white/70" for="overlay-opacity">Opacity</label>
          <input id="overlay-opacity" type="range" min="0" max="100"
                 [ngModel]="overlayOpacity" (ngModelChange)="overlayOpacityChanged.emit($event)"
                 class="w-20 accent-white" />
          <span class="w-8">{{ overlayOpacity }}%</span>
        </div>
      }
    </div>

    <div class="flex items-center px-4 py-2 gap-4 flex-shrink-0"
         style="background:rgba(0,0,0,.3)">
      <div class="flex items-center gap-2 text-sm">
        <div class="w-3 h-3 rounded-sm bg-blue-400" aria-hidden="true"></div>
        <span i18n="Names the first of the two documents being compared@@visualCompare.file1"
              class="text-white/80">File 1:</span>
        <span class="text-white font-medium">{{ original?.name || unnamedLabel }}</span>
        @if (original?.revision) {
          <span i18n="The document's revision identifier, abbreviated@@visualCompare.revision1"
                class="text-white/50 text-xs">Rev {{ original!.revision }}</span>
        }
      </div>
      @if (mode !== 'overlay') {
        <div class="w-px h-4 bg-white/20" aria-hidden="true"></div>
      }
      <div class="flex items-center gap-2 text-sm">
        <div class="w-3 h-3 rounded-sm bg-amber-400" aria-hidden="true"></div>
        <span i18n="Names the second of the two documents being compared@@visualCompare.file2"
              class="text-white/80">File 2:</span>
        <span class="text-white font-medium">{{ revised?.name || unnamedLabel }}</span>
        @if (revised?.revision) {
          <span i18n="The document's revision identifier, abbreviated@@visualCompare.revision2"
                class="text-white/50 text-xs">Rev {{ revised!.revision }}</span>
        }
      </div>
    </div>
  `,
})
export class VisualCompareHeaderComponent {
  @Input() mode: CompareMode = "side-by-side";
  @Input() original: Document | null = null;
  @Input() revised: Document | null = null;
  @Input() currentPage = 1;
  @Input() totalPages = 1;
  @Input() overlayOpacity = 50;

  @Output() backRequested = new EventEmitter<void>();
  @Output() modeChosen = new EventEmitter<CompareMode>();
  @Output() pageChanged = new EventEmitter<number>();
  @Output() overlayOpacityChanged = new EventEmitter<number>();

  readonly modes = COMPARE_MODES;

  /** Shown where a document has no name, in place of a bare dash. */
  readonly unnamedLabel = $localize`:Stands in for a compared document that has no name@@visualCompare.unnamed:Untitled`;
}
