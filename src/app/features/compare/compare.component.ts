import {
  Component,
  signal,
  inject,
  OnInit,
  computed,
  ChangeDetectionStrategy,
} from "@angular/core";
import { Router } from "@angular/router";
import { CommonModule } from "@angular/common";
import { CompareService } from "../../core/services/compare.service";
import { DocumentService } from "../../core/services/document.service";
import { ProjectService } from "../../core/services/project.service";
import { Document, CompareResult, ChangeItem } from "../../core/models";
import { problemMessage } from "../../core/handlers/problem-detail";
import { parseComparisonReport } from "./comparison-report";

@Component({
  selector: "app-compare",
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div
      class="fixed inset-0 flex flex-col"
      style="background:var(--bg);z-index:700"
    >
      <!-- Top bar -->
      <div
        class="flex items-center h-12 px-4 gap-3 flex-shrink-0 text-white"
        style="background:var(--nav);box-shadow:0 2px 4px rgba(0,0,0,.15)"
      >
        <button
          (click)="goBack()"
          class="text-xs px-3 py-1 rounded border border-white/30 bg-white/10 hover:bg-white/20 transition-colors"
        >
          <span aria-hidden="true">←</span>
          <ng-container i18n="Leaves the comparison page@@compare.back">Back</ng-container>
        </button>
        <div class="flex items-center gap-2 flex-1">
          <span class="text-lg" aria-hidden="true">🔍</span>
          <span i18n="Title of the document comparison page@@compare.heading"
                class="font-semibold text-sm">Compare Documents</span>
        </div>
        <button
          type="button"
          (click)="openVisualCompare()"
          [disabled]="!doc1() || !doc2()"
          i18n-aria-label="@@compare.visualLabel" aria-label="Visual compare"
          class="text-xs px-3 py-1 rounded border border-white/30 bg-white/10 hover:bg-white/20 disabled:opacity-40"
          i18n-title="@@compare.visualHint" title="Open visual overlay comparison"
        >
          <span aria-hidden="true">👁</span>
          <ng-container i18n="Opens the drawings side by side. Very short — it sits in a crowded bar.@@compare.visual"
            >Visual</ng-container
          >
        </button>
        <button
          type="button"
          (click)="swapFiles()"
          i18n-aria-label="@@compare.swapLabel" aria-label="Swap files"
          i18n-title="@@compare.swapHint" title="Swap the two files"
          class="text-xs px-3 py-1 rounded border border-white/30 bg-white/10 hover:bg-white/20"
        >
          <span aria-hidden="true">⇄</span>
          <ng-container i18n="Exchanges which document is the original and which the revision. Very short.@@compare.swap"
            >Swap</ng-container
          >
        </button>
        <!--
          aria-label rather than relying on the visible text: the label carries a
          decorative glyph and changes to "Analysing..." while the comparison
          runs, so the button had no stable accessible name at all.
        -->
        <button
          type="button"
          (click)="runCompare()"
          [disabled]="!doc1() || !doc2() || comparing()"
          i18n-aria-label="@@compare.runLabel" aria-label="Compare"
          i18n-title="@@compare.runHint" title="Compare the two selected files"
          class="text-xs px-4 py-1.5 rounded font-semibold transition-colors disabled:opacity-40"
          style="background:#fff;color:var(--accent)"
        >
          {{ comparing() ? analysingLabel : compareLabel }}
        </button>
      </div>

      <!-- File selector bar -->
      <div
        class="flex items-center gap-3 px-4 py-2 bg-white border-b border-gray-200 flex-shrink-0"
      >
        <!-- A button, not a div with a click handler: this is the control that
             chooses a file, so it needs to be reachable by Tab and operable by
             Enter and Space without a directive re-implementing what the
             element already does (1A.2). text-start because a button centres
             its content by default and this one holds a left-aligned card. -->
        <button
          type="button"
          (click)="pickFile(1)"
          class="flex-1 border-2 rounded-lg p-3 cursor-pointer transition-all min-w-0 text-start"
          [class]="
            doc1()
              ? 'border-accent bg-blue-50'
              : 'border-dashed border-gray-300 hover:border-accent'
          "
        >
          <div
            class="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1"
          >
            <span aria-hidden="true">📄</span>
            <ng-container i18n="Labels the first slot — the earlier document@@compare.file1Heading"
              >File 1 — Original</ng-container
            >
          </div>
          <div class="font-medium text-sm truncate">
            {{ doc1()?.name || chooseFileLabel }}
          </div>
          @if (doc1()) {
            <div class="text-xs text-gray-500 mt-0.5">
              {{ doc1()!.fileName }}
              {{ doc1()!.revision ? revisionSuffix(doc1()!.revision!) : "" }}
            </div>
          }
        </button>

        <div
          class="text-xs font-bold text-gray-500 px-2 py-1 bg-gray-100 rounded-full flex-shrink-0"
        >
          <ng-container i18n="Separates the two documents being compared. Very short — it sits in a small pill between them.@@compare.versus"
            >VS</ng-container
          >
        </div>

        <!-- A button, not a div with a click handler: this is the control that
             chooses a file, so it needs to be reachable by Tab and operable by
             Enter and Space without a directive re-implementing what the
             element already does (1A.2). text-start because a button centres
             its content by default and this one holds a left-aligned card. -->
        <button
          type="button"
          (click)="pickFile(2)"
          class="flex-1 border-2 rounded-lg p-3 cursor-pointer transition-all min-w-0 text-start"
          [class]="
            doc2()
              ? 'border-accent bg-blue-50'
              : 'border-dashed border-gray-300 hover:border-accent'
          "
        >
          <div
            class="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1"
          >
            <span aria-hidden="true">📄</span>
            <ng-container i18n="Labels the second slot — the later document@@compare.file2Heading"
              >File 2 — Revised</ng-container
            >
          </div>
          <div class="font-medium text-sm truncate">
            {{ doc2()?.name || chooseFileLabel }}
          </div>
          @if (doc2()) {
            <div class="text-xs text-gray-500 mt-0.5">
              {{ doc2()!.fileName }}
              {{ doc2()!.revision ? revisionSuffix(doc2()!.revision!) : "" }}
            </div>
          }
        </button>
      </div>

      <!-- Body: change list + AI sidebar -->
      <div class="flex flex-1 overflow-hidden min-h-0">
        <!-- Change list -->
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

        <!-- AI Sidebar (600px) -->
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
                (click)="generateAI()"
                class="w-full flex items-center justify-center gap-2 py-2 rounded border border-blue-200 bg-blue-50 text-accent text-sm font-medium hover:bg-blue-100 transition-colors"
              >
                ✨ {{ aiText() ? "Regenerate Summary" : "AI Summary" }}
              </button>
            </div>
          }
        </div>
      </div>
    </div>

    <!-- Document picker modal -->
    @if (showPicker()) {
      <div
        class="fixed inset-0 bg-black/60 backdrop-blur-sm z-[800] flex items-center justify-center"
      >
        <div
          class="bg-white rounded-lg shadow-2xl w-96 max-h-[70vh] flex flex-col"
        >
          <div
            class="flex items-center justify-between p-4 border-b border-gray-200"
          >
            <span class="font-semibold text-sm"
              >{{ pickerHeading() }}</span
            >
            <button
              (click)="showPicker.set(false)"
              class="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
          <div class="overflow-y-auto flex-1 p-2">
            @for (doc of docs(); track doc.id) {
              <button
                type="button"
                (click)="selectDoc(doc)"
                class="w-full text-start flex items-center gap-3 p-2.5 rounded-md cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <span class="text-xl flex-shrink-0">{{
                  docService.getFileIcon(doc)
                }}</span>
                <div class="min-w-0 flex-1">
                  <div class="font-medium text-sm truncate">{{ doc.name }}</div>
                  <div class="text-xs text-gray-500">
                    {{ doc.fileName }}
                    {{ doc.revision ? "· Rev " + doc.revision : "" }}
                  </div>
                </div>
              </button>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class CompareComponent implements OnInit {
  private router = inject(Router);
  private compareService = inject(CompareService);
  docService = inject(DocumentService);
  private projectService = inject(ProjectService);

  doc1 = signal<Document | null>(null);
  doc2 = signal<Document | null>(null);
  result = signal<CompareResult | null>(null);
  comparing = signal(false);
  showPicker = signal(false);
  pickingSlot = signal(1);
  aiText = signal("");
  aiLoading = signal(false);

  /** The report as lines to render; empty until one has been generated. */
  reportLines = computed(() => parseComparisonReport(this.aiText()));
  docs = this.docService.documents;

  /**
   * Labels that live in expressions, so `i18n` cannot mark them — see the
   * note in login.component.ts.
   */
  readonly compareLabel = $localize`:Runs the comparison@@compare.runAction:🔍 Compare`;
  readonly analysingLabel = $localize`:Compare button while the two files are being analysed@@compare.analysing:⏳ Analysing...`;
  readonly chooseFileLabel = $localize`:Prompt inside an empty file slot@@compare.chooseFile:Click to select`;
  readonly identicalLabel = $localize`:Result banner when the two documents match@@compare.identical:Files are identical`;
  readonly changedLabel = $localize`:Result banner when the two documents differ@@compare.changed:Changes detected`;

  /** Names the two documents being compared, and what kind they are. */
  comparisonSubtitle(result: CompareResult): string {
    return $localize`:Subtitle under the comparison result, naming the two documents and the file type they share@@compare.subtitle:${result.doc1Name}:first: vs ${result.doc2Name}:second: · ${result.fileType}:fileType:`;
  }

  /** Heading of the picker, naming which of the two slots is being filled. */
  pickerHeading(): string {
    return $localize`:Heading of the dialog for choosing one of the two documents to compare. The placeholder is 1 or 2.@@compare.pickerHeading:Select document for File ${this.pickingSlot()}:slot:`;
  }

  /** The revision suffix shown under a chosen file, e.g. "· Rev B". */
  revisionSuffix(revision: string): string {
    return $localize`:Appended after a file name to show its revision@@compare.revisionSuffix:· Rev ${revision}:revision:`;
  }

  groupedChanges = computed(() => {
    const r = this.result();
    if (!r) return [];
    const groups: Record<string, ChangeItem[]> = {};
    for (const c of r.changes) {
      const cat = c.category || "OTHER";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(c);
    }
    return Object.entries(groups).map(([category, items]) => ({
      category,
      items,
    }));
  });

  ngOnInit() {
    const p = this.projectService.selected();
    if (p && this.docService.documents().length === 0) {
      this.docService.loadByProject(p.id).subscribe();
    }
  }

  pickFile(slot: number) {
    this.pickingSlot.set(slot);
    this.showPicker.set(true);
  }

  selectDoc(doc: Document) {
    if (this.pickingSlot() === 1) this.doc1.set(doc);
    else this.doc2.set(doc);
    this.showPicker.set(false);
  }

  swapFiles() {
    const tmp = this.doc1();
    this.doc1.set(this.doc2());
    this.doc2.set(tmp);
  }

  runCompare() {
    const d1 = this.doc1(),
      d2 = this.doc2();
    if (!d1 || !d2) return;
    this.comparing.set(true);
    this.result.set(null);
    this.aiText.set("");
    this.compareService
      .compare({ documentId1: d1.id, documentId2: d2.id })
      .subscribe({
        next: (r) => {
          this.result.set(r);
          this.comparing.set(false);
        },
        error: () => this.comparing.set(false),
      });
  }

  generateAI() {
    const result = this.result();
    if (!result) return;
    this.aiLoading.set(true);
    this.aiText.set("");

    // Facts, not a prompt. The prompt, the model and the token ceiling are the
    // server's to decide: this used to assemble the whole thing here and POST
    // it to an endpoint that forwarded it verbatim to a third party, so a
    // browser chose what the deployment spent and no filter was possible on
    // the way out.
    this.compareService.getComparisonReport(result).subscribe({
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

  openVisualCompare() {
    const d1 = this.doc1(),
      d2 = this.doc2();
    if (!d1 || !d2) return;
    this.router.navigate(["/visual-compare"], {
      queryParams: { doc1: d1.id, doc2: d2.id },
    });
  }

  goBack() {
    this.router.navigate(["/"]);
  }
}
