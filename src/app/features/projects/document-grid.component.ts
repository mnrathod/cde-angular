/**
 * The grid of document cards for the selected project.
 *
 * <p>The status dropdown is editable inline because changing a status is a
 * routine review action — §1.3's "inline editing" convention — and a dialog
 * for each one would make a reviewer's afternoon considerably longer.
 */
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  output,
  signal,
} from "@angular/core";

import { Document, DocumentStatus } from "../../core/models";
import { DocumentService } from "../../core/services/document.service";
import { ProjectService } from "../../core/services/project.service";
import { RoleService } from "../../core/services/role.service";
import { SkeletonComponent } from "../../shared/components/skeleton.component";
import {
  DOCUMENT_STATUSES,
  statusChipStyle,
  statusLabel,
} from "./project-vocabulary";

@Component({
  selector: "app-document-grid",
  standalone: true,
  imports: [SkeletonComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="flex-1 overflow-y-auto p-5">
      @if (!projects.selected()) {
        <div class="flex flex-col items-center justify-center h-full text-gray-400">
          <div class="text-5xl mb-3" aria-hidden="true">📁</div>
          <p
            i18n="Empty state shown before a project is chosen@@shell.noProjectSelected"
            class="text-sm"
          >
            Select a project to see its documents
          </p>
        </div>
      } @else if (documents.loading()) {
        <app-skeleton type="card" [count]="6" />
      } @else if (documents.documents().length === 0) {
        <div class="flex flex-col items-center justify-center h-48 text-gray-400">
          <div class="text-4xl mb-3" aria-hidden="true">📄</div>
          <p
            i18n="Empty state for a project with no documents. The named control must match the Upload button.@@shell.noDocuments"
            class="text-sm"
          >
            No documents yet. Click Upload to add files.
          </p>
        </div>
      } @else {
        <div
          class="grid gap-3"
          style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr))"
        >
          @for (doc of documents.documents(); track doc.id) {
            <!-- As in the sidebar: the card holds a delete button, so the card
                 is not itself a button. The document name carries the
                 keyboard-reachable open action. -->
            <div
              (click)="openRequested.emit(doc)"
              data-testid="document-card"
              class="group bg-white rounded border border-gray-200 shadow-sm cursor-pointer hover:border-accent hover:-translate-y-0.5 hover:shadow-md transition-all overflow-hidden relative"
            >
              @if (roles.can("canDelete")) {
                <button
                  (click)="deleteRequested.emit(doc); $event.stopPropagation()"
                  i18n-title="@@shell.deleteDocumentHint"
                  title="Delete document"
                  class="absolute top-1.5 end-1.5 z-10 opacity-0 group-hover:opacity-100 focus:opacity-100
                         w-6 h-6 rounded bg-white/90 border border-gray-200 text-xs
                         text-gray-400 hover:text-red-600 hover:border-red-300 transition-opacity"
                >
                  🗑
                </button>
              }
              <div
                class="h-24 bg-blue-50 border-b border-gray-200 flex items-center justify-center text-3xl"
                aria-hidden="true"
              >
                {{ documents.getFileIcon(doc) }}
              </div>
              <div class="p-2.5">
                <button
                  type="button"
                  (click)="openRequested.emit(doc); $event.stopPropagation()"
                  class="text-xs font-semibold text-gray-800 truncate w-full text-start bg-transparent border-0 p-0 cursor-pointer"
                >
                  {{ doc.name }}
                </button>
                <div class="text-xs text-gray-500 mt-0.5 truncate">
                  {{ doc.drawingNumber || doc.documentType }}{{ revisionSuffix(doc) }}
                </div>
                <div class="flex items-center justify-between mt-1.5 gap-1">
                  @if (roles.can("canApprove")) {
                    <select
                      [value]="doc.status"
                      (click)="$event.stopPropagation()"
                      (change)="changeStatus(doc, $event)"
                      [disabled]="statusUpdatingId() === doc.id"
                      i18n-title="@@shell.changeStatusHint"
                      title="Change status"
                      class="text-xs px-1 py-0.5 rounded font-semibold border-0 cursor-pointer
                             focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
                      [style]="chipStyleFor(doc.status)"
                    >
                      @for (status of statuses; track status) {
                        <option [value]="status">{{ labelFor(status) }}</option>
                      }
                    </select>
                  } @else {
                    <span
                      class="text-xs px-1.5 py-0.5 rounded font-semibold"
                      [style]="chipStyleFor(doc.status)"
                      >{{ labelFor(doc.status) }}</span
                    >
                  }
                </div>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class DocumentGridComponent {
  openRequested = output<Document>();
  deleteRequested = output<Document>();

  documents = inject(DocumentService);
  projects = inject(ProjectService);
  roles = inject(RoleService);

  readonly statuses = DOCUMENT_STATUSES;
  labelFor = statusLabel;
  chipStyleFor = statusChipStyle;

  /** The card whose status is being saved, so its control is held disabled. */
  statusUpdatingId = signal<number | null>(null);

  /** " · Rev B", or nothing at all for a document with no revision. */
  revisionSuffix(doc: Document): string {
    if (!doc.revision) return "";
    return $localize`:Revision marker after a drawing number on a document card. "Rev" is the conventional abbreviation on a drawing sheet.@@shell.revisionSuffix: · Rev ${doc.revision}:revision:`;
  }

  changeStatus(doc: Document, event: Event): void {
    const control = event.target as HTMLSelectElement;
    const status = control.value as DocumentStatus;
    if (status === doc.status) return;

    this.statusUpdatingId.set(doc.id);
    this.documents.updateStatus(doc.id, status).subscribe({
      next: () => this.statusUpdatingId.set(null),
      error: () => {
        this.statusUpdatingId.set(null);
        // Put the control back where it was — the document itself did not
        // change, so leaving the select showing the new value would lie.
        control.value = doc.status;
      },
    });
  }
}
