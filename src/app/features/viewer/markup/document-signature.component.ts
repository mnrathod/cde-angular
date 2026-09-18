import { Component, Input, signal, inject, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SignatureService, SignatureRecord, SignRequest } from '../../../core/services/signature.service';
import { ViewerStateService } from '../../../../viewer-core/viewer-state.service';

@Component({
  selector: 'app-document-signature',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="p-4 space-y-4">

      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h3 i18n="@@signatures.heading" class="text-sm font-semibold text-gray-800">Digital Signatures</h3>
          <p i18n="Explains what kind of signature this is. X.509 and PKI are standard names and stay as they are.@@signatures.subheading"
             class="text-xs text-gray-500 mt-0.5">
            PKI-based document signing with X.509 certificates
          </p>
        </div>
        <button (click)="showSignForm.set(!showSignForm())"
          class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-accent text-white rounded hover:bg-blue-700 transition-colors">
          <span aria-hidden="true">✍️</span>
          <ng-container i18n="Opens the form for signing this document@@signatures.signDocument"
            >Sign Document</ng-container
          >
        </button>
      </div>

      <!-- Sign form -->
      @if (showSignForm()) {
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
          <div i18n="@@signatures.formHeading" class="text-xs font-semibold text-blue-800 mb-2">Sign this document</div>

          <div>
            <label i18n="The capacity in which someone is signing@@signatures.roleLabel"
                   class="block text-xs font-medium text-gray-600 mb-1">Role</label>
            <select [(ngModel)]="signReq.role"
              class="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-accent">
              <option value="Author" i18n="Signing role — the person who produced the document@@signatureRole.author">Author</option>
              <option value="Reviewer" i18n="Signing role — the person who checked the document@@signatureRole.reviewer">Reviewer</option>
              <option value="Approver" i18n="Signing role — the person who authorised the document for use@@signatureRole.approver">Approver</option>
            </select>
          </div>

          <div>
            <label i18n="Why the document is being signed@@signatures.reasonLabel"
                   class="block text-xs font-medium text-gray-600 mb-1">Reason</label>
            <input [(ngModel)]="signReq.reason"
              i18n-placeholder="Example of a signing reason@@signatures.reasonPlaceholder"
              placeholder="e.g. Reviewed and approved for construction"
              class="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-accent" />
          </div>

          <div class="flex justify-end gap-2">
            <button (click)="showSignForm.set(false)"
              i18n="@@signatures.cancel"
              class="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50">
              Cancel
            </button>
            <button (click)="signDocument()" [disabled]="signing() || !signReq.reason"
              class="px-3 py-1.5 text-xs bg-accent text-white rounded disabled:opacity-40 hover:bg-blue-700">
              {{ signing() ? signingLabel : applySignatureLabel }}
            </button>
          </div>
        </div>
      }

      <!-- Signature stamp preview. See lastSignature for why it is markup
           rather than the server's SVG. -->
      @if (lastSignature(); as stamp) {
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
              <dt i18n="@@signatures.stampSignedBy" class="font-medium">Signed by:</dt><dd>{{ stamp.signerName }}</dd>
            </div>
            <div class="flex gap-1 text-xs text-gray-700">
              <dt i18n="@@signatures.stampRole" class="font-medium">Role:</dt>
              <dd>{{ stamp.role }}@if (stamp.reason) { · {{ stamp.reason }} }</dd>
            </div>
            <div class="flex gap-1 text-xs text-gray-500">
              <dt i18n="@@signatures.stampDate" class="font-medium">Date:</dt>
              <dd>{{ stamp.signedAt | date: 'medium' }}</dd>
            </div>
            <div class="flex gap-1 text-xs text-gray-400">
              <dt i18n="Short reference a signature can be quoted by@@signatures.stampReference" class="font-medium">Ref:</dt>
              <dd class="font-mono">{{ reference(stamp) }}</dd>
            </div>
          </dl>

          <p i18n="Flattening burns markup into the page, making it part of the document@@signatures.stampNote"
             class="text-xs text-green-700 mt-2">
            This stamp will appear on the document when flattened.
          </p>
        </section>
      }

      <!-- Signatures list -->
      @if (loading()) {
        <div i18n="@@signatures.loading" class="text-xs text-gray-400 text-center py-4">Loading signatures...</div>
      } @else if (signatures().length === 0) {
        <div class="text-center text-gray-400 py-6">
          <div class="text-2xl mb-2" aria-hidden="true">🔏</div>
          <div i18n="@@signatures.empty" class="text-xs">No signatures on this document yet</div>
        </div>
      } @else {
        <div class="space-y-2">
          <div i18n="Counts the signatures already on the document@@signatures.count"
               class="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {signatures().length, plural, =1 {1 Signature} other {{{ signatures().length }} Signatures}}
          </div>
          @for (sig of signatures(); track sig.signatureId) {
            <div class="flex items-start gap-3 p-3 rounded-lg border"
              [class]="sig.status === 'VALID'
                ? 'bg-green-50 border-green-200'
                : sig.status === 'TAMPERED'
                  ? 'bg-red-50 border-red-200'
                  : 'bg-gray-50 border-gray-200'">

              <span class="text-lg flex-shrink-0 mt-0.5">
                {{ sig.status === 'VALID' ? '✅' : sig.status === 'TAMPERED' ? '⚠️' : '🔒' }}
              </span>

              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-semibold text-gray-800">{{ sig.signerName }}</span>
                  <span class="text-xs px-1.5 py-0.5 rounded font-semibold"
                    [class]="roleClass(sig.role)">
                    {{ sig.role }}
                  </span>
                  <span class="text-xs px-1.5 py-0.5 rounded font-semibold ms-auto"
                    [class]="statusClass(sig.status)">
                    {{ sig.status }}
                  </span>
                </div>
                @if (sig.reason) {
                  <div class="text-xs text-gray-600 mt-0.5">{{ sig.reason }}</div>
                }
                <div class="text-xs text-gray-400 mt-1">
                  {{ sig.signedAt | date:'medium' }}
                  @if (sig.version) {
                    {{ coversVersionLabel(sig.version) }}
                  }
                </div>
              </div>

              <div class="flex flex-col gap-1 flex-shrink-0">
                <button (click)="verifySignature(sig)"
                  i18n="Re-checks that a signature still matches the document@@signatures.verify"
                  class="text-xs text-blue-600 hover:underline px-1">
                  Verify
                </button>
              </div>
            </div>
          }
        </div>
      }

      <!-- Verification result -->
      @if (verifyResult()) {
        <div class="p-3 rounded-lg text-xs"
          [class]="verifyResult()!.valid
            ? 'bg-green-50 border border-green-200 text-green-800'
            : 'bg-red-50 border border-red-200 text-red-800'">
          {{ verifyResult()!.valid ? '✅' : '⚠️' }} {{ verifyResult()!.message }}
        </div>
      }
    </div>
  `
})
export class DocumentSignatureComponent implements OnInit {
  /** Says which revision of the document a signature was applied to. */
  coversVersionLabel(version: number): string {
    return $localize`:Follows a signature's details to say which revision of the document it covers@@signature.coversVersion:· covers v${version}:version:`;
  }

  @Input({ required: true }) documentId!: number;

  private service = inject(SignatureService);
  private state   = inject(ViewerStateService);

  signatures    = signal<SignatureRecord[]>([]);
  loading       = signal(true);
  signing       = signal(false);
  showSignForm  = signal(false);
  /**
   * The signature just applied, shown back as a stamp preview.
   *
   * <p>This used to hold the server's `stampSvg` and bind it with
   * `[innerHTML]`. Angular's HTML sanitiser has no `<svg>` in its element
   * allow-list, so it dropped every element of the stamp and kept only their
   * text nodes, run together with nothing between them: what a signer saw was
   * one unstyled line reading `DIGITALLY SIGNEDSigned by: …Role: …`, with the
   * raw ISO timestamp and no border, spacing or layout. Not an error, and not
   * blank either — just quietly wrong on every signing, which is why it
   * survived so long.
   *
   * <p>Rebuilding it from the record rather than reaching for a sanitiser
   * bypass settles three things at once. §5.12 bans the bypass outright. The
   * stamp is text — a name, a role, a reason, a date — so an image of that
   * text is unreadable to a screen reader and unselectable by anyone, which
   * §1A.4 counts as a defect rather than a trade-off. And the reply already
   * carries every one of those fields as data, so the SVG was a second,
   * lossier copy of something we had.
   *
   * <p>The server still generates the SVG, and still needs to: that copy is
   * what gets drawn into the PDF, where it is a picture by necessity.
   */
  lastSignature = signal<SignatureRecord | null>(null);
  verifyResult  = signal<{valid:boolean;message:string} | null>(null);

  signReq: SignRequest = { role: 'Reviewer', reason: '' };

  /**
   * Button labels that live in an expression and so cannot carry `i18n` —
   * see the note in login.component.ts.
   */
  readonly applySignatureLabel = $localize`:Applies the signature to the document@@signatures.applyAction:Apply Signature`;
  readonly signingLabel = $localize`:Apply-signature button while the request is in flight@@signatures.signingAction:Signing...`;

  ngOnInit() {
    this.loadSignatures();
  }

  loadSignatures() {
    this.loading.set(true);
    this.service.getSignatures(this.documentId).subscribe({
      next: sigs => { this.signatures.set(sigs); this.loading.set(false); },
      error: ()  => this.loading.set(false)
    });
  }

  signDocument() {
    if (!this.signReq.reason) return;
    this.signing.set(true);
    this.service.sign(this.documentId, this.signReq).subscribe({
      next: result => {
        this.signing.set(false);
        this.showSignForm.set(false);
        this.lastSignature.set(result.signature);
        // Signing a PDF rewrites it, so the viewer is now a version behind.
        if (result.embedded) {
          const signer = result.signature.signerName;
          const role = result.signature.role;
          this.state.applyVersionCommit(
            result.version ?? 0,
            $localize`:Version-history summary written when a document is signed@@signatures.versionSummary:Signed by ${signer}:signer: as ${role}:role:`,
          );
        }
        this.loadSignatures();
        this.signReq = { role: 'Reviewer', reason: '' };
      },
      error: () => this.signing.set(false)
    });
  }

  verifySignature(sig: SignatureRecord) {
    this.verifyResult.set(null);
    this.service.verify(sig.signatureId).subscribe(result => {
      this.verifyResult.set(result);
      // Refresh to show updated status
      this.loadSignatures();
    });
  }

  /**
   * The short reference printed on the stamp.
   *
   * <p>Eight characters of the signature id, upper-cased, which is what the
   * server draws into the embedded stamp. Matching it matters: this preview
   * and the mark on the document have to be quotable as the same thing when
   * someone rings up asking about a signature.
   */
  reference(signature: SignatureRecord): string {
    return signature.signatureId.slice(0, 8).toUpperCase();
  }

  roleClass(role: string): string {
    return {
      Author:   'bg-blue-100 text-blue-700',
      Reviewer: 'bg-amber-100 text-amber-700',
      Approver: 'bg-green-100 text-green-700'
    }[role] || 'bg-gray-100 text-gray-600';
  }

  statusClass(status: string): string {
    return {
      VALID:    'bg-green-100 text-green-700',
      TAMPERED: 'bg-red-100 text-red-700',
      INVALID:  'bg-red-100 text-red-700',
      EXPIRED:  'bg-amber-100 text-amber-700'
    }[status] || 'bg-gray-100 text-gray-600';
  }
}
