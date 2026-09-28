import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChunkedUploadService, UploadProgress } from '../../core/services/chunked-upload.service';

/**
 * What is happening to the files somebody just handed over.
 *
 * <p>Three things were wrong with this, and they share a cause: it was
 * written as something to look at.
 *
 * <p>Nothing was announced. §1A.4 asks for upload progress and completion to
 * reach assistive technology, and this is the only place the product says
 * whether a drawing arrived — so somebody using a screen reader handed over a
 * file and then had no way to learn what became of it. It is a live region
 * now, and a polite one: an upload emits a progress figure many times a
 * second, and `assertive` would interrupt continuously for the whole upload.
 * Only the settled outcomes are announced, for the same reason.
 *
 * <p>The dismiss button was a bare `✕` glyph, which a screen reader reads as
 * its Unicode name or as nothing at all, so the only control here had no
 * usable name. It names the file it dismisses now, because there may be
 * several.
 *
 * <p>And every string was English written into the template — "Waiting...",
 * "Complete", "Upload failed" — against §1.4's "no hardcoded user-facing
 * strings". They cannot be extracted from a component field either, so the
 * labels are `$localize` messages with their own ids.
 */
@Component({
  selector: 'app-upload-progress',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (svc.uploads().length > 0) {
      <div class="fixed bottom-4 left-4 z-[9998] w-72 space-y-2"
           role="region"
           [attr.aria-label]="regionLabel">
        @for (upload of svc.uploads(); track upload.fileName) {
          @if (upload.status !== 'done' || upload.progress < 100) {
            <div class="bg-white rounded-lg shadow-lg border border-gray-200 p-3 text-xs">
              <div class="flex items-center gap-2 mb-2">
                <span class="text-base" aria-hidden="true">
                  {{ upload.status === 'error' ? '❌' : upload.status === 'done' ? '✅' : '📤' }}
                </span>
                <span class="font-medium text-gray-700 truncate flex-1">{{ upload.fileName }}</span>
                @if (upload.status === 'done' || upload.status === 'error') {
                  <button (click)="svc.removeUpload(upload.fileName)"
                    type="button"
                    [attr.aria-label]="dismissLabel(upload.fileName)"
                    class="text-gray-400 hover:text-gray-600 min-w-6 min-h-6
                           flex items-center justify-center rounded">
                    <span aria-hidden="true">✕</span>
                  </button>
                }
              </div>

              @if (upload.status !== 'error') {
                <div class="w-full bg-gray-100 rounded-full h-1.5 mb-1"
                     role="progressbar"
                     aria-valuemin="0" aria-valuemax="100"
                     [attr.aria-valuenow]="upload.progress"
                     [attr.aria-valuetext]="progressText(upload)"
                     [attr.aria-label]="upload.fileName">
                  <div class="h-1.5 rounded-full transition-all duration-300"
                    [class]="upload.status === 'done' ? 'bg-green-500' : 'bg-accent'"
                    [style.width.%]="upload.progress">
                  </div>
                </div>
                <div class="text-gray-500 flex justify-between">
                  <span>{{ upload.message || statusLabel(upload.status) }}</span>
                  <span>{{ upload.progress }}%</span>
                </div>
              }

              @if (upload.status === 'error') {
                <div class="text-red-600">{{ upload.message || uploadFailedLabel }}</div>
              }
            </div>
          }
        }
      </div>

      <!--
        Separate from the list above, and carrying only what has settled.
        A progress bar changes many times a second; announcing every change
        would talk over everything else on the page for the whole upload.
      -->
      <div class="sr-only" aria-live="polite" aria-atomic="false">
        @for (upload of settled(); track upload.fileName) {
          <p>{{ outcomeAnnouncement(upload) }}</p>
        }
      </div>
    }
  `
})
export class UploadProgressComponent {
  svc = inject(ChunkedUploadService);

  readonly regionLabel = $localize`:Names the panel listing files being uploaded@@upload.regionLabel:File uploads`;

  readonly uploadFailedLabel = $localize`:Shown when an upload failed and the server gave no reason@@upload.failed:Upload failed`;

  /** The uploads that have finished, one way or the other. */
  settled(): UploadProgress[] {
    return this.svc.uploads().filter(
      (upload) => upload.status === 'done' || upload.status === 'error');
  }

  statusLabel(status: string): string {
    const labels: Record<string, string> = {
      pending:    $localize`:Upload has not started yet@@upload.pending:Waiting…`,
      uploading:  $localize`:Upload is in progress@@upload.uploading:Uploading…`,
      processing: $localize`:File has arrived and is being processed@@upload.processing:Processing…`,
      done:       $localize`:Upload finished successfully@@upload.done:Complete`,
      error:      $localize`:Upload did not finish@@upload.error:Failed`,
    };
    return labels[status] ?? status;
  }

  /**
   * The bar's value as a sentence rather than a bare number, because
   * "43" on its own tells a listener nothing about what is at 43.
   */
  progressText(upload: UploadProgress): string {
    return $localize`:Spoken description of an upload's progress@@upload.progressText:${upload.fileName}:file: ${upload.progress}:percent:% uploaded`;
  }

  dismissLabel(fileName: string): string {
    return $localize`:Button that removes one finished upload from the list@@upload.dismiss:Dismiss ${fileName}:file:`;
  }

  outcomeAnnouncement(upload: UploadProgress): string {
    return upload.status === 'error'
      ? $localize`:Announced when an upload failed@@upload.announceFailed:${upload.fileName}:file: could not be uploaded.`
      : $localize`:Announced when an upload finished@@upload.announceDone:${upload.fileName}:file: uploaded.`;
  }
}
