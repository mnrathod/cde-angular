/**
 * Asking in what capacity, and why, someone is signing.
 *
 * <p>The Apply button was disabled until a reason was typed and said nothing
 * about why. §1.1 allows a disabled control only where the disabled state
 * teaches something, so it now carries the condition, and the field says it
 * is required rather than leaving the reader to infer it from a dead button.
 */
import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, Output,
} from "@angular/core";
import { FormsModule } from "@angular/forms";

import { SignRequest } from "../../../core/services/signature.service";

@Component({
  selector: "app-sign-document-form",
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
      <div i18n="@@signatures.formHeading" class="text-xs font-semibold text-blue-800 mb-2">Sign this document</div>

      <div>
        <label i18n="The capacity in which someone is signing@@signatures.roleLabel"
               for="sign-role" class="block text-xs font-medium text-gray-600 mb-1">Role</label>
        <select id="sign-role" [(ngModel)]="request.role" class="entry">
          <option value="Author" i18n="Signing role — the person who produced the document@@signatureRole.author">Author</option>
          <option value="Reviewer" i18n="Signing role — the person who checked the document@@signatureRole.reviewer">Reviewer</option>
          <option value="Approver" i18n="Signing role — the person who authorised the document for use@@signatureRole.approver">Approver</option>
        </select>
      </div>

      <div>
        <label i18n="Why the document is being signed@@signatures.reasonLabel"
               for="sign-reason" class="block text-xs font-medium text-gray-600 mb-1">Reason</label>
        <input id="sign-reason" [(ngModel)]="request.reason" aria-required="true"
          [attr.aria-describedby]="hasReason() ? null : 'sign-reason-hint'"
          i18n-placeholder="Example of a signing reason@@signatures.reasonPlaceholder"
          placeholder="e.g. Reviewed and approved for construction" class="entry" />
        @if (!hasReason()) {
          <p id="sign-reason-hint" class="text-xs text-gray-500 mt-1"
             i18n="Says why the apply-signature button cannot be pressed yet@@signatures.reasonRequired">
            A signature has to say why it was applied, so this cannot be left blank.
          </p>
        }
      </div>

      <div class="flex justify-end gap-2">
        <button (click)="cancelled.emit()" i18n="@@signatures.cancel"
          class="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50">
          Cancel
        </button>
        <button (click)="submitted.emit()" [disabled]="signing || !hasReason()"
          [title]="hasReason() ? '' : reasonRequiredHint"
          class="px-3 py-1.5 text-xs bg-accent text-white rounded disabled:opacity-40 hover:bg-blue-700">
          {{ signing ? signingLabel : applyLabel }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .entry {
      width: 100%; padding: .375rem .5rem; font-size: .75rem;
      border: 1px solid #d1d5db; border-radius: .25rem;
    }
    .entry:focus { outline: none; box-shadow: 0 0 0 2px var(--accent, #2563eb); }
  `],
})
export class SignDocumentFormComponent {
  @Input({ required: true }) request!: SignRequest;
  @Input() signing = false;

  @Output() submitted = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  hasReason(): boolean {
    return !!this.request.reason.trim();
  }

  /** Labels that live in expressions, so `i18n` cannot mark them. */
  readonly applyLabel = $localize`:Applies the signature to the document@@signatures.applyAction:Apply Signature`;
  readonly signingLabel = $localize`:Apply-signature button while the request is in flight@@signatures.signingAction:Signing...`;
  readonly reasonRequiredHint = $localize`:Tooltip on the disabled apply-signature button@@signatures.reasonRequiredHint:Give a reason for signing first`;
}
