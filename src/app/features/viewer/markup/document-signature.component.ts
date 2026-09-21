import { Component, Input, signal, inject, OnInit, ChangeDetectionStrategy } from '@angular/core';

import {
  SignatureService, SignatureRecord, SignRequest, VerifyResult,
} from '../../../core/services/signature.service';
import { ViewerStateService } from '../../../../viewer-core/viewer-state.service';
import { problemMessage } from '../../../core/handlers/problem-detail';
import { SignDocumentFormComponent } from './sign-document-form.component';
import { SignatureListComponent } from './signature-list.component';
import { SignatureStampComponent } from './signature-stamp.component';
import { verificationMessage } from './signature-wording';

/** What the panel is currently saying about a request that finished. */
interface PanelNotice {
  readonly text: string;
  readonly isError: boolean;
}

@Component({
  selector: 'app-document-signature',
  standalone: true,
  imports: [SignDocumentFormComponent, SignatureListComponent, SignatureStampComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="p-4 space-y-4">

      <div class="flex items-center justify-between">
        <div>
          <h3 i18n="@@signatures.heading" class="text-sm font-semibold text-gray-800">Digital Signatures</h3>
          <p i18n="Explains what kind of signature this is. X.509 and PKI are standard names and stay as they are.@@signatures.subheading"
             class="text-xs text-gray-500 mt-0.5">
            PKI-based document signing with X.509 certificates
          </p>
        </div>
        <button (click)="toggleSignForm()" [attr.aria-expanded]="showSignForm()"
          class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-accent text-white rounded hover:bg-blue-700 transition-colors">
          <span aria-hidden="true">✍️</span>
          <ng-container i18n="Opens the form for signing this document@@signatures.signDocument"
            >Sign Document</ng-container
          >
        </button>
      </div>

      @if (showSignForm()) {
        <app-sign-document-form
          [request]="signReq"
          [signing]="signing()"
          (submitted)="signDocument()"
          (cancelled)="showSignForm.set(false)"
        />
      }

      @if (lastSignature(); as stamp) {
        <app-signature-stamp [signature]="stamp" />
      }

      <app-signature-list
        [signatures]="signatures()"
        [busy]="loading()"
        (verifyRequested)="verifySignature($event)"
      />

      @if (notice(); as shown) {
        <!-- A live region: the result of pressing Verify, and the reason a
             signing failed, are announced rather than only appearing. -->
        <div class="p-3 rounded-lg text-xs" role="status" aria-live="polite"
          [class]="shown.isError
            ? 'bg-red-50 border border-red-200 text-red-800'
            : 'bg-green-50 border border-green-200 text-green-800'">
          {{ shown.text }}
        </div>
      }
    </div>
  `
})
export class DocumentSignatureComponent implements OnInit {
  @Input({ required: true }) documentId!: number;

  private service = inject(SignatureService);
  private state = inject(ViewerStateService);

  readonly signatures = signal<SignatureRecord[]>([]);
  readonly loading = signal(true);
  readonly signing = signal(false);
  readonly showSignForm = signal(false);
  readonly notice = signal<PanelNotice | null>(null);

  /** The signature just applied, shown back as a stamp preview. */
  readonly lastSignature = signal<SignatureRecord | null>(null);

  signReq: SignRequest = { role: 'Reviewer', reason: '' };

  ngOnInit() {
    this.loadSignatures();
  }

  toggleSignForm() {
    this.showSignForm.update(open => !open);
    this.notice.set(null);
  }

  loadSignatures() {
    this.loading.set(true);
    this.service.getSignatures(this.documentId).subscribe({
      next: found => { this.signatures.set(found); this.loading.set(false); },
      error: (err: unknown) => {
        this.loading.set(false);
        // This used to set `loading` false and say nothing at all, so a
        // document whose signatures could not be read was indistinguishable
        // from one that had none (§1.4).
        this.report(err, $localize`:Shown when a document's signatures cannot be listed@@signatures.listFailed:The signatures on this document could not be read.`);
      }
    });
  }

  signDocument() {
    if (!this.signReq.reason.trim() || this.signing()) return;
    this.signing.set(true);
    this.notice.set(null);
    this.service.sign(this.documentId, this.signReq).subscribe({
      next: result => {
        this.signing.set(false);
        this.showSignForm.set(false);
        this.lastSignature.set(result.signature);
        // Signing a PDF rewrites it, so the viewer is now a version behind.
        if (result.embedded) this.recordNewVersion(result.signature, result.version);
        this.loadSignatures();
        this.signReq = { role: 'Reviewer', reason: '' };
      },
      error: (err: unknown) => {
        this.signing.set(false);
        // Signing failed silently before: the button re-enabled and nothing
        // said why, which reads as "nothing happened" rather than "refused".
        this.report(err, $localize`:Fallback when signing a document fails without a reason@@signatures.signFailed:The document could not be signed.`);
      }
    });
  }

  verifySignature(signature: SignatureRecord) {
    this.notice.set(null);
    this.service.verify(signature.signatureId).subscribe({
      next: (result: VerifyResult) => {
        this.notice.set({
          text: verificationMessage(result.status, result.embedded),
          isError: !result.valid,
        });
        this.loadSignatures();
      },
      error: (err: unknown) =>
        this.report(err, $localize`:Fallback when re-checking a signature fails@@signatures.verifyFailed:The signature could not be checked.`),
    });
  }

  private recordNewVersion(signature: SignatureRecord, version: number | undefined) {
    const signer = signature.signerName;
    const role = signature.role;
    this.state.applyVersionCommit(
      version ?? 0,
      $localize`:Version-history summary written when a document is signed@@signatures.versionSummary:Signed by ${signer}:signer: as ${role}:role:`,
    );
  }

  private report(err: unknown, fallback: string) {
    this.notice.set({ text: problemMessage(err, fallback), isError: true });
  }
}
