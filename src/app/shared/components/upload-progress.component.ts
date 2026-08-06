import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChunkedUploadService } from '../../core/services/chunked-upload.service';

@Component({
  selector: 'app-upload-progress',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (svc.uploads().length > 0) {
      <div class="fixed bottom-4 left-4 z-[9998] w-72 space-y-2">
        @for (upload of svc.uploads(); track upload.fileName) {
          @if (upload.status !== 'done' || upload.progress < 100) {
            <div class="bg-white rounded-lg shadow-lg border border-gray-200 p-3 text-xs">
              <div class="flex items-center gap-2 mb-2">
                <span class="text-base">
                  {{ upload.status === 'error' ? '❌' : upload.status === 'done' ? '✅' : '📤' }}
                </span>
                <span class="font-medium text-gray-700 truncate flex-1">{{ upload.fileName }}</span>
                @if (upload.status === 'done' || upload.status === 'error') {
                  <button (click)="svc.removeUpload(upload.fileName)"
                    class="text-gray-400 hover:text-gray-600">✕</button>
                }
              </div>

              <!-- Progress bar -->
              @if (upload.status !== 'error') {
                <div class="w-full bg-gray-100 rounded-full h-1.5 mb-1">
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

              <!-- Error -->
              @if (upload.status === 'error') {
                <div class="text-red-600">{{ upload.message || 'Upload failed' }}</div>
              }
            </div>
          }
        }
      </div>
    }
  `
})
export class UploadProgressComponent {
  svc = inject(ChunkedUploadService);

  statusLabel(status: string): string {
    return { pending: 'Waiting...', uploading: 'Uploading...', processing: 'Processing...',
             done: 'Complete', error: 'Failed' }[status] || status;
  }
}
