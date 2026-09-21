/**
 * The stamp a signer is shown back after signing.
 *
 * <p>Built from the signature record as text, never from the server's SVG.
 * That SVG used to be bound through `[innerHTML]`; Angular's sanitiser has
 * no `<svg>` in its element allow-list, so it dropped every element and kept
 * only their text nodes run together — one unstyled line reading
 * `DIGITALLY SIGNEDSigned by: …Role: …`, with a raw ISO timestamp and no
 * layout. Not an error and not blank, just quietly wrong on every signing.
 *
 * <p>Rebuilding it from the record settles three things at once: §5.12 bans
 * the sanitiser bypass outright; the stamp is text — a name, a role, a
 * reason, a date — so an image of that text is unreadable to a screen reader
 * and unselectable by anyone (§1A.4); and the reply already carries every
 * field as data, so the SVG was a second, lossier copy of what we had.
 *
 * <p>The server still generates its SVG and still needs to: that copy is
 * drawn into the PDF, where it is a picture by necessity.
 */
import { ChangeDetectionStrategy, Component, Input } from "@angular/core";
import { DatePipe } from "@angular/common";

import { SignatureRecord } from "../../../core/services/signature.service";
import { signatureRoleName } from "./signature-wording";

@Component({
  selector: "app-signature-stamp",
  standalone: true,
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section i18n-aria-label="Names the block showing the signature that was just added@@signatures.appliedRegion"
             aria-label="Signature just applied"
             class="border border-green-200 rounded-lg p-3 bg-green-50">
      <div class="text-xs font-semibold text-green-800 mb-2">
        <span aria-hidden="true">✅</span>
        <ng-container i18n="@@signatures.applied">Signature Applied</ng-container>
      </div>

      <dl class="inline-block rounded border-2 px-3 py-2 bg-blue-50 not-italic"
          style="border-color:#1e5fbe;min-width:240px">
        <div class="text-xs font-bold tracking-wide pb-1 mb-1 border-b"
             style="color:#1e5fbe;border-color:#1e5fbe">
          <ng-container i18n="Wording drawn on the stamp that appears in the document itself@@signatures.stampTitle"
            >DIGITALLY SIGNED</ng-container
          >
        </div>
        <div class="flex gap-1 text-xs text-gray-700">
          <dt i18n="@@signatures.stampSignedBy" class="font-medium">Signed by:</dt><dd>{{ signature.signerName }}</dd>
        </div>
        <div class="flex gap-1 text-xs text-gray-700">
          <dt i18n="@@signatures.stampRole" class="font-medium">Role:</dt>
          <dd>{{ roleName() }}@if (signature.reason) { · {{ signature.reason }} }</dd>
        </div>
        <div class="flex gap-1 text-xs text-gray-500">
          <dt i18n="@@signatures.stampDate" class="font-medium">Date:</dt>
          <dd>{{ signature.signedAt | date: 'medium' }}</dd>
        </div>
        <div class="flex gap-1 text-xs text-gray-400">
          <dt i18n="Short reference a signature can be quoted by@@signatures.stampReference" class="font-medium">Ref:</dt>
          <dd class="font-mono">{{ reference() }}</dd>
        </div>
      </dl>

      <p i18n="Flattening burns markup into the page, making it part of the document@@signatures.stampNote"
         class="text-xs text-green-700 mt-2">
        This stamp will appear on the document when flattened.
      </p>
    </section>
  `,
})
export class SignatureStampComponent {
  @Input({ required: true }) signature!: SignatureRecord;

  roleName(): string {
    return signatureRoleName(this.signature.role);
  }

  /**
   * The short reference printed on the stamp.
   *
   * <p>Eight characters of the signature id, upper-cased, which is what the
   * server draws into the embedded stamp. Matching it matters: this preview
   * and the mark on the document have to be quotable as the same thing when
   * someone rings up asking about a signature.
   */
  reference(): string {
    return this.signature.signatureId.slice(0, 8).toUpperCase();
  }
}
