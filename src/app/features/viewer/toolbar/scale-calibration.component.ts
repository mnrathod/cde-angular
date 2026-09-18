/**
 * Telling the viewer what a drawing's scale is.
 *
 * <p>A drawing arrives as an image, so nothing in it says that a line on
 * screen is five metres on site. The user draws a line over something whose
 * length they know, and this asks what that length was; every measurement
 * afterwards is derived from the answer.
 *
 * <p>Opens by itself once the reference line exists, rather than on a button:
 * selecting the calibrate tool and drawing the line is the whole gesture.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";

import {
  MEASUREMENT_UNITS,
  MeasurementService,
  MeasurementUnit,
} from "../../../../viewer-core/measurement.service";
import { ViewerStateService } from "../../../../viewer-core/viewer-state.service";
import { ModalDialogComponent } from "../../../shared/components/modal-dialog.component";

@Component({
  selector: "app-scale-calibration",
  standalone: true,
  imports: [FormsModule, ModalDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state.pendingCalibrationPixels() > 0) {
      <app-modal-dialog
        [heading]="heading"
        [error]="error()"
        [confirmLabel]="applyLabel"
        (confirmed)="apply()"
        (dismissed)="cancel()"
      >
        <p
          i18n="Asks what real-world distance the drawn reference line represents. The emphasised value is its length on screen in pixels.@@toolbar.calibrationQuestion"
          class="text-xs text-gray-500 mb-4"
        >
          The line you drew is
          <span class="font-mono font-semibold"
            >{{ drawnPixels() }} px</span
          >. What is that distance on the drawing?
        </p>

        <div class="flex gap-2 mb-3">
          <input
            type="number"
            [(ngModel)]="knownDistance"
            name="calibrationValue"
            min="0"
            step="any"
            i18n-placeholder="Example of a distance@@toolbar.calibrationValuePlaceholder"
            placeholder="e.g. 5"
            i18n-aria-label="The real-world distance the drawn line represents@@toolbar.calibrationValueLabel"
            aria-label="Known distance"
            class="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded
                   focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <select
            [(ngModel)]="unit"
            name="calibrationUnit"
            i18n-aria-label="The unit the known distance is given in@@toolbar.calibrationUnitLabel"
            aria-label="Unit"
            class="px-2 py-1.5 text-sm border border-gray-300 rounded
                   focus:outline-none focus:ring-2 focus:ring-accent"
          >
            @for (option of units; track option) {
              <option [value]="option">{{ option }}</option>
            }
          </select>
        </div>
      </app-modal-dialog>
    }
  `,
})
export class ScaleCalibrationComponent {
  readonly state = inject(ViewerStateService);
  private measure = inject(MeasurementService);

  readonly units = MEASUREMENT_UNITS;
  knownDistance: number | null = null;
  unit: MeasurementUnit = "m";
  readonly error = signal("");

  readonly heading = $localize`:Heading of the dialog that sets a drawing's scale@@toolbar.calibrationHeading:Set drawing scale`;
  readonly applyLabel = $localize`:Confirms the entered scale@@toolbar.calibrationApply:Apply`;

  /** The reference line's length on screen, to one decimal place. */
  readonly drawnPixels = computed(() =>
    this.state.pendingCalibrationPixels().toFixed(1),
  );

  constructor() {
    // Cleared as the dialog opens rather than when the tool is picked: the
    // reference line is drawn in between, so resetting at selection time left
    // a stale error on screen while the user was still drawing.
    effect(() => {
      if (this.state.pendingCalibrationPixels() > 0) {
        this.knownDistance = null;
        this.error.set("");
      }
    });
  }

  apply(): void {
    const scale = this.measure.calibrate(
      this.state.pendingCalibrationPixels(),
      Number(this.knownDistance),
      this.unit,
    );
    if (!scale) {
      this.error.set(
        $localize`:Validation message in the scale dialog@@toolbar.calibrationInvalid:Enter a distance greater than zero.`,
      );
      return;
    }
    this.state.setScale(scale);
    this.state.pendingCalibrationPixels.set(0);
    this.state.activeTool.set("pan");
  }

  cancel(): void {
    this.state.pendingCalibrationPixels.set(0);
    this.error.set("");
    this.state.activeTool.set("pan");
  }
}
