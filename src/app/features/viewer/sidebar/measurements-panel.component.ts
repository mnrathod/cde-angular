/**
 * Distances and areas taken off the document, and the scale they are read at.
 *
 * <p>The scale is shown whether or not it has been set, and says which it is:
 * a list of numbers with no units is worse than no list, because it looks
 * like an answer.
 */
import { ChangeDetectionStrategy, Component, inject } from "@angular/core";

import { abbreviatedPageLabel } from "../../../../viewer-core/page-labels";
import { ViewerStateService } from "../../../../viewer-core/viewer-state.service";

@Component({
  selector: "app-measurements-panel",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
  <div class="flex-1 overflow-y-auto p-3">
    <div class="flex items-center justify-between mb-1">
      <span i18n="@@sidebar.measurementsHeading" class="text-sm font-semibold text-gray-800">Measurements</span>
      @if (state.measurements().length > 0) {
        <button (click)="state.clearMeasurements()"
          i18n="Discards every measurement in the list@@sidebar.clearMeasurements"
          class="text-xs text-red-500 hover:text-red-700">Clear</button>
      }
    </div>

    <div class="flex items-center justify-between text-xs mb-3 p-2 rounded border"
         [class]="state.isCalibrated()
           ? 'bg-green-50 border-green-200 text-green-800'
           : 'bg-amber-50 border-amber-200 text-amber-800'">
      <span i18n="How many real-world units one screen pixel represents@@sidebar.scaleLabel">Scale</span>
      <span class="font-mono">
        {{ state.isCalibrated() ? calibratedScale() : uncalibratedLabel }}
      </span>
    </div>

    @if (!state.isCalibrated()) {
      <p i18n="Explains why measurements are in pixels. The emphasised word must match the toolbar's Calibrate label.@@sidebar.calibrateHint"
         class="text-xs text-gray-500 mb-3">
        Results are in pixels. Use <span class="font-medium">Calibrate</span> in the
        toolbar and draw a line over a known distance to read real units.
      </p>
    }

    @if (state.measurements().length === 0) {
      <div i18n="Empty state for the measurements panel. The three names must match the toolbar's tool labels.@@sidebar.noMeasurements"
           class="text-center text-gray-400 text-xs py-6">
        No measurements yet. Use Measure, Area or Radius.
      </div>
    } @else {
      @for (m of state.measurements(); track m.id) {
        <div class="p-2 rounded border border-gray-100 mb-1.5 group hover:bg-gray-50">
          <div class="flex items-start gap-2">
            <div class="flex-1 min-w-0">
              <div class="text-sm font-mono font-semibold text-gray-800">{{ m.value }}</div>
              <div class="text-xs text-gray-500">
                {{ m.kind }} · {{ m.detail }} · {{ pageShort(m.page) }}
              </div>
            </div>
            <button (click)="state.removeMeasurement(m.id)"
              class="opacity-0 group-hover:opacity-100 text-xs text-gray-400 hover:text-red-600"
              i18n-title="@@sidebar.removeMeasurement"
              title="Remove from list">✕</button>
          </div>
        </div>
      }
    }
  </div>
  `,
})
export class MeasurementsPanelComponent {
  readonly state = inject(ViewerStateService);

  pageShort = abbreviatedPageLabel;

  /**
   * The measurement scale, as shown beside the "Scale" label.
   *
   * <p>In a method rather than in the template because it is an expression,
   * which `i18n` cannot mark. The number is formatted before it reaches the
   * message so a translator never has to reason about decimal places.
   */
  calibratedScale(): string {
    const scale = this.state.measurementScale();
    const ratio = scale.unitsPerPixel.toFixed(5);
    const unit = scale.unit;
    return $localize`:How much one screen pixel is worth, e.g. "1px = 0.00423 m"@@sidebar.scaleValue:1px = ${ratio}:ratio: ${unit}:unit:`;
  }

  /** Shown in place of a scale until someone calibrates against a distance. */
  readonly uncalibratedLabel = $localize`:Shown where the measurement scale would be, before calibration@@sidebar.uncalibrated:uncalibrated`;
}
