import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  RedactionPreset, REDACTION_PRESETS, TextSearch,
} from '../../../core/services/redaction.service';
import { ViewerStateService } from '../../../../viewer-core/viewer-state.service';
import { RedactionMatchesComponent } from './redaction-matches.component';
import { RedactionRegionsComponent } from './redaction-regions.component';
import { RedactionSearchService } from './redaction-search.service';

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
  imports: [FormsModule, RedactionMatchesComponent, RedactionRegionsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [RedactionSearchService],
  template: `
    <div class="flex-1 overflow-y-auto p-3">
      <div i18n="@@redaction.heading" class="text-sm font-semibold text-gray-800 mb-1">Redaction</div>
      <p i18n="Warning above the redaction controls. Redaction is irreversible in the produced file.@@redaction.warning"
         class="text-xs text-gray-500 mb-3">
        Permanently destroys the covered content and commits a new version.
        The previous version stays in the history. PDF documents only.
      </p>

      <div i18n="@@redaction.findHeading" class="text-xs font-semibold text-gray-500 mb-1.5">Find and redact</div>

      <div class="flex flex-wrap gap-1 mb-2" role="group"
           i18n-aria-label="Names the row of buttons that switch on a kind of content to look for@@redaction.presetsGroup"
           aria-label="Kinds of content to find">
        @for (preset of presets; track preset.id) {
          <!--
            aria-pressed, because these are toggles. Whether one was on
            showed only as a darker background — colour as the sole carrier
            of meaning, and nothing at all to a screen reader (§1A.2).
          -->
          <button type="button" (click)="togglePreset(preset.id)"
            [attr.aria-pressed]="isPresetOn(preset.id)"
            class="text-xs px-1.5 py-1 rounded border transition-colors min-h-6"
            [class]="isPresetOn(preset.id)
              ? 'bg-gray-800 border-gray-800 text-white'
              : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'">
            {{ preset.label }}
          </button>
        }
      </div>

      <label class="sr-only" for="redaction-term">{{ termLabel }}</label>
      <input id="redaction-term" type="text" [(ngModel)]="term" (ngModelChange)="search.forget()"
        [ngModelOptions]="{ standalone: true }"
        i18n-placeholder="Follows the preset buttons, so it reads as an alternative to them@@redaction.termPlaceholder"
        placeholder="or type a word or phrase"
        class="w-full text-xs border border-gray-300 rounded px-2 py-1 mb-1.5" />

      <label class="flex items-center gap-1 text-xs text-gray-600 mb-0.5">
        <input type="checkbox" [(ngModel)]="matchCase" (ngModelChange)="search.forget()"
               [ngModelOptions]="{ standalone: true }" />
        <ng-container i18n="@@redaction.matchCase">Match case</ng-container>
      </label>
      <label class="flex items-center gap-1 text-xs text-gray-600 mb-2">
        <input type="checkbox" [(ngModel)]="wholeWord" (ngModelChange)="search.forget()"
               [ngModelOptions]="{ standalone: true }" />
        <ng-container i18n="@@redaction.wholeWord">Whole word only</ng-container>
      </label>

      <div class="flex gap-1.5 mb-2">
        <button type="button" (click)="preview()" [disabled]="!hasSearch() || search.busy()"
          [attr.aria-busy]="search.searching() ? 'true' : null"
          class="flex-1 text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-30">
          {{ search.searching() ? searchingLabel : previewLabel }}
        </button>
        <button type="button" (click)="redactMatches()"
          [disabled]="!search.canRedactMatches() || search.busy()"
          [attr.aria-busy]="search.redacting() ? 'true' : null"
          i18n-title="@@redaction.redactAllHint" title="Permanently destroy every match"
          class="flex-1 text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-30">
          {{ search.redacting() ? redactingLabel : redactAllLabel }}
        </button>
      </div>

      <!-- A live region: how many matches a preview found, and what a
           redaction destroyed, both appeared silently before. -->
      <div role="status" aria-live="polite">
        @if (search.message()) {
          <p class="text-xs mb-2"
             [class]="search.messageIsError() ? 'text-red-600' : 'text-gray-600'">
            {{ search.message() }}
          </p>
        }
      </div>

      <app-redaction-matches
        [matches]="search.matches()"
        (chosen)="state.navigateTo($event)"
      />

      <app-redaction-regions
        [regions]="state.redactionRegions()"
        (removed)="state.removeRedactionRegion($event)"
      />
    </div>
  `
})
export class RedactionPanelComponent {
  readonly search = inject(RedactionSearchService);
  readonly state = inject(ViewerStateService);

  readonly presets = REDACTION_PRESETS;

  term = '';
  matchCase = false;
  wholeWord = false;

  readonly selectedPresets = signal<Set<RedactionPreset>>(new Set());

  /**
   * Labels that sit in expressions and so cannot be marked with `i18n` —
   * see the note in login.component.ts.
   */
  readonly previewLabel = $localize`:Finds matches without changing anything@@redaction.previewAction:Preview matches`;
  readonly searchingLabel = $localize`:Preview button while the search is running@@redaction.searchingAction:Searching...`;
  readonly redactAllLabel = $localize`:Destroys every match found@@redaction.redactAllAction:Redact all`;
  readonly redactingLabel = $localize`:Redact-all button while the request is in flight@@redaction.redactingAction:Redacting...`;
  readonly termLabel = $localize`:Accessible name of the box for typing a word to redact@@redaction.termLabel:Word or phrase to redact`;

  hasSearch(): boolean {
    return this.term.trim().length > 0 || this.selectedPresets().size > 0;
  }

  isPresetOn(preset: RedactionPreset): boolean {
    return this.selectedPresets().has(preset);
  }

  togglePreset(preset: RedactionPreset) {
    this.selectedPresets.update(current => {
      const next = new Set(current);
      if (next.has(preset)) next.delete(preset);
      else next.add(preset);
      return next;
    });
    this.search.forget();
  }


  preview() {
    if (!this.hasSearch()) return;
    this.search.preview(this.terms());
  }

  redactMatches() {
    const count = this.search.matches().length;
    if (!count) return;
    // Typed confirmation is §1.3's rule for destructive tenant-level
    // operations; this is destructive but scoped to one document, so a
    // confirm is the right weight. Undo is not available — that is the point.
    const question = $localize`:Confirmation before irreversibly destroying content. Shown with a count of matches.@@redaction.confirmQuestion:Permanently destroy ${count}:count: match(es)?`;
    const consequence = $localize`:Second paragraph of the redaction confirmation@@redaction.confirmConsequence:The content cannot be recovered from the resulting file. The current version stays in the history.`;
    if (!confirm(`${question}\n\n${consequence}`)) return;

    this.search.redactMatches(this.terms());
  }

  private terms(): TextSearch {
    return {
      terms: this.term.trim() ? [this.term.trim()] : [],
      presets: [...this.selectedPresets()],
      matchCase: this.matchCase,
      wholeWord: this.wholeWord,
    };
  }
}
