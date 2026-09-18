/**
 * What the comparison found, grouped by the kind of thing that changed.
 */
import { ChangeDetectionStrategy, Component, computed, input } from "@angular/core";

import { ChangeItem, CompareResult } from "../../core/models";

@Component({
  selector: "app-change-list",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex-1 overflow-y-auto p-5 min-w-0">
      @if (!result()) {
        <div
          class="flex flex-col items-center justify-center h-full text-gray-400"
        >
          <div class="text-5xl mb-4" aria-hidden="true">🔍</div>
          <div i18n="Empty state for the comparison page@@compare.empty"
               class="font-semibold mb-1">
            Select two documents to compare
          </div>
          <div i18n="Which file kinds can be compared. The names are file formats and stay as they are.@@compare.supportedFormats"
               class="text-sm">
            Supports DXF · DWG · IFC · PDF · Office · Images
          </div>
        </div>
      }

      @if (result(); as r) {
        <!-- Overall banner -->
        <div
          class="flex items-center gap-3 p-3 rounded-lg mb-4 border"
          [class]="
            r.overall === 'identical'
              ? 'bg-green-50 border-green-200'
              : r.totalChanges > 5
                ? 'bg-red-50 border-red-200'
                : 'bg-amber-50 border-amber-200'
          "
        >
          <span class="text-2xl">{{
            r.overall === "identical"
              ? "✅"
              : r.totalChanges > 5
                ? "🔴"
                : "🟡"
          }}</span>
          <div>
            <div class="font-semibold text-sm">
              {{ r.overall === "identical" ? identicalLabel : changedLabel }}
            </div>
            <div class="text-xs text-gray-500">
              {{ comparisonSubtitle(r) }}
            </div>
          </div>
        </div>

        <!-- Warning -->
        @if (r.warning) {
          <div
            class="p-3 bg-amber-50 border border-amber-200 rounded-lg mb-4 text-xs text-amber-800 whitespace-pre-wrap"
          >
            ⚠️ {{ r.warning }}
          </div>
        }

        <!-- Stats -->
        @if (r.totalChanges > 0) {
          <div class="flex gap-3 mb-4 flex-wrap">
            <div
              class="bg-white rounded border border-gray-200 px-4 py-2 text-center min-w-16"
            >
              <div class="text-xl font-bold font-mono text-accent">
                {{ r.totalChanges }}
              </div>
              <div i18n="How many differences were found altogether. Very short — it labels a number in a small tile.@@compare.totalChanges"
                   class="text-xs text-gray-500">Total</div>
            </div>
            <div
              class="bg-white rounded border border-gray-200 px-4 py-2 text-center min-w-16"
            >
              <div class="text-xl font-bold font-mono text-green-600">
                +{{ r.added }}
              </div>
              <div i18n="How many things exist in the revision but not the original. Very short — it labels a number in a small tile.@@compare.addedChanges"
                   class="text-xs text-gray-500">Added</div>
            </div>
            <div
              class="bg-white rounded border border-gray-200 px-4 py-2 text-center min-w-16"
            >
              <div class="text-xl font-bold font-mono text-red-600">
                -{{ r.removed }}
              </div>
              <div i18n="How many things existed in the original but not the revision. Very short — it labels a number in a small tile.@@compare.removedChanges"
                   class="text-xs text-gray-500">Removed</div>
            </div>
          </div>

          <!-- Changes by category -->
          @for (group of groupedChanges(); track group.category) {
            <div class="mb-4">
              <div
                class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2"
              >
                {{ group.category }}
              </div>
              <div class="space-y-1.5">
                @for (c of group.items; track c.change) {
                  <div
                    class="flex items-start gap-3 p-2.5 rounded-md text-sm"
                    [class]="
                      c.type === 'added'
                        ? 'bg-green-50 border-s-2 border-green-500'
                        : c.type === 'removed'
                          ? 'bg-red-50 border-s-2 border-red-500'
                          : 'bg-amber-50 border-s-2 border-amber-500'
                    "
                  >
                    <span class="text-base flex-shrink-0">{{
                      c.icon
                    }}</span>
                    <div class="flex-1 min-w-0">
                      <div class="font-medium text-gray-800">
                        {{ c.change }}
                        <span
                          class="ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-semibold"
                          [class]="
                            c.severity === 'high'
                              ? 'text-red-600 bg-red-100'
                              : c.severity === 'medium'
                                ? 'text-amber-600 bg-amber-100'
                                : 'text-gray-500 bg-gray-100'
                          "
                        >
                          {{ c.severity }}
                        </span>
                      </div>
                      @if (c.detail) {
                        <div class="text-xs text-gray-500 mt-0.5">
                          {{ c.detail }}
                        </div>
                      }
                    </div>
                  </div>
                }
              </div>
            </div>
          }
        }
      }
    </div>
  `,
})
export class ChangeListComponent {
  /** The comparison, or null before one has been run. */
  result = input<CompareResult | null>(null);

  readonly identicalLabel = $localize`:Result banner when the two documents match@@compare.identical:Files are identical`;
  readonly changedLabel = $localize`:Result banner when the two documents differ@@compare.changed:Changes detected`;

  /** Names the two documents being compared, and what kind they are. */
  comparisonSubtitle(result: CompareResult): string {
    return $localize`:Subtitle under the comparison result, naming the two documents and the file type they share@@compare.subtitle:${result.doc1Name}:first: vs ${result.doc2Name}:second: · ${result.fileType}:fileType:`;
  }

  /**
   * The changes by category.
   *
   * <p>A change the server sent without one still has to appear: dropping it
   * would lose a real difference between two documents, which is the one
   * thing this screen exists to show.
   */
  groupedChanges = computed(() => {
    const comparison = this.result();
    if (!comparison) return [];

    const byCategory = new Map<string, ChangeItem[]>();
    for (const change of comparison.changes) {
      const category = change.category || "OTHER";
      const existing = byCategory.get(category);
      if (existing) existing.push(change);
      else byCategory.set(category, [change]);
    }
    return [...byCategory.entries()].map(([category, items]) => ({
      category,
      items,
    }));
  });
}
