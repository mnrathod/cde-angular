import {
  Component, inject, Output, EventEmitter, ChangeDetectionStrategy, signal, computed
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ViewerStateService, MarkupTool } from '../../../core/services/viewer/viewer-state.service';
import { FlattenService } from '../../../core/services/viewer/flatten.service';
import { AnnotationService } from '../../../core/services/viewer/annotation.service';
import { RedactionService } from '../../../core/services/redaction.service';
import { OcrService } from '../../../core/services/ocr.service';
import {
  MeasurementService, MeasurementUnit, MEASUREMENT_UNITS
} from '../../../core/services/viewer/measurement.service';

interface Tool { id: MarkupTool; icon: string; label: string; key: string; }

/** Ribbon tabs, in the order a review typically runs. */
export type RibbonTabId = 'home' | 'markup' | 'measure' | 'review';

/**
 * A captioned cluster of related tools within a tab.
 *
 * `iconOnly` drops the text labels for a group that would otherwise push the
 * row into a horizontal scroll — currently only Shapes, whose nine glyphs are
 * the most self-describing of the set. The name and shortcut stay reachable
 * through the tooltip, and the group caption still says what the cluster is.
 */
export interface ToolGroup {
  name: string;
  tools: ReadonlyArray<Tool>;
  iconOnly?: boolean;
}

@Component({
  selector: 'app-markup-toolbar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKey($event)' },
  template: `
    <div class="flex flex-col flex-shrink-0 border-b"
         style="background:#f8fafc;border-color:#dde1e7">

      <!-- ── Tab strip ──────────────────────────────────────────
           Zoom and rotation sit here rather than in a tab: they apply to
           the document whatever you are doing, so hiding them behind a tab
           would cost a round trip every time. -->
      <div class="flex items-center gap-1 px-2 pt-1">
        @for (tab of ribbonTabs; track tab.id) {
          <button type="button" (click)="activeRibbonTab.set(tab.id)"
            [title]="tab.hint"
            [attr.aria-current]="activeRibbonTab() === tab.id ? 'true' : null"
            class="px-3 py-1 text-xs font-semibold rounded-t transition-colors border-b-2"
            [class]="activeRibbonTab() === tab.id
              ? 'border-accent text-accent bg-white'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'">
            {{ tab.label }}
          </button>
        }

        <div class="ml-auto flex items-center gap-1 pb-1">
          <!--
            Undo/redo/clear live here rather than on the Markup tab: they act
            on the document whichever tab is open, and on the Markup tab they
            were pushed off the end of the row entirely at anything under
            1920px — hiding the two most-used actions in the toolbar.
          -->
          <button type="button" (click)="state.undo()" [disabled]="!state.canUndo()"
            title="Undo (Ctrl+Z)"
            class="h-7 px-2 text-xs rounded border bg-white border-gray-300 hover:bg-gray-50 disabled:opacity-40">
            ↩
          </button>
          <button type="button" (click)="state.redo()" [disabled]="!state.canRedo()"
            title="Redo (Ctrl+Y)"
            class="h-7 px-2 text-xs rounded border bg-white border-gray-300 hover:bg-gray-50 disabled:opacity-40">
            ↪
          </button>
          <button type="button" (click)="state.clearAll()" title="Clear all markup"
            class="h-7 px-2 text-xs rounded border bg-white border-gray-300 hover:bg-gray-50 text-red-500">
            🗑
          </button>

          <div class="w-px h-5 bg-gray-300 mx-1"></div>

          <button type="button" (click)="state.zoomOut()" title="Zoom out"
            class="h-7 w-7 text-xs rounded border bg-white border-gray-300 hover:bg-gray-50">−</button>
          <span class="text-xs text-gray-600 w-12 text-center">{{ (state.zoom() * 100).toFixed(0) }}%</span>
          <button type="button" (click)="state.zoomIn()" title="Zoom in"
            class="h-7 w-7 text-xs rounded border bg-white border-gray-300 hover:bg-gray-50">+</button>
          <button type="button" (click)="state.zoomFit()" title="Fit page to window"
            class="h-7 px-2 text-xs rounded border bg-white border-gray-300 hover:bg-gray-50">Fit</button>
          <button type="button" (click)="state.rotateClockwise()"
            [title]="'Rotate 90° clockwise' + (state.rotation() ? ' (currently ' + state.rotation() + '°)' : '')"
            class="h-7 px-2 text-xs rounded border bg-white border-gray-300 hover:bg-gray-50"
            [class.ring-2]="state.rotation() !== 0">
            ⟳{{ state.rotation() ? ' ' + state.rotation() + '°' : '' }}
          </button>
        </div>
      </div>

      <!-- ── Ribbon body ───────────────────────────────────────
           Groups are captioned and separated by rules. Every group is
           rendered in one flex row that does not wrap, so a family of
           tools can never be split across lines the way the old flat bar
           split Calibrate away from Measure/Area/Radius. -->
      <div class="flex items-stretch bg-white border-t overflow-x-auto"
           style="border-color:#e5e7eb">

        <!-- Tool groups for the active tab -->
        @for (group of toolGroups(); track group.name) {
          <div class="flex flex-col items-center px-2.5 py-1.5 border-r flex-shrink-0"
               style="border-color:#e5e7eb">
            <div class="flex items-center gap-1">
              @for (t of group.tools; track t.id) {
                <ng-container *ngTemplateOutlet="toolButton;
                  context: { $implicit: t, iconOnly: group.iconOnly }"></ng-container>
              }
            </div>
            <div class="text-[9px] uppercase tracking-wider text-gray-400 mt-1">{{ group.name }}</div>
          </div>
        }

        @switch (activeRibbonTab()) {

          @case ('home') {
            <div class="flex flex-col items-center px-2.5 py-1.5 border-r flex-shrink-0"
                 style="border-color:#e5e7eb">
              <div class="flex items-center gap-1">
                <button type="button" (click)="saveMarkup()"
                  [class.ring-2]="state.dirty()"
                  title="Save annotations (Ctrl+S)"
                  class="h-7 px-2.5 text-xs rounded border bg-white border-gray-300 hover:bg-gray-50 ring-accent">
                  💾 {{ saving() ? 'Saving...' : state.dirty() ? 'Save *' : 'Saved' }}
                </button>
                <button type="button" (click)="print()" title="Print with annotations (Ctrl+P)"
                  class="h-7 px-2.5 text-xs rounded border bg-white border-gray-300 hover:bg-gray-50">
                  🖨 Print
                </button>
              </div>
              <div class="text-[9px] uppercase tracking-wider text-gray-400 mt-1">Document</div>
            </div>

            <div class="flex flex-col items-center px-2.5 py-1.5 border-r flex-shrink-0"
                 style="border-color:#e5e7eb">
              <div class="flex items-center gap-1">
                <button type="button" (click)="exportXfdf()"
                  title="Export XFDF (Bluebeam/Acrobat/Procore compatible)"
                  class="h-7 px-2.5 text-xs rounded border bg-white border-gray-300 hover:bg-gray-50">
                  📤 Export
                </button>
                <label title="Import XFDF annotations"
                  class="h-7 px-2.5 text-xs rounded border bg-white border-gray-300 hover:bg-gray-50 flex items-center cursor-pointer">
                  📥 Import
                  <input type="file" accept=".xfdf" class="hidden" (change)="importXfdf($event)" />
                </label>
              </div>
              <div class="text-[9px] uppercase tracking-wider text-gray-400 mt-1">XFDF</div>
            </div>
          }

          @case ('markup') {
            <div class="flex flex-col items-center px-2.5 py-1.5 border-r flex-shrink-0"
                 style="border-color:#e5e7eb">
              <div class="flex items-center gap-2">
                <label class="flex items-center gap-1 cursor-pointer" title="Stroke color">
                  <span class="text-xs text-gray-500">Color</span>
                  <input type="color" [ngModel]="state.strokeColor()"
                    (ngModelChange)="state.strokeColor.set($event)"
                    class="h-6 w-8 rounded border border-gray-300 cursor-pointer p-0.5" />
                </label>
                <label class="flex items-center gap-1" title="Line width">
                  <span class="text-xs text-gray-500">Width</span>
                  <select [ngModel]="state.strokeWidth()"
                    (ngModelChange)="state.strokeWidth.set(+$event)"
                    class="h-6 text-xs border border-gray-300 rounded px-1">
                    <option [value]="1">1px</option>
                    <option [value]="2">2px</option>
                    <option [value]="3">3px</option>
                    <option [value]="5">5px</option>
                  </select>
                </label>
              </div>
              <div class="text-[9px] uppercase tracking-wider text-gray-400 mt-1">Style</div>
            </div>

          }

          @case ('measure') {
            <div class="flex flex-col items-center px-2.5 py-1.5 border-r flex-shrink-0"
                 style="border-color:#e5e7eb">
              <div class="flex items-center gap-1">
                <button type="button" (click)="startCalibration()"
                  [class.ring-2]="state.activeTool() === 'calibrate'"
                  [title]="state.isCalibrated()
                    ? 'Recalibrate: draw a line over a known distance'
                    : 'Measurements are in pixels until the drawing is calibrated'"
                  class="h-7 px-2.5 text-xs rounded border ring-amber-400
                         {{ state.isCalibrated()
                              ? 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                              : 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100' }}">
                  ⚖ {{ state.isCalibrated() ? scaleLabel() : 'Calibrate' }}
                </button>
              </div>
              <div class="text-[9px] uppercase tracking-wider text-gray-400 mt-1">Scale</div>
            </div>

            @if (!state.isCalibrated()) {
              <div class="flex items-center px-3 text-[11px] text-amber-700">
                Calibrate first — measurements read in pixels until the drawing has a scale.
              </div>
            }
          }

          @case ('review') {
            <div class="flex flex-col items-center px-2.5 py-1.5 border-r flex-shrink-0"
                 style="border-color:#e5e7eb">
              <div class="flex items-center gap-1">
                <button type="button" (click)="flattenPdf()" [disabled]="!isPdf() || flattening()"
                  [title]="!isPdf()
                    ? 'Flattening is only available for PDF documents'
                    : 'Bake annotations into the page as permanent content'"
                  class="h-7 px-2.5 text-xs rounded border bg-white border-gray-300 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">
                  ▤ {{ flattening() ? 'Flattening...' : 'Flatten' }}
                </button>
                <button type="button" (click)="runOcr()" [disabled]="!isPdf() || ocrRunning()"
                  [title]="!isPdf()
                    ? 'OCR is only available for PDF documents'
                    : 'Make a scanned PDF searchable by adding an invisible text layer'"
                  class="h-7 px-2.5 text-xs rounded border bg-white border-gray-300 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">
                  🔎 {{ ocrRunning() ? 'Running OCR...' : 'OCR' }}
                </button>
              </div>
              <div class="text-[9px] uppercase tracking-wider text-gray-400 mt-1">Process</div>
            </div>
          }
        }

        <!-- Status: applies to every tab, so it lives outside the switch. -->
        <div class="flex items-center gap-2 px-3 ml-auto flex-shrink-0">
          <!-- Apply redaction (PDF only) -->
          @if (state.redactionRegions().length > 0) {
            <button type="button" (click)="applyRedaction()" [disabled]="redacting()"
              title="Permanently destroy the content under these regions and commit a new version"
              class="h-7 px-2.5 text-xs rounded border bg-red-50 border-red-300 text-red-700 hover:bg-red-100 disabled:opacity-40">
              ⬛ {{ redacting() ? 'Redacting...' : 'Apply Redaction (' + state.redactionRegions().length + ')' }}
            </button>
          }

          <!-- Outcome of the last processing run -->
          @if (state.processingMessage()) {
            <button type="button"
              (click)="state.sidebarTab.set('versions'); state.processingMessage.set('')"
              title="Open version history"
              class="h-7 px-2.5 text-xs rounded border bg-emerald-50 border-emerald-300 text-emerald-800
                     hover:bg-emerald-100 max-w-[22rem] truncate">
              ✓ {{ state.processingMessage() }}
            </button>
          }
        </div>
      </div>

      <!-- Calibration dialog: opens once the reference line has been drawn -->
      @if (state.pendingCalibrationPixels() > 0) {
        <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-[600] flex items-center justify-center">
          <div class="bg-white rounded-lg shadow-2xl p-6 w-80">
            <h3 class="font-semibold text-gray-800 mb-1">⚖ Calibrate Scale</h3>
            <p class="text-xs text-gray-500 mb-4">
              The line you drew is
              <span class="font-mono font-semibold">{{ state.pendingCalibrationPixels().toFixed(1) }} px</span>.
              What is that distance on the drawing?
            </p>

            <div class="flex gap-2 mb-3">
              <input type="number" [(ngModel)]="calibrationValue" name="calibrationValue"
                min="0" step="any" placeholder="e.g. 5"
                class="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded
                       focus:outline-none focus:ring-2 focus:ring-accent" />
              <select [(ngModel)]="calibrationUnit" name="calibrationUnit"
                class="px-2 py-1.5 text-sm border border-gray-300 rounded
                       focus:outline-none focus:ring-2 focus:ring-accent">
                @for (unit of units; track unit) { <option [value]="unit">{{ unit }}</option> }
              </select>
            </div>

            @if (calibrationError()) {
              <div class="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2 mb-3">
                {{ calibrationError() }}
              </div>
            }

            <div class="flex gap-2 justify-end">
              <button (click)="cancelCalibration()"
                class="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50">Cancel</button>
              <button (click)="applyCalibration()"
                class="px-3 py-1.5 text-xs bg-accent text-white rounded hover:bg-blue-700 font-semibold">
                Apply
              </button>
            </div>
          </div>
        </div>
      }

    </div>

    <!--
      One definition for every tool button, so a group is described only by
      which tools it holds. The keyboard hint comes from the tool's own key,
      which is what makes the uniqueness test worth having.
    -->
    <ng-template #toolButton let-t let-iconOnly="iconOnly">
      <button type="button"
        (click)="setTool(t.id)"
        [disabled]="(t.id === 'redact' || t.id === 'formfield') && !isPdf()"
        [title]="toolHint(t)"
        [attr.aria-label]="t.label"
        class="h-7 text-xs rounded border transition-all flex items-center justify-center gap-1 font-medium disabled:opacity-30 disabled:cursor-not-allowed"
        [class.px-2.5]="!iconOnly"
        [class.w-8]="iconOnly"
        [class]="state.activeTool() === t.id
          ? 'bg-accent text-white border-accent shadow-sm'
          : 'bg-white text-gray-600 border-gray-300 hover:bg-blue-50 hover:text-accent hover:border-blue-300'">
        <span>{{ t.icon }}</span>
        @if (!iconOnly) { <span>{{ t.label }}</span> }
      </button>
    </ng-template>
  `
})
export class MarkupToolbarComponent {
  state      = inject(ViewerStateService);
  annService    = inject(AnnotationService);
  flattenService = inject(FlattenService);
  redactionService = inject(RedactionService);
  ocrService       = inject(OcrService);
  measure          = inject(MeasurementService);

  // Signals, not plain fields: this component is OnPush, so a bare field
  // mutated from an async HTTP callback never re-renders — the button would
  // stay stuck on "Redacting..."/"Running OCR..." after the call finished.
  readonly saving     = signal(false);
  readonly redacting  = signal(false);
  readonly ocrRunning = signal(false);
  readonly flattening = signal(false);

  @Output() saveRequested  = new EventEmitter<void>();
  @Output() printRequested = new EventEmitter<void>();

  readonly ribbonTabs: ReadonlyArray<{ id: RibbonTabId; label: string; hint: string }> = [
    { id: 'home',    label: 'Home',    hint: 'Navigation, saving and XFDF exchange' },
    { id: 'markup',  label: 'Markup',  hint: 'Shapes, text and highlighting' },
    { id: 'measure', label: 'Measure', hint: 'Calibrate the drawing, then measure length, area and radius' },
    { id: 'review',  label: 'Review',  hint: 'Redaction, form fields and document processing' },
  ];

  readonly activeRibbonTab = signal<RibbonTabId>('home');

  /**
   * Tools by ribbon tab, then by group.
   *
   * The grouping is the point of this structure, not decoration: in the
   * previous flat bar the measurement family was split across wrapped rows
   * with Calibrate stranded beside OCR, which is why Area and Radius read as
   * missing even though they were present.
   */
  private static readonly TOOL_GROUPS:
      Readonly<Record<RibbonTabId, ReadonlyArray<ToolGroup>>> = {
    home: [
      { name: 'Navigate', tools: [
        { id: 'pan',       icon: '✋', label: 'Pan',       key: 'V' },
        { id: 'select',    icon: '↖',  label: 'Select',    key: 'S' },
      ]},
    ],
    markup: [
      { name: 'Shapes', iconOnly: true, tools: [
        { id: 'line',      icon: '╱',  label: 'Line',      key: 'L' },
        { id: 'arrow',     icon: '→',  label: 'Arrow',     key: 'A' },
        { id: 'rect',      icon: '□',  label: 'Rect',      key: 'R' },
        { id: 'circle',    icon: '○',  label: 'Circle',    key: 'C' },
        { id: 'ellipse',   icon: '⬭',  label: 'Ellipse',   key: 'E' },
        { id: 'polygon',   icon: '⬠',  label: 'Polygon',   key: 'G' },
        { id: 'polyline',  icon: '⌁',  label: 'Polyline',  key: 'Y' },
        { id: 'freehand',  icon: '✏',  label: 'Freehand',  key: 'F' },
        { id: 'cloud',     icon: '☁',  label: 'Cloud',     key: 'K' },
      ]},
      { name: 'Text', tools: [
        { id: 'text',      icon: 'T',  label: 'Text',      key: 'T' },
        { id: 'callout',   icon: '💬', label: 'Callout',   key: 'O' },
        { id: 'note',      icon: '🗒',  label: 'Note',      key: 'N' },
        { id: 'stamp',     icon: '🔴', label: 'Stamp',     key: 'P' },
      ]},
      { name: 'Highlighting', tools: [
        { id: 'highlight', icon: '▌',  label: 'Highlight', key: 'H' },
        { id: 'underline', icon: 'U',  label: 'Underline', key: 'U' },
        { id: 'strikeout', icon: 'S̶',  label: 'Strikeout', key: 'D' },
        // 'W' for wavy: 'Q' belonged to Area, and the collision meant Area
        // could never be reached from the keyboard at all.
        { id: 'squiggly',  icon: '〜', label: 'Squiggly',  key: 'W' },
      ]},
    ],
    measure: [
      { name: 'Measure', tools: [
        { id: 'dimension', icon: '↔',  label: 'Length',    key: 'M' },
        { id: 'area',      icon: '⬡',  label: 'Area',      key: 'Q' },
        // 'I' because 'E' is Ellipse, which shadowed Radius entirely.
        { id: 'radius',    icon: '◎',  label: 'Radius',    key: 'I' },
      ]},
    ],
    review: [
      { name: 'PDF tools', tools: [
        { id: 'redact',    icon: '⬛', label: 'Redact',    key: 'X' },
        { id: 'formfield', icon: '▭',  label: 'Field',     key: 'B' },
      ]},
    ],
  };

  /** Groups shown for the tab currently selected. */
  readonly toolGroups = computed(
    () => MarkupToolbarComponent.TOOL_GROUPS[this.activeRibbonTab()]);

  /** Every tool across every tab — the keyboard map and its uniqueness test. */
  static allTools(): Tool[] {
    return Object.values(MarkupToolbarComponent.TOOL_GROUPS)
      .flatMap(groups => groups.flatMap(group => [...group.tools]));
  }

  /** The groups on one tab. Exposed so the layout itself can be asserted. */
  static groupsFor(tab: RibbonTabId): ReadonlyArray<ToolGroup> {
    return MarkupToolbarComponent.TOOL_GROUPS[tab];
  }

  readonly tools: Tool[] = MarkupToolbarComponent.allTools();

  /** Tools whose readouts depend on the drawing's scale. */
  private static readonly MEASUREMENT_TOOLS: MarkupTool[] = ['dimension', 'area', 'radius'];

  isMeasurementTool(tool: MarkupTool): boolean {
    return MarkupToolbarComponent.MEASUREMENT_TOOLS.includes(tool);
  }

  /** The tab a tool lives on, so a shortcut can reveal where it came from. */
  private static tabForTool(id: MarkupTool): RibbonTabId | null {
    for (const [tab, groups] of Object.entries(MarkupToolbarComponent.TOOL_GROUPS)) {
      if (groups.some(group => group.tools.some(tool => tool.id === id))) {
        return tab as RibbonTabId;
      }
    }
    return null;
  }

  toolHint(t: Tool): string {
    if (t.id === 'formfield') return 'Draw a form field, then name it in the Form panel';
    if (t.id === 'redact' && !this.isPdf()) return 'Redaction is only available for PDF documents';
    if (t.id === 'polygon' || t.id === 'polyline') {
      return `${t.label} (${t.key}) — click to add points, double-click to finish`;
    }
    return `${t.label} (${t.key})`;
  }

  setTool(t: MarkupTool) {
    // Both need a PDF to act on, matching the buttons' disabled state.
    if ((t === 'redact' || t === 'formfield') && !this.isPdf()) return;
    this.state.activeTool.set(t);
    // Keep the ribbon on the tab owning the tool, so a keyboard shortcut
    // does not leave the selected tool invisible on another tab.
    const tab = MarkupToolbarComponent.tabForTool(t);
    if (tab) this.activeRibbonTab.set(tab);
  }

  isPdf(): boolean {
    return this.state.viewerData()?.type === 'pdf';
  }

  /**
   * Burn the marked regions out of the document. The result becomes the
   * document's current version, so the removed content is gone for every
   * later reader and every later operation — not just in a copy the person
   * who ran it happens to hold.
   */
  applyRedaction() {
    const docId   = this.state.documentId();
    const regions = this.state.redactionRegions();
    if (!regions.length) return;

    this.redacting.set(true);
    this.redactionService.redact(docId, regions).subscribe({
      next: result => {
        this.redacting.set(false);
        this.state.clearRedactionRegions();
        this.state.applyVersionCommit(result.version, result.summary);
      },
      error: err => {
        this.redacting.set(false);
        this.state.processingMessage.set(this.failureMessage(err, 'Redaction'));
      }
    });
  }

  /**
   * Turn a scanned PDF into a searchable one by adding an invisible text
   * layer. Committed as a new version, so the text is available to search,
   * selection and any later processing rather than living in a side copy.
   */
  runOcr() {
    if (!this.isPdf()) return;

    this.ocrRunning.set(true);
    this.ocrService.makeSearchable(this.state.documentId()).subscribe({
      next: result => {
        this.ocrRunning.set(false);
        this.state.applyVersionCommit(result.version, result.summary);
      },
      error: err => {
        this.ocrRunning.set(false);
        this.state.processingMessage.set(this.failureMessage(err, 'OCR'));
      }
    });
  }

  /**
   * Server error text is authored by the backend for display; anything else
   * gets a generic line naming the likely cause rather than the exception.
   */
  private failureMessage(err: { status?: number; error?: { message?: string } }, action: string): string {
    if (err.status === 503) return `${action} failed — the document converter service is not running.`;
    return err.error?.message ?? `${action} failed.`;
  }

  // ── Scale calibration ────────────────────────────────────────
  readonly units = MEASUREMENT_UNITS;
  calibrationValue: number | null = null;
  calibrationUnit: MeasurementUnit = 'm';
  readonly calibrationError = signal('');

  /** Short readout for the toolbar button, e.g. "1px = 0.025 m". */
  scaleLabel(): string {
    const scale = this.state.measurementScale();
    return `1px = ${Number(scale.unitsPerPixel.toFixed(5))} ${scale.unit}`;
  }

  startCalibration() {
    this.calibrationError.set('');
    this.calibrationValue = null;
    // Selecting the tool is the whole action — the dialog opens by itself
    // once the reference line has been drawn.
    this.state.activeTool.set('calibrate');
  }

  applyCalibration() {
    const scale = this.measure.calibrate(
      this.state.pendingCalibrationPixels(),
      Number(this.calibrationValue),
      this.calibrationUnit
    );
    if (!scale) {
      this.calibrationError.set('Enter a distance greater than zero.');
      return;
    }
    this.state.setScale(scale);
    this.state.pendingCalibrationPixels.set(0);
    this.state.activeTool.set('pan');
  }

  cancelCalibration() {
    this.state.pendingCalibrationPixels.set(0);
    this.calibrationError.set('');
    this.state.activeTool.set('pan');
  }

  private downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  onKey(e: KeyboardEvent) {
    if (e.ctrlKey && e.key === 'z')  { e.preventDefault(); this.state.undo(); return; }
    if (e.ctrlKey && e.key === 'y')  { e.preventDefault(); this.state.redo(); return; }
    if (e.ctrlKey && e.key === 's')  { e.preventDefault(); this.saveMarkup();  return; }
    if (e.ctrlKey && e.key === 'p')  { e.preventDefault(); this.print();        return; }
    // TEXTAREA and contenteditable as well as INPUT: a note or callout body
    // is not an <input>, and without this every letter typed into one would
    // also switch tool.
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

    // Single-key shortcuts. Keys are unique across every tab — asserted by
    // markup-toolbar.component.spec.ts, because a duplicate silently makes
    // the later tool unreachable rather than failing loudly.
    const match = this.tools.find(t => t.key.toLowerCase() === e.key.toLowerCase());
    if (match) this.setTool(match.id);
  }

  saveMarkup() { this.saveRequested.emit(); }
  print()      { this.printRequested.emit(); }

  /**
   * Bake the markup into the page itself, server-side, and commit the result
   * as a new version.
   *
   * Flattening is destructive by definition: once the shapes are page content
   * they are no longer editable annotations, so the annotation records that
   * produced them are removed to stop the overlay drawing a second copy on
   * top of the baked-in one. The pre-flatten file stays in the version
   * history, so the document itself can be restored.
   */
  flattenPdf() {
    const shapes = this.state.shapes();
    if (!this.isPdf() || !shapes.length) {
      this.state.processingMessage.set('There are no annotations to flatten.');
      return;
    }
    if (!confirm(
      `Flatten ${shapes.length} annotation(s) into the page?\n\n` +
      'They become permanent page content and will no longer be editable. ' +
      'The current version stays in the history and can be restored.'
    )) return;

    this.flattening.set(true);
    this.flattenService.flattenToPdf({
      documentId: this.state.documentId(),
      shapes,
      quality: 'print'
    }).subscribe({
      next: result => {
        this.flattening.set(false);
        this.discardFlattenedAnnotations();
        this.state.applyVersionCommit(result.version, result.summary);
      },
      error: err => {
        this.flattening.set(false);
        this.state.processingMessage.set(this.failureMessage(err, 'Flatten'));
      }
    });
  }

  /**
   * Drops the annotations now living in the page content, locally and on the
   * server. Without this they reload on the next open and render on top of
   * the flattened copy of themselves.
   */
  private discardFlattenedAnnotations() {
    const saved = this.state.annotations();
    this.state.shapes.set([]);
    this.state.annotations.set([]);
    this.state.dirty.set(false);
    saved.forEach(annotation =>
      this.annService.deleteAnnotation(annotation.id).subscribe({
        error: () => { /* the flatten already succeeded; a stale record is cosmetic */ }
      })
    );
  }

  exportXfdf() {
    const docId = this.state.documentId();
    this.annService.exportXfdf(docId).subscribe(blob =>
      this.downloadBlob(blob, `annotations-doc-${docId}.xfdf`)
    );
  }

  importXfdf(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const docId = this.state.documentId();
    this.annService.importXfdf(docId, file).subscribe({
      next: anns => {
        this.state.setAnnotationsSaved(anns);
        // Also load shapes from returned annotations
        const shapes = this.annService.annotationsToShapes(anns);
        shapes.forEach(s => this.state.shapes.update(all => [...all, s]));
      },
      error: err => console.error('XFDF import failed', err)
    });
  }
}
