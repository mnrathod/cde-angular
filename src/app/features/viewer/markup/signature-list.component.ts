/**
 * The signatures already on a document.
 *
 * <p>The status icon carried no accessible text and was not hidden either,
 * so a screen reader announced "white heavy check mark" beside a badge that
 * already said the status. The icon is decoration now; the badge is the
 * statement, which is also what keeps colour from being the only cue
 * (§1A.2).
 */
import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, Output,
} from "@angular/core";
import { DatePipe } from "@angular/common";

import { SignatureRecord } from "../../../core/services/signature.service";
import {
  signatureRoleClass, signatureRoleName, signatureStatusClass, signatureStatusName,
} from "./signature-wording";

@Component({
  selector: "app-signature-list",
  standalone: true,
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (busy) {
      <div i18n="@@signatures.loading" class="text-xs text-gray-400 text-center py-4">Loading signatures...</div>
    } @else if (signatures.length === 0) {
      <div class="text-center text-gray-400 py-6">
        <div class="text-2xl mb-2" aria-hidden="true">🔏</div>
        <div i18n="@@signatures.empty" class="text-xs">No signatures on this document yet</div>
      </div>
    } @else {
      <h4 i18n="Counts the signatures already on the document@@signatures.count"
          class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        {signatures.length, plural, =1 {1 Signature} other {{{ signatures.length }} Signatures}}
      </h4>
      <ul class="space-y-2 list-none p-0 m-0">
        @for (signature of signatures; track signature.signatureId) {
          <li class="flex items-start gap-3 p-3 rounded-lg border" [class]="rowClass(signature)">
            <span class="text-lg flex-shrink-0 mt-0.5" aria-hidden="true">{{ icon(signature) }}</span>

            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-xs font-semibold text-gray-800">{{ signature.signerName }}</span>
                <span class="text-xs px-1.5 py-0.5 rounded font-semibold"
                      [class]="roleClass(signature)">{{ roleName(signature) }}</span>
                <span class="text-xs px-1.5 py-0.5 rounded font-semibold ms-auto"
                      [class]="statusClass(signature)">{{ statusName(signature) }}</span>
              </div>
              @if (signature.reason) {
                <div class="text-xs text-gray-600 mt-0.5">{{ signature.reason }}</div>
              }
              <div class="text-xs text-gray-400 mt-1">
                {{ signature.signedAt | date: 'medium' }}
                @if (signature.version) { {{ coversVersionLabel(signature.version) }} }
              </div>
            </div>

            <button (click)="verifyRequested.emit(signature)"
              class="text-xs text-blue-600 hover:underline px-1 flex-shrink-0 min-h-6"
              [attr.aria-label]="verifyLabel(signature)">
              <span i18n="Re-checks that a signature still matches the document@@signatures.verify">Verify</span>
            </button>
          </li>
        }
      </ul>
    }
  `,
})
export class SignatureListComponent {
  @Input({ required: true }) signatures: readonly SignatureRecord[] = [];
  @Input() busy = false;

  @Output() verifyRequested = new EventEmitter<SignatureRecord>();

  roleName(signature: SignatureRecord): string {
    return signatureRoleName(signature.role);
  }

  statusName(signature: SignatureRecord): string {
    return signatureStatusName(signature.status);
  }

  roleClass(signature: SignatureRecord): string {
    return signatureRoleClass(signature.role);
  }

  statusClass(signature: SignatureRecord): string {
    return signatureStatusClass(signature.status);
  }

  rowClass(signature: SignatureRecord): string {
    if (signature.status === "VALID") return "bg-green-50 border-green-200";
    if (signature.status === "TAMPERED") return "bg-red-50 border-red-200";
    return "bg-gray-50 border-gray-200";
  }

  /** Decoration beside the badge that states the same thing in words. */
  icon(signature: SignatureRecord): string {
    if (signature.status === "VALID") return "✅";
    if (signature.status === "TAMPERED") return "⚠️";
    return "🔒";
  }

  /**
   * Names the signature each button checks.
   *
   * <p>"Verify" alone is announced identically on every row, which tells a
   * reader nothing about which signature they are about to re-check.
   */
  verifyLabel(signature: SignatureRecord): string {
    const signer = signature.signerName;
    return $localize`:Button that re-checks one person's signature against the document@@signatures.verifyOne:Verify the signature by ${signer}:signer:`;
  }

  /** Says which revision of the document a signature was applied to. */
  coversVersionLabel(version: number): string {
    return $localize`:Follows a signature's details to say which revision of the document it covers@@signature.coversVersion:· covers v${version}:version:`;
  }
}
