/**
 * The confirmation before a project or a document is deleted.
 *
 * <p>§1.3 prefers undo over a confirmation dialog, and this is the exception
 * it names: neither deletion is reversible, and deleting a project takes its
 * documents with it.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from "@angular/core";

import { problemMessage } from "../../core/handlers/problem-detail";
import { DocumentService } from "../../core/services/document.service";
import { ProjectService } from "../../core/services/project.service";
import { ModalDialogComponent } from "../../shared/components/modal-dialog.component";

/** What is about to be deleted. */
export interface DeletionTarget {
  kind: "project" | "document";
  id: number;
  name: string;
}

@Component({
  selector: "app-delete-confirmation",
  standalone: true,
  imports: [ModalDialogComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <app-modal-dialog
      [heading]="heading()"
      [error]="error()"
      [confirmLabel]="confirmLabel()"
      [confirmDisabled]="deleting()"
      [destructive]="true"
      (confirmed)="confirm()"
      (dismissed)="closed.emit()"
    >
      <p
        i18n="Names the thing about to be deleted@@shell.deleteWarning"
        class="text-sm text-gray-600 mb-1"
      >
        <span class="font-medium">{{ target().name }}</span> will be permanently
        deleted.
      </p>
      @if (target().kind === "project") {
        <p
          class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-4"
        >
          <ng-container
            i18n="Extra warning when deleting a project rather than one document@@shell.deleteProjectCascade"
            >Documents belonging to this project are deleted with it.</ng-container
          >
        </p>
      } @else {
        <p i18n="@@shell.deleteIrreversible" class="text-xs text-gray-500 mb-4">
          This cannot be undone.
        </p>
      }

    </app-modal-dialog>
  `,
})
export class DeleteConfirmationComponent {
  target = input.required<DeletionTarget>();
  /** Cancelled, or deleted. Either way the dialog is finished. */
  closed = output<void>();

  private projects = inject(ProjectService);
  private documents = inject(DocumentService);

  deleting = signal(false);
  error = signal("");

  private readonly deleteLabel = $localize`:Confirms the deletion@@shell.delete:Delete`;
  private readonly deletingLabel = $localize`:Delete button while the request is in flight@@shell.deleting:Deleting...`;

  confirmLabel = computed(() =>
    this.deleting() ? this.deletingLabel : this.deleteLabel,
  );

  /**
   * Two whole messages rather than "Delete {kind}?" with the English noun
   * interpolated: gender and article agreement do not survive that, and the
   * translator never sees the word that lands in the gap.
   */
  heading = computed(() =>
    this.target().kind === "project"
      ? $localize`:Heading of the confirmation before deleting a project@@shell.deleteProjectTitle:Delete project?`
      : $localize`:Heading of the confirmation before deleting a document@@shell.deleteDocumentTitle:Delete document?`,
  );

  confirm(): void {
    const target = this.target();
    this.deleting.set(true);
    this.error.set("");

    const request =
      target.kind === "project"
        ? this.projects.remove(target.id)
        : this.documents.delete(target.id);

    request.subscribe({
      next: () => {
        this.deleting.set(false);
        this.closed.emit();
      },
      error: (failure: unknown) => {
        // Stays open on failure. Closing would look like it worked.
        this.deleting.set(false);
        this.error.set(
          problemMessage(
            failure,
            target.kind === "project"
              ? $localize`:Fallback when deleting a project fails@@shell.deleteProjectFailed:Could not delete the project.`
              : $localize`:Fallback when deleting a document fails@@shell.deleteDocumentFailed:Could not delete the document.`,
          ),
        );
      },
    });
  }
}
