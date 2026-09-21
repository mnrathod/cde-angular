/**
 * Choosing one of the project's documents.
 *
 * <p>The list had no empty state: a project with nothing in it opened a
 * dialog containing a heading and blank space, which says neither what the
 * dialog is for nor what to do about it (§1.1).
 */
import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject,
} from "@angular/core";

import { Document } from "../../core/models";
import { DocumentService } from "../../core/services/document.service";
import { ModalDialogComponent } from "../../shared/components/modal-dialog.component";
import { revisionSuffix } from "./revision-label";

@Component({
  selector: "app-document-picker",
  standalone: true,
  imports: [ModalDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal-dialog [heading]="heading" (dismissed)="dismissed.emit()">
      @if (documents.length === 0) {
        <p i18n="Shown in the document picker when the project holds nothing to compare@@compare.pickerEmpty"
           class="text-sm text-gray-500 py-4">
          This project has no documents yet. Upload one from the project page, then come back to compare it.
        </p>
      } @else {
        <div class="overflow-y-auto max-h-[50vh] -mx-2">
          @for (document of documents; track document.id) {
            <button type="button" (click)="chosen.emit(document)"
              class="w-full text-start flex items-center gap-3 p-2.5 rounded-md cursor-pointer hover:bg-gray-50 transition-colors">
              <span class="text-xl flex-shrink-0" aria-hidden="true">{{ iconFor(document) }}</span>
              <div class="min-w-0 flex-1">
                <div class="font-medium text-sm truncate">{{ document.name }}</div>
                <div class="text-xs text-gray-500">
                  {{ document.fileName }}@if (document.revision) { {{ suffixFor(document.revision) }} }
                </div>
              </div>
            </button>
          }
        </div>
      }
    </app-modal-dialog>
  `,
})
export class DocumentPickerComponent {
  @Input({ required: true }) heading!: string;
  @Input({ required: true }) documents: readonly Document[] = [];

  @Output() chosen = new EventEmitter<Document>();
  @Output() dismissed = new EventEmitter<void>();

  private documentService = inject(DocumentService);

  iconFor(document: Document): string {
    return this.documentService.getFileIcon(document);
  }

  /** Templates cannot call an imported function, so it arrives through here. */
  suffixFor(revision: string): string {
    return revisionSuffix(revision);
  }
}
