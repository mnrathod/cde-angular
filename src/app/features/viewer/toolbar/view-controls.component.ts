/**
 * Zoom and rotation: the controls that change the view, not the document.
 *
 * <p>The zoom reading was `{{ (state.zoom() * 100).toFixed(0) }}%` — an
 * interpolation with a bare symbol stuck to it. The markup sweep cannot see
 * a symbol outside a message, so no translator ever received it, and where
 * the percent sign goes is not the same in every locale; neither is the
 * digit group separator. `Intl.NumberFormat` knows both.
 */
import { ChangeDetectionStrategy, Component, inject } from "@angular/core";

import { IconComponent } from "../../../../viewer-core/icon.component";
import { ViewerStateService } from "../../../../viewer-core/viewer-state.service";
import { ACTIVE_ICON_BUTTON, ICON_BUTTON } from "./toolbar-buttons";

@Component({
  selector: "app-view-controls",
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" (click)="state.zoomOut()"
      i18n-title="@@toolbar.zoomOutHint" title="Zoom out"
      i18n-aria-label="@@toolbar.zoomOut" aria-label="Zoom out" [class]="iconButton">
      <app-icon name="zoom-out" [size]="17" />
    </button>

    <span class="w-12 text-center text-xs tabular-nums text-gray-600">{{ zoomLabel() }}</span>

    <button type="button" (click)="state.zoomIn()"
      i18n-title="@@toolbar.zoomInHint" title="Zoom in"
      i18n-aria-label="@@toolbar.zoomIn" aria-label="Zoom in" [class]="iconButton">
      <app-icon name="zoom-in" [size]="17" />
    </button>

    <button type="button" (click)="state.zoomFit()"
      i18n-title="@@toolbar.zoomFitHint" title="Fit page to window"
      i18n-aria-label="@@toolbar.zoomFit" aria-label="Fit page to window" [class]="iconButton">
      <app-icon name="fit" [size]="17" />
    </button>

    <button type="button" (click)="state.rotateClockwise()"
      [title]="rotateHint()"
      i18n-aria-label="Spelled out in words rather than as 90°, so a screen reader says it correctly@@toolbar.rotate"
      aria-label="Rotate 90 degrees clockwise"
      [class]="state.rotation() ? activeIconButton : iconButton">
      <app-icon name="rotate" [size]="17" />
    </button>
  `,
})
export class ViewControlsComponent {
  readonly state = inject(ViewerStateService);

  readonly iconButton = ICON_BUTTON;
  readonly activeIconButton = ACTIVE_ICON_BUTTON;

  /** The zoom, as a percentage in the reader's own number formatting. */
  zoomLabel(): string {
    return new Intl.NumberFormat($localize.locale ?? undefined, {
      style: "percent",
      maximumFractionDigits: 0,
    }).format(this.state.zoom());
  }

  rotateHint(): string {
    const rotation = this.state.rotation();
    return rotation
      ? $localize`:Tooltip on rotate, when the page is already turned@@toolbar.rotateHintTurned:Rotate 90° clockwise (currently ${rotation}:degrees:°)`
      : $localize`:Tooltip on rotate, when the page is the right way up@@toolbar.rotateHint:Rotate 90° clockwise`;
  }
}
