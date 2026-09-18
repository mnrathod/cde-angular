/**
 * The written summary of a comparison, produced by the server's model.
 *
 * <p>Rendered line by line from a parsed report rather than as a string of
 * HTML: model output is untrusted input (§10.1), and `innerHTML` with it is
 * the exact thing §5.12 A03 bans.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from "@angular/core";

import { problemMessage } from "../../core/handlers/problem-detail";
import { CompareResult } from "../../core/models";
import { CompareService } from "../../core/services/compare.service";
import { parseComparisonReport } from "./comparison-report";

@Component({
  selector: "app-comparison-summary",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="border-s border-gray-200 bg-white flex flex-col flex-shrink-0"
      style="width:600px"
    >
      <div
        class="flex items-center gap-2 px-4 py-3 border-b border-gray-200 bg-gray-50 flex-shrink-0"
      >
        <span aria-hidden="true">✨</span>
        <span i18n="Heading of the panel holding a model-written review of the differences@@compare.aiHeading"
              class="font-semibold text-sm flex-1">AI Summary</span>
        @if (aiLoading()) {
          <div
            class="w-4 h-4 border-2 border-blue-200 border-t-accent rounded-full animate-spin"
          ></div>
        }
      </div>

      <div class="flex-1 overflow-y-auto min-h-0">
        @if (!result()) {
          <div
            class="flex flex-col items-center justify-center h-full text-gray-400 p-6 text-center"
          >
            <div class="text-4xl mb-3" aria-hidden="true">🤖</div>
            <div i18n="Empty state for the AI panel, before any comparison has been run@@compare.aiBeforeCompare"
                 class="text-sm">
              Run a comparison then generate an AI-powered engineering
              review.
            </div>
          </div>
        } @else if (aiText()) {
          <!-- Rendered line by line rather than as a string of HTML. See
               comparison-report.ts for why. -->
          <div class="p-4 text-sm leading-relaxed text-gray-700">
            @for (line of reportLines(); track $index) {
              @switch (line.kind) {
                @case ("section") {
                  <h3
                    class="flex items-center gap-1.5 mt-3 mb-1 pb-1 border-b border-gray-200
                           text-xs font-semibold uppercase tracking-wide text-accent"
                  >
                    <span aria-hidden="true">{{ line.icon }}</span>
                    {{ line.text }}
                  </h3>
                }
                @case ("request") {
                  <div
                    class="my-1 py-1.5 px-2.5 rounded-sm text-xs bg-amber-50 border-s-4 border-amber-500"
                  >
                    <strong class="text-amber-700">{{ line.reference }}</strong
                    >@if (line.detail) { — {{ line.detail }} }
                  </div>
                }
                @case ("bullet") {
                  <div class="flex gap-1.5 my-0.5 text-xs">
                    <span class="text-accent flex-shrink-0" aria-hidden="true">▸</span>
                    <span>{{ line.text }}</span>
                  </div>
                }
                @case ("paragraph") {
                  <p class="my-0.5 text-xs">{{ line.text }}</p>
                }
                @default {
                  <div class="h-1"></div>
                }
              }
            }
          </div>
        } @else {
          <div
            class="flex flex-col items-center justify-center h-full text-gray-400 p-6 text-center"
          >
            <div class="text-3xl mb-3" aria-hidden="true">🤖</div>
            <div i18n="Offers the AI review once a comparison exists. An RFI is a Request For Information, a formal query raised on a construction project.@@compare.aiOffer"
                 class="text-sm mb-4">
              Generate an AI-powered review with revision summary, impacted
              disciplines, review comments and RFIs.
            </div>
          </div>
        }
      </div>

      @if (result() && !aiLoading()) {
        <div class="p-3 border-t border-gray-200 flex-shrink-0">
          <button
            (click)="generate()"
            class="w-full flex items-center justify-center gap-2 py-2 rounded border border-blue-200 bg-blue-50 text-accent text-sm font-medium hover:bg-blue-100 transition-colors"
          >
            <span aria-hidden="true">✨</span> {{ actionLabel() }}
          </button>
        </div>
      }
    </div>
  `,
})
export class ComparisonSummaryComponent {
  /** The comparison to summarise, or null before one has been run. */
  result = input<CompareResult | null>(null);

  private compareService = inject(CompareService);

  aiText = signal("");
  aiLoading = signal(false);

  /** The report as lines to render; empty until one has been generated. */
  reportLines = computed(() => parseComparisonReport(this.aiText()));

  /**
   * Two whole messages rather than "Regenerate Summary" assembled from a
   * prefix: the verb and the noun agree differently in other languages, and
   * a ternary in the template is invisible to the markup sweep besides.
   */
  actionLabel = computed(() =>
    this.aiText()
      ? $localize`:Produces a fresh written summary, replacing the one on screen@@compare.regenerateSummary:Regenerate Summary`
      : $localize`:Produces a written summary of the comparison@@compare.generateSummary:AI Summary`,
  );

  /** Drops a summary written about a different pair of documents. */
  forget(): void {
    this.aiText.set("");
  }

  generate(): void {
    const comparison = this.result();
    if (!comparison || this.aiLoading()) return;

    this.aiLoading.set(true);
    this.aiText.set("");

    // Facts, not a prompt. The prompt, the model and the token ceiling are
    // the server's to decide: this used to assemble the whole thing here and
    // POST it to an endpoint that forwarded it verbatim to a third party, so
    // a browser chose what the deployment spent and no filter was possible
    // on the way out.
    this.compareService.getComparisonReport(comparison).subscribe({
      next: (response) => {
        this.aiText.set(response.report);
        this.aiLoading.set(false);
      },
      error: (err: unknown) => {
        this.aiText.set(
          problemMessage(
            err,
            $localize`:Shown when the AI summary of a comparison could not be produced. The comparison result itself is still on screen.@@compare.summaryFailed:The summary could not be produced. The comparison itself is unaffected.`,
          ),
        );
        this.aiLoading.set(false);
      },
    });
  }
}
