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
          <h3 class="text-sm font-semibold text-gray-800">Digital Signatures</h3>
          <p class="text-xs text-gray-500 mt-0.5">
            PKI-based document signing with X.509 certificates
          </p>
        </div>
        <button (click)="showSignForm.set(!showSignForm())"
          class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-accent text-white rounded hover:bg-blue-700 transition-colors">
          ✍️ Sign Document
        </button>
      </div>

      <!-- Sign form -->
      @if (showSignForm()) {
        <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
          <div class="text-xs font-semibold text-blue-800 mb-2">Sign this document</div>

          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">Role</label>
            <select [(ngModel)]="signReq.role"
              class="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-accent">
              <option value="Author">Author</option>
              <option value="Reviewer">Reviewer</option>
              <option value="Approver">Approver</option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">Reason</label>
            <input [(ngModel)]="signReq.reason"
              placeholder="e.g. Reviewed and approved for construction"
              class="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-accent" />
          </div>

          <div class="flex justify-end gap-2">
            <button (click)="showSignForm.set(false)"
              class="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50">
              Cancel
            </button>
            <button (click)="signDocument()" [disabled]="signing() || !signReq.reason"
              class="px-3 py-1.5 text-xs bg-accent text-white rounded disabled:opacity-40 hover:bg-blue-700">
              {{ signing() ? 'Signing...' : '✍️ Apply Signature' }}
            </button>
          </div>
        </div>
      }

      <!-- Signature stamp preview -->
      @if (lastStampSvg()) {
        <div class="border border-green-200 rounded-lg p-3 bg-green-50">
          <div class="text-xs font-semibold text-green-800 mb-2">✅ Signature Applied</div>
          <div [innerHTML]="lastStampSvg()" class="inline-block"></div>
          <p class="text-xs text-green-700 mt-2">
            This stamp will appear on the document when flattened.
          </p>
        </div>
      }

      <!-- Signatures list -->
      @if (loading()) {
        <div class="text-xs text-gray-400 text-center py-4">Loading signatures...</div>
      } @else if (signatures().length === 0) {
        <div class="text-center text-gray-400 py-6">
          <div class="text-2xl mb-2">🔏</div>
          <div class="text-xs">No signatures on this document yet</div>
        </div>
      } @else {
        <div class="space-y-2">
          <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {{ signatures().length }} Signature{{ signatures().length !== 1 ? 's' : '' }}
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
                  <span class="text-xs px-1.5 py-0.5 rounded font-semibold ml-auto"
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
                    · covers v{{ sig.version }}
                  }
                </div>
              </div>

              <div class="flex flex-col gap-1 flex-shrink-0">
                <button (click)="verifySignature(sig)"
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
  @Input({ required: true }) documentId!: number;

  private service = inject(SignatureService);
  private state   = inject(ViewerStateService);

  signatures    = signal<SignatureRecord[]>([]);
  loading       = signal(true);
  signing       = signal(false);
  showSignForm  = signal(false);
  lastStampSvg  = signal('');
  verifyResult  = signal<{valid:boolean;message:string} | null>(null);

  signReq: SignRequest = { role: 'Reviewer', reason: '' };

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
        this.lastStampSvg.set(result.stampSvg || '');
        // Signing a PDF rewrites it, so the viewer is now a version behind.
        if (result.embedded) {
          this.state.applyVersionCommit(result.version ?? 0,
            `Signed by ${result.signature.signerName} as ${result.signature.role}`);
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
