import {
  Component, inject, signal, effect, ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';

import {
  DocumentVersionService, DocumentVersion
} from '../../../core/services/document-version.service';
import { ViewerStateService } from '../../../core/services/viewer/viewer-state.service';

/**
 * The document's processing history.
 *
 * <p>Redaction, OCR, flattening and form-filling each commit a version rather
 * than handing back a download, which is what lets them be combined — this
 * panel is where that chain becomes visible, and where an earlier state can be
 * brought back if a step went wrong.
 */
@Component({
  selector: 'app-version-history',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="p-3">
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-xs font-semibold text-gray-600 uppercase tracking-wide">History</h3>
        <button (click)="refresh()" [disabled]="loading()"
          class="text-xs text-gray-500 hover:text-gray-800 disabled:opacity-40">
          {{ loading() ? '...' : '↻' }}
        </button>
      </div>

      @if (error()) {
        <p class="text-xs text-red-600 py-2">{{ error() }}</p>
      } @else if (!loading() && versions().length === 0) {
        <p class="text-xs text-gray-500 py-2">No history for this document.</p>
      }

      <ul class="space-y-1.5">
        @for (version of versions(); track version.version) {
          <li class="rounded border p-2 text-xs
                     {{ version.current
                          ? 'border-emerald-300 bg-emerald-50'
                          : 'border-gray-200 bg-white' }}">
            <div class="flex items-center gap-1.5">
              <span class="font-semibold text-gray-800">v{{ version.version }}</span>
              <span class="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                {{ versionService.operationLabel(version.operation) }}
              </span>
              @if (version.current) {
                <span class="px-1.5 py-0.5 rounded bg-emerald-600 text-white">current</span>
              }
            </div>

            @if (version.summary) {
              <p class="text-gray-600 mt-1 leading-snug">{{ version.summary }}</p>
            }

            <p class="text-gray-400 mt-1">
              {{ version.createdAt | date:'short' }}
              @if (version.createdBy) { · {{ version.createdBy }} }
              @if (version.fileSize) { · {{ versionService.formatSize(version.fileSize) }} }
            </p>

            <div class="flex gap-2 mt-1.5">
              <button (click)="download(version)"
                class="text-blue-600 hover:underline">Download</button>
              @if (!version.current) {
                <button (click)="restore(version)" [disabled]="restoring() !== null"
                  class="text-amber-700 hover:underline disabled:opacity-40">
                  {{ restoring() === version.version ? 'Restoring...' : 'Restore' }}
                </button>
              }
            </div>
          </li>
        }
      </ul>
    </div>
  `
})
export class VersionHistoryComponent {
  readonly versionService = inject(DocumentVersionService);
  private  state          = inject(ViewerStateService);

  readonly versions  = signal<DocumentVersion[]>([]);
  readonly loading   = signal(false);
  readonly error     = signal('');
  /** Version currently being restored, so only its button shows progress. */
  readonly restoring = signal<number | null>(null);

  constructor() {
    // Reload whenever an operation commits — the panel is the record of those
    // commits, so it would be stale the moment it mattered most.
    effect(() => {
      this.state.reloadToken();
      const documentId = this.state.documentId();
      if (documentId) this.load(documentId);
    });
  }

  refresh() { this.load(this.state.documentId()); }

  private load(documentId: number) {
    this.loading.set(true);
    this.error.set('');
    this.versionService.listVersions(documentId).subscribe({
      next: versions => {
        this.versions.set(versions);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load version history.');
        this.loading.set(false);
      }
    });
  }

  download(version: DocumentVersion) {
    this.versionService.downloadVersion(this.state.documentId(), version.version)
      .subscribe(blob => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${this.baseName()}_v${version.version}.pdf`;
        link.click();
        URL.revokeObjectURL(url);
      });
  }

  restore(version: DocumentVersion) {
    if (!confirm(
      `Restore version ${version.version}?\n\n` +
      'It is copied forward as a new version — nothing in the history is lost.'
    )) return;

    this.restoring.set(version.version);
    this.versionService.restore(this.state.documentId(), version.version).subscribe({
      next: restored => {
        this.restoring.set(null);
        // Reloads the viewer and, through the effect above, this list.
        this.state.applyVersionCommit(restored.version, restored.summary);
      },
      error: () => {
        this.restoring.set(null);
        this.error.set('Restore failed.');
      }
    });
  }

  private baseName(): string {
    const name = this.state.viewerData()?.name ?? 'document';
    return name.replace(/\.[^.]+$/, '');
  }
}
