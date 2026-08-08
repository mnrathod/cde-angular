import { Component, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import {
  RedactionService, RedactionPreset, REDACTION_PRESETS, TextSearch, TextMatch
} from '../../../core/services/redaction.service';
import { ViewerStateService } from '../../../core/services/viewer/viewer-state.service';

/**
 * Redaction: by hand, and by rule.
 *
 * <p>Drawn regions cover places someone pointed at. Search covers everything
 * matching a rule wherever it turns out to be — which is what makes it
 * useful, and also what makes a preview essential: redaction is the one
 * operation whose result cannot be recovered from inside the file, so the
 * matches are shown and counted before anything is destroyed.
 */
@Component({
  selector: 'app-redaction-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex-1 overflow-y-auto p-3">
      <div class="text-sm font-semibold text-gray-800 mb-1">Redaction</div>
      <p class="text-xs text-gray-500 mb-3">
        Permanently destroys the covered content and commits a new version.
        The previous version stays in the history. PDF documents only.
      </p>

      <!-- ── Find and redact ──────────────────────────────────── -->
      <div class="text-xs font-semibold text-gray-500 mb-1.5">Find and redact</div>

      <div class="flex flex-wrap gap-1 mb-2">
        @for (preset of presets; track preset.id) {
          <button (click)="togglePreset(preset.id)"
            class="text-xs px-1.5 py-0.5 rounded border transition-colors"
            [class]="isPresetOn(preset.id)
              ? 'bg-gray-800 border-gray-800 text-white'
              : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'">
            {{ preset.label }}
          </button>
        }
      </div>

      <input type="text" [(ngModel)]="term" (ngModelChange)="onSearchChanged()"
        placeholder="or type a word or phrase"
        class="w-full text-xs border border-gray-300 rounded px-2 py-1 mb-1.5" />

      <label class="flex items-center gap-1 text-xs text-gray-600 mb-0.5">
        <input type="checkbox" [(ngModel)]="matchCase" (ngModelChange)="onSearchChanged()" />
        Match case
      </label>
      <label class="flex items-center gap-1 text-xs text-gray-600 mb-2">
        <input type="checkbox" [(ngModel)]="wholeWord" (ngModelChange)="onSearchChanged()" />
        Whole word only
      </label>

      <div class="flex gap-1.5 mb-2">
        <button (click)="preview()" [disabled]="!hasSearch() || busy()"
          class="flex-1 text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-30">
          {{ searching() ? 'Searching...' : 'Preview matches' }}
        </button>
        <button (click)="redactMatches()" [disabled]="!canRedactMatches() || busy()"
          title="Permanently destroy every match"
          class="flex-1 text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-30">
          {{ redacting() ? 'Redacting...' : 'Redact all' }}
        </button>
      </div>

      @if (message()) {
        <p class="text-xs mb-2" [class]="messageIsError() ? 'text-red-600' : 'text-gray-600'">
          {{ message() }}
        </p>
      }

      @if (matches().length) {
        <div class="text-xs font-semibold text-gray-500 mb-1">
          {{ matches().length }} match(es) — these will be destroyed
        </div>
        <ul class="mb-3 max-h-40 overflow-y-auto border border-gray-100 rounded">
          @for (match of matches(); track $index) {
            <li (click)="state.navigateTo(match.page)"
                class="flex items-center gap-2 px-1.5 py-1 text-xs hover:bg-gray-50 cursor-pointer">
              <span class="text-gray-400 w-8 flex-shrink-0">p{{ match.page }}</span>
              <span class="font-mono truncate flex-1 text-gray-700">{{ match.text }}</span>
            </li>
          }
        </ul>
      }

      <!-- ── Drawn regions ────────────────────────────────────── -->
      <div class="text-xs font-semibold text-gray-500 mb-1.5 pt-2 border-t border-gray-100">
        Drawn regions
      </div>
      <p class="text-xs text-gray-500 mb-2">
        Pick the <span class="font-medium">Redact</span> tool and draw over content, then
        <span class="font-medium">Apply Redaction</span> in the toolbar.
      </p>

      @if (state.redactionRegions().length === 0) {
        <div class="text-center text-gray-400 text-xs py-4">No regions drawn yet.</div>
      } @else {
        @for (region of state.redactionRegions(); track region.id) {
          <div class="flex items-center gap-2 p-1.5 rounded hover:bg-gray-50 group mb-1 border border-gray-100">
            <div class="w-3 h-3 rounded-sm bg-black flex-shrink-0"></div>
            <span class="text-xs text-gray-600 flex-1">
              Page {{ region.page }} · {{ region.width.toFixed(0) }}×{{ region.height.toFixed(0) }}pt
            </span>
            <button (click)="state.removeRedactionRegion(region.id)"
              class="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-xs ml-1"
              title="Remove this region">✕</button>
          </div>
        }
      }
    </div>
  `
})
export class RedactionPanelComponent {
  private redaction = inject(RedactionService);
  readonly state    = inject(ViewerStateService);

  readonly presets = REDACTION_PRESETS;

  term      = '';
  matchCase = false;
  wholeWord = false;

  readonly selectedPresets = signal<Set<RedactionPreset>>(new Set());
  readonly matches   = signal<TextMatch[]>([]);
  readonly searching = signal(false);
  readonly redacting = signal(false);
  readonly message   = signal('');
  readonly messageIsError = signal(false);

  readonly busy = computed(() => this.searching() || this.redacting());

  /** Redacting all requires a previewed, non-empty result. */
  readonly canRedactMatches = computed(() => this.matches().length > 0);

  hasSearch(): boolean {
    return this.term.trim().length > 0 || this.selectedPresets().size > 0;
  }

  isPresetOn(preset: RedactionPreset): boolean {
    return this.selectedPresets().has(preset);
  }

  togglePreset(preset: RedactionPreset) {
    this.selectedPresets.update(current => {
      const next = new Set(current);
      next.has(preset) ? next.delete(preset) : next.add(preset);
      return next;
    });
    this.onSearchChanged();
  }

  /** Any change invalidates the preview, so it cannot be applied stale. */
  onSearchChanged() {
    this.matches.set([]);
    this.message.set('');
  }

  preview() {
    if (!this.hasSearch()) return;
    this.searching.set(true);
    this.message.set('');

    this.redaction.findText(this.state.documentId(), this.search()).subscribe({
      next: result => {
        this.searching.set(false);
        if (!result.success) {
          this.report(result.error ?? 'The document could not be searched.', true);
          return;
        }
        this.matches.set(result.matches ?? []);
        if (!result.matchCount) {
          this.report(result.pagesWithoutText
            ? 'No matches. Some pages have no text layer — run OCR to make them searchable.'
            : 'No matches found.', false);
        }
      },
      error: err => {
        this.searching.set(false);
        this.report(this.errorText(err, 'The document could not be searched.'), true);
      }
    });
  }

  redactMatches() {
    const count = this.matches().length;
    if (!count) return;
    if (!confirm(
      `Permanently destroy ${count} match(es)?\n\n` +
      'The content cannot be recovered from the resulting file. ' +
      'The current version stays in the history.'
    )) return;

    this.redacting.set(true);
    this.redaction.redactMatching(this.state.documentId(), this.search()).subscribe({
      next: result => {
        this.redacting.set(false);
        this.matches.set([]);
        this.state.applyVersionCommit(result.version, result.summary);
        this.report(result.summary, false);
      },
      error: err => {
        this.redacting.set(false);
        this.report(this.errorText(err, 'Redaction failed.'), true);
      }
    });
  }

  private search(): TextSearch {
    return {
      terms:     this.term.trim() ? [this.term.trim()] : [],
      presets:   [...this.selectedPresets()],
      matchCase: this.matchCase,
      wholeWord: this.wholeWord
    };
  }

  private report(text: string, isError: boolean) {
    this.message.set(text);
    this.messageIsError.set(isError);
  }

  private errorText(err: { status?: number; error?: { message?: string } }, fallback: string): string {
    if (err.status === 503) return 'The document conversion service is not running.';
    return err.error?.message ?? fallback;
  }
}
