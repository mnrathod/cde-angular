/**
 * Choosing a file and the metadata it is filed under.
 *
 * <p>Both routes to a file are kept: SC 2.5.7 requires a single-pointer
 * alternative to any drag, and the drop zone is a `button` that opens the file
 * picker, so the keyboard and pointer paths are the same control rather than
 * drag being the only way in.
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
import { FormsModule } from "@angular/forms";

import { Document } from "../../core/models";
import { ChunkedUploadService } from "../../core/services/chunked-upload.service";
import { ModalDialogComponent } from "../../shared/components/modal-dialog.component";
import { DOCUMENT_TYPES, documentTypeLabel } from "./project-vocabulary";

/** Extensions the picker offers. The server decides what it actually accepts. */
const ACCEPTED_EXTENSIONS =
  ".pdf,.dxf,.dwg,.ifc,.glb,.gltf,.obj,.stl,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.svg";

@Component({
  selector: "app-document-upload-dialog",
  standalone: true,
  imports: [FormsModule, ModalDialogComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <app-modal-dialog
      [heading]="heading"
      [confirmLabel]="submitLabel()"
      [confirmDisabled]="!chosenFile() || uploading()"
      (confirmed)="upload()"
      (dismissed)="closed.emit()"
    >
      <button
        type="button"
        (click)="fileInput.click()"
        (dragover)="$event.preventDefault()"
        (drop)="onDrop($event)"
        class="w-full border-2 border-dashed border-gray-300 rounded-md p-6 text-center text-gray-500 text-sm cursor-pointer hover:border-accent hover:bg-blue-50 transition-colors mb-4"
      >
        <div class="text-2xl mb-2" aria-hidden="true">📄</div>
        @if (chosenFile()) {
          <div class="text-accent font-medium">
            <span aria-hidden="true">📎</span> {{ chosenFile()!.name }}
          </div>
        } @else {
          <ng-container
            i18n="Prompt inside the file drop zone. Both routes work — clicking opens a file picker, and dragging is the pointer shortcut.@@shell.dropZonePrompt"
            >Click to browse or drag &amp; drop</ng-container
          >
        }
      </button>
      <input
        #fileInput
        type="file"
        class="hidden"
        [accept]="acceptedExtensions"
        (change)="onFileSelect($event)"
      />

      <div class="space-y-3 mb-5">
        <div>
          <label
            for="upload-name"
            i18n="The asterisk marks the field as required@@shell.documentNameLabel"
            class="block text-xs font-medium text-gray-600 mb-1"
            >Document Name *</label
          >
          <input
            id="upload-name"
            [(ngModel)]="metadata.name"
            data-testid="upload-name"
            class="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label
              for="upload-type"
              i18n="What kind of document is being uploaded@@shell.documentTypeLabel"
              class="block text-xs font-medium text-gray-600 mb-1"
              >Type</label
            >
            <select
              id="upload-type"
              [(ngModel)]="metadata.documentType"
              class="w-full px-2 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            >
              @for (type of documentTypes; track type) {
                <option [value]="type">{{ labelForType(type) }}</option>
              }
            </select>
          </div>
          <div>
            <label
              for="upload-revision"
              i18n="Which revision of the document this upload is@@shell.revisionLabel"
              class="block text-xs font-medium text-gray-600 mb-1"
              >Revision</label
            >
            <input
              id="upload-revision"
              [(ngModel)]="metadata.revision"
              i18n-placeholder="Example revision identifier — revisions are commonly lettered@@shell.revisionPlaceholder"
              placeholder="A"
              class="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
        </div>
      </div>

    </app-modal-dialog>
  `,
})
export class DocumentUploadDialogComponent {
  /** The project the file is filed under. */
  projectId = input.required<number>();
  /** Cancelled, or uploaded. Either way the dialog is finished. */
  closed = output<void>();

  private uploads = inject(ChunkedUploadService);

  readonly acceptedExtensions = ACCEPTED_EXTENSIONS;
  readonly documentTypes = DOCUMENT_TYPES;
  labelForType = documentTypeLabel;
  readonly heading = $localize`:Heading of the upload dialog@@shell.uploadHeading:📂 Upload Document`;

  chosenFile = signal<File | null>(null);
  uploading = signal(false);
  metadata: Partial<Document> = { documentType: "DRAWING" };

  private readonly uploadLabel = $localize`:Starts the upload@@shell.uploadAction:Upload`;
  private readonly uploadingLabel = $localize`:Upload button while the file is being sent@@shell.uploading:Uploading...`;

  submitLabel = computed(() =>
    this.uploading() ? this.uploadingLabel : this.uploadLabel,
  );

  onFileSelect(event: Event): void {
    this.accept((event.target as HTMLInputElement).files?.[0]);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.accept(event.dataTransfer?.files?.[0]);
  }

  /** Takes the file and proposes its name, so the field is rarely retyped. */
  private accept(file: File | undefined): void {
    if (!file) return;
    this.chosenFile.set(file);
    this.metadata.name = withoutExtension(file.name);
  }

  upload(): void {
    const file = this.chosenFile();
    if (!file || this.uploading()) return;

    this.uploading.set(true);
    this.uploads.upload(file, this.projectId(), this.describe(file)).subscribe({
      next: () => {
        this.uploading.set(false);
        this.closed.emit();
      },
      // The upload service surfaces its own failures; the dialog stays open
      // with the file still chosen so it can be retried without re-picking.
      error: () => this.uploading.set(false),
    });
  }

  private describe(file: File): Record<string, string> {
    return {
      name: this.metadata.name || withoutExtension(file.name),
      documentType: this.metadata.documentType || "DRAWING",
      drawingNumber: this.metadata.drawingNumber || "",
      revision: this.metadata.revision || "",
    };
  }
}

/** "site-plan.pdf" → "site-plan". What a person would have typed. */
function withoutExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}
