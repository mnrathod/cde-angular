/**
 * One of the two documents being compared.
 *
 * <p>The two slots were the same thirty lines of markup written twice, the
 * only difference being which signal they read and which of two headings
 * they carried. Written once here, the heading and the document arrive as
 * inputs and the non-null assertions the duplicated version needed to read
 * `doc1()!.fileName` go with it.
 *
 * <p>A button, not a div with a click handler: this is the control that
 * chooses a file, so it is reachable by Tab and operable by Enter and Space
 * without a directive re-implementing what the element already does (§1A.2).
 * `text-start` because a button centres its content and this one holds a
 * left-aligned card.
 */
import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, Output,
} from "@angular/core";

import { Document } from "../../core/models";
import { revisionSuffix } from "./revision-label";

@Component({
  selector: "app-compare-file-slot",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" (click)="chosen.emit()"
      class="flex-1 border-2 rounded-lg p-3 cursor-pointer transition-all min-w-0 text-start"
      [class]="document
        ? 'border-accent bg-blue-50'
        : 'border-dashed border-gray-300 hover:border-accent'">

      <div class="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
        <span aria-hidden="true">📄</span>{{ heading }}
      </div>

      <div class="font-medium text-sm truncate">
        {{ document?.name || chooseFileLabel }}
      </div>

      @if (document; as chosenDocument) {
        <div class="text-xs text-gray-500 mt-0.5">
          {{ chosenDocument.fileName }}
          @if (chosenDocument.revision) { {{ suffixFor(chosenDocument.revision) }} }
        </div>
      }
    </button>
  `,
})
export class CompareFileSlotComponent {
  /** What this slot is for — "File 1 — Original" or "File 2 — Revised". */
  @Input({ required: true }) heading!: string;
  @Input() document: Document | null = null;

  @Output() chosen = new EventEmitter<void>();

  readonly chooseFileLabel = $localize`:Prompt inside an empty file slot@@compare.chooseFile:Click to select`;

  /** Templates cannot call an imported function, so it arrives through here. */
  suffixFor(revision: string): string {
    return revisionSuffix(revision);
  }
}
