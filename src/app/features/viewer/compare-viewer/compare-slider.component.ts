/**
 * Two drawings stacked, with one revealed over the other by a wipe.
 *
 * <p>The wipe was a bare `<div>` driven by mousemove and touchmove, with no
 * keyboard route to it at all — so the entire slider comparison was
 * unusable without a pointer. WCAG 2.2 SC 2.5.7 requires a single-pointer
 * alternative to every drag, and §1A.2 makes an accessibility defect a
 * functional defect at the same severity.
 *
 * <p>It is now a range input. That is not a workaround: a range is the
 * native control for "pick a position along an axis", so it arrives with
 * arrow keys, Home and End, a value announced as a percentage, and a
 * visible focus ring, none of which the div had. The visual handle is drawn
 * over it and the input itself is transparent, so the appearance is
 * unchanged.
 */
import {
  ChangeDetectionStrategy, Component, ElementRef, Input, ViewChild, signal,
} from "@angular/core";

/** Where the wipe sits before a drawing has said how wide it is. */
const DEFAULT_WIPE_PERCENT = 50;

@Component({
  selector: "app-compare-slider",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex-1 overflow-auto flex items-center justify-center p-4"
         style="background:#2a2d3a">
      <div class="relative inline-block shadow-2xl select-none">
        <!-- Base: the revised drawing -->
        <canvas #revisedCanvas class="block"></canvas>

        <!-- The original, clipped to the wipe -->
        <div class="absolute top-0 left-0 overflow-hidden h-full"
             [style.width.%]="wipePercent()">
          <canvas #originalCanvas class="block"></canvas>
        </div>

        <!-- The handle, drawn where the wipe is. Decorative: the range
             input below is the control. -->
        <div class="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg flex items-center justify-center pointer-events-none"
             [style.left.%]="wipePercent()"
             aria-hidden="true">
          <div class="w-6 h-8 rounded-full bg-white shadow-lg flex items-center justify-center text-gray-600 text-xs font-bold">
            ⇔
          </div>
        </div>

        <!-- The control itself: invisible, full width, and everything a
             range gives for free. -->
        <input
          type="range" min="0" max="100" step="1"
          class="wipe absolute inset-0 w-full h-full cursor-ew-resize"
          [value]="wipePercent()"
          (input)="onWipe($event)"
          i18n-aria-label="Control that wipes between the two drawings being compared@@visualCompare.wipeLabel"
          aria-label="Reveal the original drawing over the revised one"
        />

        <div i18n="Labels the earlier drawing, slider view@@visualCompare.originalSlider"
             class="absolute top-2 start-2 text-xs text-blue-200 bg-blue-900/60 px-2 py-0.5 rounded pointer-events-none">
          ORIGINAL
        </div>
        <div i18n="Labels the later drawing, slider view@@visualCompare.revisedSlider"
             class="absolute top-2 end-2 text-xs text-amber-200 bg-amber-900/60 px-2 py-0.5 rounded pointer-events-none">
          REVISED
        </div>
      </div>
    </div>
  `,
  styles: [`
    /* The range is the control but the handle above is what is seen, so the
       input's own chrome is removed and only its behaviour kept. The focus
       ring is restored explicitly — an invisible control with no visible
       focus is worse than a visible one (§1A.2). */
    .wipe { appearance: none; background: transparent; margin: 0; }
    .wipe::-webkit-slider-thumb { appearance: none; width: 24px; height: 32px; }
    .wipe::-moz-range-thumb { width: 24px; height: 32px; border: 0; background: transparent; }
    .wipe:focus-visible { outline: 3px solid #fff; outline-offset: 2px; }
  `],
})
export class CompareSliderComponent {
  @ViewChild("originalCanvas") originalCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild("revisedCanvas") revisedCanvas!: ElementRef<HTMLCanvasElement>;

  /** Where the wipe sits, as a percentage of the drawing's width. */
  readonly wipePercent = signal(DEFAULT_WIPE_PERCENT);

  /** Set by the parent when a comparison is reset to a new page. */
  @Input() set resetToken(_token: number) {
    this.wipePercent.set(DEFAULT_WIPE_PERCENT);
  }

  onWipe(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.wipePercent.set(Number.isFinite(value) ? value : DEFAULT_WIPE_PERCENT);
  }
}
