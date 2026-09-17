import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OfflineService } from '../../core/services/offline.service';

@Component({
  selector: 'app-offline-banner',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!offline.isOnline()) {
      <div class="fixed top-0 inset-x-0 z-[9998] flex items-center justify-center
                  gap-2 py-2 px-4 text-sm font-medium text-white"
           style="background:#d97706" role="alert" aria-live="assertive">
        <span class="animate-pulse" aria-hidden="true">●</span>
        <span i18n="@@offline.disconnected"
          >You are offline — changes will sync when connection is restored</span
        >
        @if (offline.pendingOps().length > 0) {
          <span
            i18n="How many edits are waiting to be sent. Plural because one pending change is the common case.@@offline.pendingCount"
            class="ms-2 px-2 py-0.5 bg-white/20 rounded-full text-xs"
          >
            {offline.pendingOps().length, plural, =1 {1 pending} other {{{ offline.pendingOps().length }} pending}}
          </span>
        }
      </div>
    }

    @if (offline.isOnline() && offline.wasOffline()) {
      <div class="fixed top-0 inset-x-0 z-[9998] flex items-center justify-center
                  gap-2 py-2 px-4 text-sm font-medium text-white animate-fade-out"
           style="background:#16a34a" role="status">
        <span aria-hidden="true">✅</span>
        @if (offline.pendingOps().length === 0) {
          <span i18n="@@offline.reconnectedAndSynced"
            >Back online — all changes synced</span
          >
        } @else {
          <span i18n="@@offline.reconnected">Back online</span>
        }
      </div>
    }
  `,
  styles: [`
    @keyframes fade-out {
      0%   { opacity: 1; }
      70%  { opacity: 1; }
      100% { opacity: 0; pointer-events: none; }
    }
    .animate-fade-out { animation: fade-out 4s ease-out forwards; }
  `]
})
export class OfflineBannerComponent {
  offline = inject(OfflineService);
}
