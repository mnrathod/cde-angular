import { Injectable, signal } from '@angular/core';

/**
 * Whether the browser can currently reach the network.
 *
 * <p>Two signals, read by the offline banner: whether we are online now, and
 * whether connectivity was ever lost during this session — the second is what
 * lets the banner say "you are back" rather than staying silent about a gap
 * the reader noticed. Caching of responses is the Angular service worker's
 * job and is configured in `ngsw-config.json`, not here.
 *
 * <p>This used to carry a queue of writes to replay when connectivity
 * returned: `queue()`, a retry counter, and a `localStorage` copy of the
 * pending operations. Nothing ever called `queue()`, so none of it had run,
 * and three things were wrong with it that only running it would have found.
 *
 * <p>`loadQueue()` was never called from anywhere, so the queue was written
 * to storage and never read back — the persistence existed only to survive a
 * reload, which is the one thing it did not do. The service-worker
 * registration destructured `SwUpdate` and discarded it. And the storage key
 * was a bare `cde_pending_ops`, with no tenant in it, holding full request
 * URLs and bodies: §5.6 requires every key touching tenant data to be tenant
 * namespaced and calls one that is not a security defect. Replaying a write
 * queued under one tenant against whichever session happened to be current
 * is precisely the failure that rule exists to prevent.
 *
 * <p>Offline write-and-replay may well be worth building. It should be built
 * deliberately, against §5.6 and §7.8's idempotency rules, rather than
 * inherited from a draft that had never executed.
 */
@Injectable({ providedIn: 'root' })
export class OfflineService {

  readonly isOnline = signal(navigator.onLine);

  /** Whether connectivity has been lost at any point this session. */
  readonly wasOffline = signal(false);

  constructor() {
    window.addEventListener('online', () => this.isOnline.set(true));
    window.addEventListener('offline', () => {
      this.isOnline.set(false);
      this.wasOffline.set(true);
    });
  }
}
