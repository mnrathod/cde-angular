/**
 * The strip beneath the command bar, carrying whatever the tool in hand needs.
 *
 * <p>The split follows what a control acts on. Commands that apply to the
 * whole document whatever you happen to be drawing live in the command bar
 * and never move; options belonging to the tool currently held appear only
 * while it is held. The ribbon this replaced mixed the two, so the toolbar's
 * width changed with the selected tab and undo/redo were pushed off the end
 * of the row below 1920px.
 *
 * <p>It is absent, not empty, when the tool has nothing to say: Pan and
 * Select carry no options and need no instruction, and a bar that is always
 * there with nothing in it is what makes chrome feel arbitrary.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from "@angular/core";
import { FormsModule } from "@angular/forms";

import { IconComponent } from "../../../../viewer-core/icon.component";
import { MarkupEngineService } from "../../../../viewer-core/markup-engine.service";
import { MEASUREMENT_TOOLS, allTools, usesStrokeStyle } from "../../../../viewer-core/tool-catalog";
import { MarkupTool, ViewerStateService } from "../../../../viewer-core/viewer-state.service";

/** Line widths offered, in CSS pixels. */
const STROKE_WIDTHS = [1, 2, 3, 5];

@Component({
  selector: "app-markup-context-bar",
  standalone: true,
  imports: [FormsModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (showContextBar()) {
      <div class="flex items-center h-9 px-3 gap-3 border-t border-gray-200 bg-gray-50/80">

        <span class="text-xs font-semibold text-gray-700">{{ activeToolLabel() }}</span>

        @if (usesStrokeStyle(state.activeTool())) {
          <div [class]="contextDivider"></div>

          <label class="flex items-center gap-1.5 cursor-pointer"
                 i18n-title="@@toolbar.strokeColourHint" title="Stroke colour">
            <span i18n="Colour of the line a markup tool draws. Short — it sits in a crowded strip.@@toolbar.strokeColour"
                  class="text-xs text-gray-500">Colour</span>
            <input type="color" [ngModel]="state.strokeColor()"
              (ngModelChange)="state.strokeColor.set($event)"
              i18n-aria-label="@@toolbar.strokeColourLabel" aria-label="Stroke colour"
              class="h-6 w-8 rounded border border-gray-300 cursor-pointer p-0.5 bg-white" />
          </label>

          <label class="flex items-center gap-1.5"
                 i18n-title="@@toolbar.strokeWidthHint" title="Line width">
            <span i18n="Thickness of the line a markup tool draws. Short — it sits in a crowded strip.@@toolbar.strokeWidth"
                  class="text-xs text-gray-500">Width</span>
            <select [ngModel]="state.strokeWidth()"
              (ngModelChange)="state.strokeWidth.set(+$event)"
              i18n-aria-label="@@toolbar.strokeWidthLabel" aria-label="Line width"
              class="h-6 w-16 text-xs border border-gray-300 rounded px-1.5 bg-white">
              @for (width of strokeWidths; track width) {
                <option [value]="width">{{ width }} px</option>
              }
            </select>
          </label>
        }

        @if (isMeasurementTool(state.activeTool())) {
          <div [class]="contextDivider"></div>

          @if (state.isCalibrated()) {
            <span i18n="The drawing scale currently in force@@toolbar.scale"
                  class="text-xs text-gray-600">
              Scale <span class="font-mono font-medium">{{ scaleLabel() }}</span>
            </span>
            <button type="button" (click)="startCalibration()"
              i18n="Sets the drawing scale again@@toolbar.recalibrate"
              class="text-xs text-accent hover:underline">Recalibrate</button>
          } @else {
            <button type="button" (click)="startCalibration()"
              i18n-title="@@toolbar.calibrateHint"
              title="Draw a line over a known distance to set the drawing's scale"
              class="h-6 px-2 inline-flex items-center gap-1.5 text-xs font-medium rounded
                     bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100">
              <app-icon name="calibrate" [size]="14" />
              <span i18n="Prompt to calibrate, shown while measurements have no real-world units@@toolbar.setScale"
                >Set scale — readings are in pixels until you do</span
              >
            </button>
          }
        }

        @if (completionHint()) {
          <span class="ms-auto text-xs text-gray-500">{{ completionHint() }}</span>
        }
      </div>
    }
  `,
})
export class MarkupContextBarComponent {
  readonly state = inject(ViewerStateService);
  private engine = inject(MarkupEngineService);

  readonly strokeWidths = STROKE_WIDTHS;
  readonly contextDivider = "w-px h-4 bg-gray-300";

  private readonly toolsByRail = allTools();

  readonly activeToolLabel = computed(
    () =>
      this.toolsByRail.find((tool) => tool.id === this.state.activeTool())
        ?.label ?? "",
  );

  // The engine returns a finished sentence, so there is nothing to capitalise
  // here — doing so worked in English and was wrong anywhere the casing rules
  // differ.
  readonly completionHint = computed(() =>
    this.engine.completionHint(this.state.activeTool()),
  );

  /** Whether the active tool has anything to show. */
  readonly showContextBar = computed(() => {
    const active = this.state.activeTool();
    return (
      usesStrokeStyle(active) ||
      this.isMeasurementTool(active) ||
      !!this.engine.completionHint(active)
    );
  });

  usesStrokeStyle = usesStrokeStyle;

  isMeasurementTool(tool: MarkupTool): boolean {
    return MEASUREMENT_TOOLS.includes(tool);
  }

  /** Short readout for the bar, e.g. "1px = 0.025 m". */
  scaleLabel(): string {
    const scale = this.state.measurementScale();
    return `1px = ${Number(scale.unitsPerPixel.toFixed(5))} ${scale.unit}`;
  }

  /**
   * Selecting the tool is the whole action — the dialog opens by itself once
   * the reference line has been drawn.
   */
  startCalibration(): void {
    this.state.activeTool.set("calibrate");
  }
}
