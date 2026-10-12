/**
 * The crosshair the keyboard aims with.
 *
 * <p>Extracted on the second caller rather than the third, against §3.3's
 * usual advice, for the reason that section's own exception exists: the PDF
 * page and the CAD drawing are the two surfaces this file's siblings warn
 * about drifting, and they have drifted before over exactly this — which
 * gestures work on which surface. A cursor drawn twice is a cursor that ends
 * up two sizes, or present on one surface and missing on the other, and a
 * reader who cannot see it has no way to tell which.
 *
 * <p>A crosshair rather than a dot so it reads as an aiming point and stays
 * legible over dense line work, and drawn twice — a wide light stroke under a
 * narrow dark one — so it holds contrast against both a white sheet and a dark
 * drawing without relying on either (§1A.2).
 *
 * <p>Applied to a `<g>` so it keeps the SVG namespace it is drawn in:
 *
 * ```html
 * <svg …>
 *   <g markupKeyboardCursor [at]="session.keyboardCursor()"></g>
 * </svg>
 * ```
 */
import { ChangeDetectionStrategy, Component, Input } from "@angular/core";

import { PointerPoint } from "./markup-engine.service";

/** Half the length of each arm, in surface units. */
const ARM = 12;

@Component({
  selector: "[markupKeyboardCursor]",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (at; as cursor) {
      <svg:g pointer-events="none">
        <svg:line [attr.x1]="cursor.x - ARM" [attr.y1]="cursor.y"
              [attr.x2]="cursor.x + ARM" [attr.y2]="cursor.y"
              stroke="#ffffff" stroke-width="4"/>
        <svg:line [attr.x1]="cursor.x" [attr.y1]="cursor.y - ARM"
              [attr.x2]="cursor.x" [attr.y2]="cursor.y + ARM"
              stroke="#ffffff" stroke-width="4"/>
        <svg:line [attr.x1]="cursor.x - ARM" [attr.y1]="cursor.y"
              [attr.x2]="cursor.x + ARM" [attr.y2]="cursor.y"
              stroke="#0369a1" stroke-width="2"/>
        <svg:line [attr.x1]="cursor.x" [attr.y1]="cursor.y - ARM"
              [attr.x2]="cursor.x" [attr.y2]="cursor.y + ARM"
              stroke="#0369a1" stroke-width="2"/>
      </svg:g>
    }
  `,
})
export class MarkupKeyboardCursorComponent {
  /** Where the crosshair sits, or null when the keyboard is not drawing. */
  @Input() at: PointerPoint | null = null;

  protected readonly ARM = ARM;
}
