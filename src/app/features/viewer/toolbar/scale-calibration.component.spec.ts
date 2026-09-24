import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';

import { ScaleCalibrationComponent } from './scale-calibration.component';
import { ViewerStateService } from '../../../../viewer-core/viewer-state.service';
import { MeasurementService } from '../../../../viewer-core/measurement.service';

/**
 * Telling the viewer what a drawing's scale is.
 *
 * <p>Every measurement the user takes afterwards is derived from the number
 * entered here, so a bad answer accepted silently is worse than a refusal —
 * it produces plausible lengths that are all wrong by the same factor. The
 * cases below are mostly about what the dialog refuses.
 *
 * <p>The real `MeasurementService` is used rather than a stub, because the
 * validation under test is its own: it is what decides that a distance of
 * zero is not a scale.
 */
describe('setting a drawing’s scale', () => {
  let fixture: ComponentFixture<ScaleCalibrationComponent>;
  let component: ScaleCalibrationComponent;
  let state: ViewerStateService;

  /** Draws a reference line of the given length, which opens the dialog. */
  function drawReferenceLine(pixels: number) {
    state.pendingCalibrationPixels.set(pixels);
    fixture.detectChanges();
  }

  function dialogText() {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ScaleCalibrationComponent],
      providers: [ViewerStateService, MeasurementService],
    });
    fixture = TestBed.createComponent(ScaleCalibrationComponent);
    component = fixture.componentInstance;
    state = TestBed.inject(ViewerStateService);
    fixture.detectChanges();
  });

  describe('when the dialog appears', () => {
    it('stays closed until a reference line is drawn', () => {
      expect(dialogText().trim()).toBe('');
    });

    it('opens as soon as one is', () => {
      // Selecting the tool and drawing the line is the whole gesture; there
      // is no button to press afterwards.
      drawReferenceLine(240);

      expect(dialogText()).toContain('What is that distance');
    });

    it('says how long the drawn line was', () => {
      drawReferenceLine(240);

      expect(dialogText()).toContain('240.0');
    });

    it('rounds the drawn length rather than showing full precision', () => {
      // 173.20508075688772 px is not a number anyone needs to read.
      drawReferenceLine(173.20508075688772);

      expect(component.drawnPixels()).toBe('173.2');
    });

    it('opens with the distance field empty', () => {
      drawReferenceLine(240);

      expect(component.knownDistance).toBeNull();
    });

    it('offers metres by default', () => {
      expect(component.unit).toBe('m');
    });

    it('offers every unit the viewer can measure in', () => {
      drawReferenceLine(240);
      const options = fixture.nativeElement.querySelectorAll('option');

      expect(options).toHaveLength(component.units.length);
    });
  });

  describe('what it refuses', () => {
    beforeEach(() => drawReferenceLine(240));

    it('refuses a distance of zero', () => {
      component.knownDistance = 0;

      component.apply();

      expect(component.error()).toContain('greater than zero');
    });

    it('refuses a negative distance', () => {
      component.knownDistance = -5;

      component.apply();

      expect(component.error()).toContain('greater than zero');
    });

    it('refuses an empty distance', () => {
      component.knownDistance = null;

      component.apply();

      expect(component.error()).toContain('greater than zero');
    });

    it('leaves the dialog open after a refusal', () => {
      // Closing it would discard the reference line and make the reader
      // draw it again to correct a typo.
      component.knownDistance = 0;

      component.apply();

      expect(state.pendingCalibrationPixels()).toBe(240);
    });

    it('does not set a scale it refused', () => {
      component.knownDistance = 0;

      component.apply();

      expect(state.measurementScale().unit).toBe('px');
    });
  });

  describe('applying a scale', () => {
    beforeEach(() => drawReferenceLine(240));

    it('records the scale the answer implies', () => {
      component.knownDistance = 12;
      component.unit = 'm';

      component.apply();

      expect(state.measurementScale().unit).toBe('m');
      expect(state.measurementScale().unitsPerPixel).toBeCloseTo(12 / 240);
    });

    it('closes the dialog', () => {
      component.knownDistance = 12;

      component.apply();

      expect(state.pendingCalibrationPixels()).toBe(0);
    });

    it('puts the reader back on the pan tool', () => {
      // Staying on calibrate means the next drag opens this dialog again,
      // which reads as the scale not having been accepted.
      state.activeTool.set('calibrate');
      component.knownDistance = 12;

      component.apply();

      expect(state.activeTool()).toBe('pan');
    });

    it('honours the unit chosen alongside the number', () => {
      component.knownDistance = 500;
      component.unit = 'mm';

      component.apply();

      expect(state.measurementScale().unit).toBe('mm');
    });
  });

  describe('cancelling', () => {
    beforeEach(() => drawReferenceLine(240));

    it('closes without setting a scale', () => {
      component.cancel();

      expect(state.pendingCalibrationPixels()).toBe(0);
      expect(state.measurementScale().unit).toBe('px');
    });

    it('puts the reader back on the pan tool', () => {
      state.activeTool.set('calibrate');

      component.cancel();

      expect(state.activeTool()).toBe('pan');
    });

    it('clears any error it was showing', () => {
      component.knownDistance = 0;
      component.apply();

      component.cancel();

      expect(component.error()).toBe('');
    });
  });

  describe('drawing a second reference line', () => {
    it('clears the error left from the first attempt', () => {
      // The reset happens as the dialog opens, not when the tool is picked:
      // the line is drawn in between, so resetting at selection time left a
      // stale error on screen while the reader was still drawing.
      drawReferenceLine(240);
      component.knownDistance = 0;
      component.apply();
      expect(component.error()).not.toBe('');

      state.pendingCalibrationPixels.set(0);
      fixture.detectChanges();
      drawReferenceLine(180);

      expect(component.error()).toBe('');
    });

    it('clears the distance left from the first attempt', () => {
      drawReferenceLine(240);
      component.knownDistance = 12;
      component.apply();

      drawReferenceLine(180);

      expect(component.knownDistance).toBeNull();
    });
  });
});
