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

import { CompareService } from "../../core/services/compare.service";
import { DocumentService } from "../../core/services/document.service";
import { ProjectService } from "../../core/services/project.service";
import { CompareResult, Document } from "../../core/models";
import { problemMessage } from "../../core/handlers/problem-detail";
import { ChangeListComponent } from "./change-list.component";
import { CompareFileSlotComponent } from "./compare-file-slot.component";
import { CompareToolbarComponent } from "./compare-toolbar.component";
import { ComparisonSummaryComponent } from "./comparison-summary.component";
import { DocumentPickerComponent } from "./document-picker.component";

@Component({
  selector: "app-compare",
  standalone: true,
  imports: [
    ChangeListComponent,
    CompareFileSlotComponent,
    CompareToolbarComponent,
    ComparisonSummaryComponent,
    DocumentPickerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="fixed inset-0 flex flex-col" style="background:var(--bg);z-index:700">
      <app-compare-toolbar
        [bothChosen]="bothChosen()"
        [comparing]="comparing()"
        (dismissed)="goBack()"
        (swapRequested)="swapFiles()"
        (overlayRequested)="openVisualCompare()"
        (compareRequested)="runCompare()"
      />

      <div class="flex items-center gap-3 px-4 py-2 bg-white border-b border-gray-200 flex-shrink-0">
        <app-compare-file-slot
          [heading]="originalHeading" [document]="doc1()" (chosen)="pickFile(1)" />

        <div class="text-xs font-bold text-gray-500 px-2 py-1 bg-gray-100 rounded-full flex-shrink-0">
          <ng-container i18n="Separates the two documents being compared. Very short — it sits in a small pill between them.@@compare.versus"
            >VS</ng-container
          >
        </div>

        <app-compare-file-slot
          [heading]="revisedHeading" [document]="doc2()" (chosen)="pickFile(2)" />
      </div>

      @if (failure()) {
        <div role="alert"
             class="mx-4 mt-2 p-2 text-xs rounded bg-red-50 border border-red-200 text-red-700">
          {{ failure() }}
        </div>
      }

      <div class="flex flex-1 overflow-hidden min-h-0">
        <app-change-list [result]="result()" />
        <app-comparison-summary [result]="result()" />
      </div>
    </div>

    @if (showPicker()) {
      <app-document-picker
        [heading]="pickerHeading()"
        [documents]="docs()"
        (chosen)="selectDoc($event)"
        (dismissed)="showPicker.set(false)"
      />
    }
  `,
})
export class CompareComponent implements OnInit {
  /** The summary panel, so a new comparison can clear the previous one. */
  private summary = viewChild(ComparisonSummaryComponent);

  private router = inject(Router);
  private compareService = inject(CompareService);
  private documentService = inject(DocumentService);
  private projectService = inject(ProjectService);

  doc1 = signal<Document | null>(null);
  doc2 = signal<Document | null>(null);
  result = signal<CompareResult | null>(null);
  comparing = signal(false);
  showPicker = signal(false);
  pickingSlot = signal(1);
  /** Why the last comparison did not happen, if it did not. */
  readonly failure = signal("");

  docs = this.documentService.documents;

  readonly bothChosen = computed(() => !!this.doc1() && !!this.doc2());

  readonly originalHeading = $localize`:Labels the first slot — the earlier document@@compare.file1Heading:File 1 — Original`;
  readonly revisedHeading = $localize`:Labels the second slot — the later document@@compare.file2Heading:File 2 — Revised`;

  /** Heading of the picker, naming which of the two slots is being filled. */
  pickerHeading(): string {
    return $localize`:Heading of the dialog for choosing one of the two documents to compare. The placeholder is 1 or 2.@@compare.pickerHeading:Select document for File ${this.pickingSlot()}:slot:`;
  }

  ngOnInit() {
    const project = this.projectService.selected();
    if (project && this.documentService.documents().length === 0) {
      this.documentService.loadByProject(project.id).subscribe();
    }
  }

  pickFile(slot: number) {
    this.pickingSlot.set(slot);
    this.showPicker.set(true);
  }

  selectDoc(document: Document) {
    if (this.pickingSlot() === 1) this.doc1.set(document);
    else this.doc2.set(document);
    this.showPicker.set(false);
  }

  swapFiles() {
    const wasFirst = this.doc1();
    this.doc1.set(this.doc2());
    this.doc2.set(wasFirst);
  }

  runCompare() {
    const original = this.doc1();
    const revised = this.doc2();
    if (!original || !revised) return;

    this.comparing.set(true);
    this.result.set(null);
    this.failure.set("");
    // The summary on screen describes documents that are about to be
    // replaced; leaving it there reads as a summary of the new comparison.
    this.summary()?.forget();

    this.compareService
      .compare({ documentId1: original.id, documentId2: revised.id })
      .subscribe({
        next: (comparison) => {
          this.result.set(comparison);
          this.comparing.set(false);
        },
        // This branch only cleared the busy flag, so a refused comparison
        // looked exactly like one that found no differences — and
        // `problemMessage` was imported here and never called (§1.4).
        error: (err: unknown) => {
          this.comparing.set(false);
          this.failure.set(problemMessage(
            err,
            $localize`:Fallback when comparing two documents fails without a reason@@compare.failed:The two documents could not be compared.`,
          ));
        },
      });
  }

  openVisualCompare() {
    const original = this.doc1();
    const revised = this.doc2();
    if (!original || !revised) return;
    this.router.navigate(["/visual-compare"], {
      queryParams: { doc1: original.id, doc2: revised.id },
    });
  }

  goBack() {
    this.router.navigate(["/"]);
  }
}
