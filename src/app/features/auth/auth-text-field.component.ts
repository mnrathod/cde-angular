/**
 * A labelled text input on the sign-in card.
 *
 * <p>The same fifteen lines of markup were written five times across the two
 * forms — label, input, the same six focus and border classes — differing
 * only in id, label, type and autocomplete. Written once, the hint that some
 * of them carry can also be tied to its input, which it was not: the password
 * rule and the invitation-email note sat beside their fields with nothing
 * saying they belonged to them, so neither was read out on focus (§1A.2).
 */
import {
  booleanAttribute,
  ChangeDetectionStrategy, Component, EventEmitter, Input, Output,
} from "@angular/core";
import { FormsModule } from "@angular/forms";

@Component({
  selector: "app-auth-text-field",
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div>
      <label [attr.for]="fieldId" class="block text-xs font-medium text-gray-600 mb-1">
        {{ label }}
        @if (optionalNote) { <span class="text-gray-400">{{ optionalNote }}</span> }
      </label>

      <input
        [id]="fieldId"
        [attr.name]="fieldId"
        [type]="type"
        [ngModel]="value"
        (ngModelChange)="valueChange.emit($event)"
        [ngModelOptions]="{ standalone: true }"
        [required]="required"
        [attr.autocomplete]="autocomplete"
        [attr.minlength]="minLength"
        [attr.spellcheck]="spellcheck"
        [attr.aria-describedby]="hint ? hintId() : null"
        [class]="'w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent ' + extraClass"
      />

      @if (hint) {
        <p [id]="hintId()" class="text-xs text-gray-500 mt-1">{{ hint }}</p>
      }
    </div>
  `,
})
export class AuthTextFieldComponent {
  /** Also the input's `name`, so a password manager has something to key on. */
  @Input({ required: true }) fieldId!: string;
  @Input({ required: true }) label!: string;
  @Input() value = "";
  @Input() type: "text" | "email" | "password" = "text";
  /**
   * `transform` so the bare `required` attribute means what it looks like.
   *
   * <p>Without it, `<app-auth-text-field required>` passes the empty string,
   * which is not a boolean — caught by the production build, and by nothing
   * else: `tsc --noEmit` does not check Angular templates.
   */
  @Input({ transform: booleanAttribute }) required = false;
  /**
   * Left to the caller rather than guessed.
   *
   * <p>Getting this wrong is worse than omitting it — `current-password` on a
   * registration form invites the manager to fill the account the reader is
   * trying to replace. §1A.3 also depends on it: these fields must work with
   * a password manager, which is the same reason paste is never blocked.
   */
  @Input() autocomplete: string | null = null;
  /** Rendered only when set, so the attribute is absent rather than empty. */
  @Input() minLength: number | null = null;
  @Input() spellcheck: string | null = null;
  /** A sentence about this field, announced with it rather than beside it. */
  @Input() hint = "";
  /** The bracketed "(optional)" some labels carry, kept inside the label. */
  @Input() optionalNote = "";
  @Input() extraClass = "";

  @Output() valueChange = new EventEmitter<string>();

  hintId(): string {
    return `${this.fieldId}-hint`;
  }
}
