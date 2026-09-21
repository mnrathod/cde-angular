/**
 * The bar above the comparison: leave, swap, overlay, run.
 *
 * <p>`aria-label` rather than the visible text on each control: the labels
 * carry decorative glyphs, and the run button's text changes to "Analysing"
 * while the comparison is in flight, so it had no stable accessible name.
 *
 * <p>That change of text was also the only sign the comparison had started.
 * Visible text is not announced when it changes, so a reader pressed Compare
 * and heard nothing at all; `aria-busy` on the button now says so.
 */
import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, Output,
} from "@angular/core";

@Component({
  selector: "app-compare-toolbar",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-center h-12 px-4 gap-3 flex-shrink-0 text-white"
         style="background:var(--nav);box-shadow:0 2px 4px rgba(0,0,0,.15)">

      <button (click)="dismissed.emit()"
        class="bar-button">
        <span aria-hidden="true">←</span>
        <ng-container i18n="Leaves the comparison page@@compare.back">Back</ng-container>
      </button>

      <div class="flex items-center gap-2 flex-1">
        <span class="text-lg" aria-hidden="true">🔍</span>
        <span i18n="Title of the document comparison page@@compare.heading"
              class="font-semibold text-sm">Compare Documents</span>
      </div>

      <button type="button" (click)="overlayRequested.emit()" [disabled]="!bothChosen"
        i18n-aria-label="@@compare.visualLabel" aria-label="Visual compare"
        i18n-title="@@compare.visualHint" title="Open visual overlay comparison"
        class="bar-button disabled:opacity-40">
        <span aria-hidden="true">👁</span>
        <ng-container i18n="Opens the drawings side by side. Very short — it sits in a crowded bar.@@compare.visual"
          >Visual</ng-container
        >
      </button>

      <button type="button" (click)="swapRequested.emit()"
        i18n-aria-label="@@compare.swapLabel" aria-label="Swap files"
        i18n-title="@@compare.swapHint" title="Swap the two files"
        class="bar-button">
        <span aria-hidden="true">⇄</span>
        <ng-container i18n="Exchanges which document is the original and which the revision. Very short.@@compare.swap"
          >Swap</ng-container
        >
      </button>

      <button type="button" (click)="compareRequested.emit()"
        [disabled]="!bothChosen || comparing" [attr.aria-busy]="comparing ? 'true' : null"
        i18n-aria-label="@@compare.runLabel" aria-label="Compare"
        i18n-title="@@compare.runHint" title="Compare the two selected files"
        class="text-xs px-4 py-1.5 rounded font-semibold transition-colors disabled:opacity-40"
        style="background:#fff;color:var(--accent)">
        {{ comparing ? analysingLabel : compareLabel }}
      </button>
    </div>
  `,
  styles: [`
    .bar-button {
      font-size: .75rem;
      padding: .25rem .75rem;
      min-height: 24px;
      border-radius: .25rem;
      border: 1px solid rgb(255 255 255 / .3);
      background: rgb(255 255 255 / .1);
      transition: background-color .15s;
    }
    .bar-button:hover:not(:disabled) { background: rgb(255 255 255 / .2); }
  `],
})
export class CompareToolbarComponent {
  /** Both slots are filled, so there is something to compare. */
  @Input() bothChosen = false;
  @Input() comparing = false;

  @Output() dismissed = new EventEmitter<void>();
  @Output() swapRequested = new EventEmitter<void>();
  @Output() overlayRequested = new EventEmitter<void>();
  @Output() compareRequested = new EventEmitter<void>();

  /** Labels that live in expressions, so `i18n` cannot mark them. */
  readonly compareLabel = $localize`:Runs the comparison@@compare.runAction:🔍 Compare`;
  readonly analysingLabel = $localize`:Compare button while the two files are being analysed@@compare.analysing:⏳ Analysing...`;
}
