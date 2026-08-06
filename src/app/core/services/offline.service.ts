import { Injectable, signal, effect } from '@angular/core';

/**
 * OfflineService
 * Tracks network connectivity and provides offline-aware state.
 * The Angular service worker (ngsw) handles actual caching.
 * This service handles:
 *   1. Detecting online/offline transitions
 *   2. Showing offline banners
 *   3. Queuing write operations for later sync
 */
@Injectable({ providedIn: 'root' })
export class OfflineService {

  readonly isOnline   = signal(navigator.onLine);
  readonly wasOffline = signal(false);  // user was offline this session
  readonly pendingOps = signal<PendingOperation[]>([]);

  constructor() {
    window.addEventListener('online',  () => {
      this.isOnline.set(true);
      this.syncPendingOps();
    });
    window.addEventListener('offline', () => {
      this.isOnline.set(false);
      this.wasOffline.set(true);
    });

    // Register Angular service worker update
    this.registerSwUpdate();
  }

  /**
   * Queue an operation to be synced when back online.
   */
  queue(op: Omit<PendingOperation, 'id' | 'timestamp'>) {
    const pending: PendingOperation = {
      ...op,
      id:        crypto.randomUUID(),
      timestamp: new Date(),
      retries:   0
    };
    this.pendingOps.update(ops => [...ops, pending]);
    this.persistQueue();
  }

  /**
   * Retry all pending operations now that we're online.
   */
  private async syncPendingOps() {
    const ops = this.pendingOps();
    if (!ops.length) return;

    for (const op of ops) {
      try {
        const res = await fetch(op.url, {
          method:  op.method,
          headers: { 'Content-Type': 'application/json', ...op.headers },
          body:    op.body ? JSON.stringify(op.body) : undefined
        });
        if (res.ok) {
          this.pendingOps.update(all => all.filter(o => o.id !== op.id));
        } else {
          this.incrementRetries(op.id);
        }
      } catch {
        this.incrementRetries(op.id);
      }
    }
    this.persistQueue();
  }

  private incrementRetries(id: string) {
    this.pendingOps.update(ops =>
      ops.map(o => o.id === id
        ? { ...o, retries: o.retries + 1 }
        : o
      ).filter(o => o.retries < 5)  // drop after 5 failures
    );
  }

  private persistQueue() {
    try {
      localStorage.setItem('cde_pending_ops',
        JSON.stringify(this.pendingOps()));
    } catch { /* storage full */ }
  }

  private loadQueue() {
    try {
      const saved = localStorage.getItem('cde_pending_ops');
      if (saved) this.pendingOps.set(JSON.parse(saved));
    } catch { /* ignore */ }
  }

  private async registerSwUpdate() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const { SwUpdate } = await import('@angular/service-worker');
      // SW update notification handled in AppComponent
    } catch { /* SW not available in dev */ }
  }
}

export interface PendingOperation {
  id:        string;
  url:       string;
  method:    'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?:     unknown;
  headers?:  Record<string, string>;
  label?:    string;   // human-readable description
  timestamp: Date;
  retries:   number;
}
