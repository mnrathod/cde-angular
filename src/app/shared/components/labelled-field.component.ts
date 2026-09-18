/**
 * A form control with its label attached to it.
 *
 * <p>The pair was written out seven times across the project dialogs alone,
 * each repeating the same class string and the same `for`/`id` wiring. Every
 * one of those is a chance to mistype the `for` and leave a control that looks
 * labelled and is not — which a sighted user never notices and a screen-reader
 * user cannot work around.
 *
 * <p>The `for` stays the caller's to give, rather than generated here and
 * pushed onto the projected control through dependency injection. The caller
 * writes the `id` on the control anyway, so an explicit pair is one fewer
 * indirection and reads the same as plain HTML.
 */
import { ChangeDetectionStrategy, Component, input } from "@angular/core";

@Component({
  selector: "app-labelled-field",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div>
      <label
        [attr.for]="for()"
        class="block text-xs font-medium text-gray-600 mb-1"
        >{{ label() }}</label
      >
      <ng-content />
    </div>
  `,
})
export class LabelledFieldComponent {
  /** What the control is called. */
  label = input.required<string>();
  /** The `id` of the control this labels. */
  for = input.required<string>();
}
