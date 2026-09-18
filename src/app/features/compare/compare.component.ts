import {
  Component,
  viewChild,
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
import { CompareResult, Document } from "../../core/models";
import { problemMessage } from "../../core/handlers/problem-detail";
import { ChangeListComponent } from "./change-list.component";
import { ComparisonSummaryComponent } from "./comparison-summary.component";
import { ModalDialogComponent } from "../../shared/components/modal-dialog.component";

@Component({
  selector: "app-compare",
  standalone: true,
  imports: [
    CommonModule,
    ChangeListComponent,
    ComparisonSummaryComponent,
    ModalDialogComponent,
  ],
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
        <app-change-list [result]="result()" />
        <app-comparison-summary [result]="result()" />
      </div>
    </div>

    @if (showPicker()) {
      <app-modal-dialog
        [heading]="pickerHeading()"
        (dismissed)="showPicker.set(false)"
      >
        <div class="overflow-y-auto max-h-[50vh] -mx-2">
          @for (doc of docs(); track doc.id) {
            <button
              type="button"
              (click)="selectDoc(doc)"
              class="w-full text-start flex items-center gap-3 p-2.5 rounded-md cursor-pointer hover:bg-gray-50 transition-colors"
            >
              <span class="text-xl flex-shrink-0" aria-hidden="true">{{
                docService.getFileIcon(doc)
              }}</span>
              <div class="min-w-0 flex-1">
                <div class="font-medium text-sm truncate">{{ doc.name }}</div>
                <div class="text-xs text-gray-500">
                  {{ doc.fileName }}{{ doc.revision ? revisionSuffix(doc.revision) : "" }}
                </div>
              </div>
            </button>
          }
        </div>
      </app-modal-dialog>
    }
  `,
})
export class CompareComponent implements OnInit {
  /** The summary panel, so a new comparison can clear the previous one. */
  private summary = viewChild(ComparisonSummaryComponent);

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

  docs = this.docService.documents;

  /**
   * Labels that live in expressions, so `i18n` cannot mark them — see the
   * note in login.component.ts.
   */
  readonly compareLabel = $localize`:Runs the comparison@@compare.runAction:🔍 Compare`;
  readonly analysingLabel = $localize`:Compare button while the two files are being analysed@@compare.analysing:⏳ Analysing...`;
  readonly chooseFileLabel = $localize`:Prompt inside an empty file slot@@compare.chooseFile:Click to select`;

  /** Heading of the picker, naming which of the two slots is being filled. */
  pickerHeading(): string {
    return $localize`:Heading of the dialog for choosing one of the two documents to compare. The placeholder is 1 or 2.@@compare.pickerHeading:Select document for File ${this.pickingSlot()}:slot:`;
  }

  /** The revision suffix shown under a chosen file, e.g. "· Rev B". */
  revisionSuffix(revision: string): string {
    return $localize`:Appended after a file name to show its revision@@compare.revisionSuffix:· Rev ${revision}:revision:`;
  }

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
    // The summary on screen describes documents that are about to be
    // replaced; leaving it there reads as a summary of the new comparison.
    this.summary()?.forget();
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
