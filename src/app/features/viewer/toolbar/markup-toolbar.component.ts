import {
  Component, inject, Output, EventEmitter, ChangeDetectionStrategy, signal,
} from '@angular/core';

import { ViewerStateService } from '../../../../viewer-core/viewer-state.service';
import { IconComponent } from '../../../../viewer-core/icon.component';
import { toolForKey } from '../../../../viewer-core/tool-catalog';
import { DocumentOperationsService } from './document-operations.service';
import { DocumentActionsComponent } from './document-actions.component';
import { MarkupContextBarComponent } from './markup-context-bar.component';
import { ScaleCalibrationComponent } from './scale-calibration.component';
import { ViewControlsComponent } from './view-controls.component';
import { ICON_BUTTON, TOOLBAR_DIVIDER } from './toolbar-buttons';

/**
 * The command bar above the document, and the context bar beneath it.
 *
 * The split follows what a control acts on. Commands that apply whatever you
 * happen to be drawing — undo, the view controls, the document actions — are
 * always in the same place and never move. Options belonging to the tool in
 * hand appear only while it is held, in the context bar. The previous ribbon
 * mixed the two, so the toolbar's width changed with the selected tab and
 * undo/redo were pushed off the end of the row below 1920px.
 *
 * <p>The row carries no `role="toolbar"` deliberately. That role promises
 * arrow-key navigation over a single tab stop, and a row of plain buttons is
 * already conformant without it — each one is reachable and named. Declaring
 * the role without the behaviour is the defect the sign-in tabs had (§1A.2).
 */
@Component({
  selector: 'app-markup-toolbar',
  standalone: true,
  imports: [
    IconComponent, DocumentActionsComponent, ViewControlsComponent,
    MarkupContextBarComponent, ScaleCalibrationComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKey($event)' },
  template: `
    <div class="flex flex-col flex-shrink-0 bg-white border-b border-gray-200">

      <div class="flex items-center h-10 px-2 gap-0.5">

        <button type="button" (click)="state.undo()" [disabled]="!state.canUndo()"
          i18n-title="Tooltip on undo. Ctrl+Z is the keyboard shortcut and stays as it is.@@toolbar.undoHint"
          title="Undo (Ctrl+Z)"
          i18n-aria-label="@@toolbar.undo" aria-label="Undo" [class]="iconButton">
          <app-icon name="undo" [size]="17" />
        </button>
        <button type="button" (click)="state.redo()" [disabled]="!state.canRedo()"
          i18n-title="Tooltip on redo. Ctrl+Y is the keyboard shortcut and stays as it is.@@toolbar.redoHint"
          title="Redo (Ctrl+Y)"
          i18n-aria-label="@@toolbar.redo" aria-label="Redo" [class]="iconButton">
          <app-icon name="redo" [size]="17" />
        </button>
        <button type="button" (click)="clearAll()"
          i18n-title="@@toolbar.clearAllHint" title="Delete all markup"
          i18n-aria-label="@@toolbar.clearAll" aria-label="Delete all markup"
          [class]="iconButton + ' hover:text-red-600'">
          <app-icon name="trash" [size]="17" />
        </button>

        <div [class]="divider"></div>

        <app-view-controls />

        <div [class]="divider"></div>

        <app-document-actions
          [saving]="saving()"
          (saveRequested)="saveMarkup()"
          (printRequested)="print()"
          (flattenRequested)="flattenToPage()"
        />

        <!-- Right-aligned: things that are only sometimes true. -->
        <div class="ms-auto flex items-center gap-1.5 ps-2">
          @if (state.redactionRegions().length > 0) {
            <button type="button" (click)="operations.applyRedaction()" [disabled]="operations.redacting()"
              i18n-title="@@toolbar.applyRedactionHint"
              title="Permanently destroy the content under these regions and commit a new version"
              class="h-7 px-2.5 inline-flex items-center gap-1.5 text-xs font-medium rounded-md
                     bg-red-50 text-red-700 border border-red-200 hover:bg-red-100
                     disabled:opacity-40">
              <app-icon name="redact" [size]="15" />
              <span>{{ operations.redacting() ? redactingLabel : applyRedactionLabel(state.redactionRegions().length) }}</span>
            </button>
          }

          <!--
            A live region. A commit finishing is the one thing on this bar
            that happens without the reader asking for it just then, and it
            appeared silently beside controls they were already using.
          -->
          <div role="status" aria-live="polite">
            @if (state.processingMessage()) {
              <button type="button"
                (click)="state.sidebarTab.set('versions'); state.processingMessage.set('')"
                i18n-title="@@toolbar.openHistoryHint" title="Open version history"
                class="h-7 px-2.5 inline-flex items-center gap-1.5 text-xs rounded-md
                       bg-emerald-50 text-emerald-800 border border-emerald-200
                       hover:bg-emerald-100 max-w-[22rem]">
                <app-icon name="check" [size]="15" />
                <span class="truncate">{{ state.processingMessage() }}</span>
              </button>
            }
          </div>
        </div>
      </div>

      <app-markup-context-bar />

      <app-scale-calibration />
    </div>
  `
})
export class MarkupToolbarComponent {
  readonly state = inject(ViewerStateService);
  readonly operations = inject(DocumentOperationsService);

  /** Saving is the viewer's own, not one of the document operations. */
  readonly saving = signal(false);

  @Output() saveRequested = new EventEmitter<void>();
  @Output() printRequested = new EventEmitter<void>();

  readonly iconButton = ICON_BUTTON;
  readonly divider = TOOLBAR_DIVIDER;

  readonly redactingLabel = $localize`:Redaction button while the request is in flight. Short toolbar label.@@toolbar.redacting:Redacting`;

  /** Label of the button that destroys the drawn regions, with how many. */
  applyRedactionLabel(regionCount: number): string {
    return $localize`:Button that permanently destroys the drawn regions, naming how many@@toolbar.applyRedaction:Apply redaction (${regionCount}:count:)`;
  }

  /**
   * Discarding every annotation on the document is not undoable past the
   * undo stack's depth, so it asks first — the button sits beside undo and
   * redo, which are not destructive, and a misclick would otherwise cost the
   * whole markup session.
   */
  clearAll() {
    const count = this.state.shapes().length;
    if (!count) return;
    const question = $localize`:Confirmation before discarding every annotation on the document@@toolbar.confirmClearAll:Delete all ${count}:count: markup item(s) on this document?`;
    if (!confirm(question)) return;
    this.state.clearAll();
  }

  /**
   * The shortcuts, on both modifier keys.
   *
   * <p>`ctrlKey` alone meant none of these worked on a Mac, where the
   * convention is Command — so a Mac reader had no keyboard route to save,
   * undo or print from the viewer at all. `Ctrl/Cmd+Shift+Z` is the redo
   * spelling most editors use and `key` reports it capitalised, which is why
   * the comparison is case-insensitive rather than against `'z'`.
   */
  onKey(event: KeyboardEvent) {
    const command = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();

    if (command && key === 'z' && event.shiftKey) { event.preventDefault(); this.state.redo(); return; }
    if (command && key === 'z') { event.preventDefault(); this.state.undo(); return; }
    if (command && key === 'y') { event.preventDefault(); this.state.redo(); return; }
    if (command && key === 's') { event.preventDefault(); this.saveMarkup(); return; }
    if (command && key === 'p') { event.preventDefault(); this.print(); return; }

    if (this.isTyping(event)) return;

    // Keys are unique across the catalog — asserted by tool-catalog.spec.ts,
    // because a duplicate silently makes the later tool unreachable rather
    // than failing loudly.
    const match = toolForKey(event.key);
    if (!match) return;
    if (match.pdfOnly && !this.operations.isPdf()) return;
    this.state.activeTool.set(match.id);
  }

  /**
   * TEXTAREA and contenteditable as well as INPUT: a note or callout body is
   * not an `<input>`, and without this every letter typed into one would also
   * switch tool.
   */
  private isTyping(event: KeyboardEvent): boolean {
    const target = event.target as HTMLElement;
    return target.tagName === 'INPUT'
      || target.tagName === 'TEXTAREA'
      || target.isContentEditable;
  }

  saveMarkup() { this.saveRequested.emit(); }
  print() { this.printRequested.emit(); }

  /** Flattening cannot be undone, so it asks before it starts. */
  flattenToPage() {
    this.operations.flattenToPage((question) => confirm(question));
  }
}
