import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OfflineService } from '../../core/services/offline.service';

/**
 * What a reader is told when the connection drops, and when it returns.
 *
 * <p>It used to promise that "changes will sync when connection is restored"
 * and then confirm "all changes synced". Neither was true. The queue those
 * sentences described was never filled — nothing in the application called
 * the service's `queue()` — so an edit attempted offline simply failed, and
 * the reader was told it had been saved.
 *
 * <p>That is the most expensive kind of wrong copy: it is reassuring, so it
 * changes what someone does. A reader who believes their work is queued keeps
 * working; a reader told plainly that nothing can be saved stops, or copies
 * what they need elsewhere. The wording now says what actually happens and
 * what to do about it (§1.4).
 */
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
        <span i18n="Shown while the browser cannot reach the server. It must not imply anything is being saved or queued.@@offline.disconnected"
          >You are offline — changes cannot be saved until the connection
          returns</span
        >
      </div>
    }

    @if (offline.isOnline() && offline.wasOffline()) {
      <div class="fixed top-0 inset-x-0 z-[9998] flex items-center justify-center
                  gap-2 py-2 px-4 text-sm font-medium text-white animate-fade-out"
           style="background:#16a34a" role="status">
        <span aria-hidden="true">✅</span>
        <span i18n="Shown briefly once connectivity returns@@offline.reconnected"
          >Back online</span
        >
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
