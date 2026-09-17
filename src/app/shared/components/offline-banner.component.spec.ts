/**
 * The banner that tells someone their connection dropped.
 *
 * <p>Worth testing properly rather than as a string check, because it is one
 * of the few pieces of interface a user meets while things are going wrong —
 * and because getting it *stuck* is the failure that matters. A banner that
 * keeps saying "you are offline" after the connection came back is worse than
 * no banner, and nothing about the markup makes that visible.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OfflineBannerComponent } from './offline-banner.component';
import { OfflineService } from '../../core/services/offline.service';

describe('OfflineBannerComponent', () => {
  let fixture: ComponentFixture<OfflineBannerComponent>;
  let offline: OfflineService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [OfflineBannerComponent] });
    fixture = TestBed.createComponent(OfflineBannerComponent);
    offline = TestBed.inject(OfflineService);
  });

  /** Renders the given connectivity state and returns the visible text. */
  function render(state: {
    online: boolean;
    wasOffline?: boolean;
    pending?: number;
  }): string {
    offline.isOnline.set(state.online);
    offline.wasOffline.set(state.wasOffline ?? false);
    offline.pendingOps.set(
      Array.from({ length: state.pending ?? 0 }, (_unused, index) => ({
        id: `synthetic-${index}`,
        url: '/api/synthetic',
        method: 'POST' as const,
        timestamp: new Date(0),
        retries: 0,
      })),
    );
    fixture.detectChanges();
    return fixture.nativeElement.textContent ?? '';
  }

  /** The element carrying the role, or null when no banner is shown. */
  function bannerWithRole(role: string): HTMLElement | null {
    return fixture.nativeElement.querySelector(`[role="${role}"]`);
  }

  it('shows nothing on a connection that never dropped', () => {
    expect(render({ online: true })).not.toContain('online');
    expect(bannerWithRole('alert')).toBeNull();
    expect(bannerWithRole('status')).toBeNull();
  });

  it('announces a dropped connection assertively', () => {
    // role="alert" rather than status: this interrupts, because work done
    // from here on may not reach the server.
    render({ online: false });

    expect(bannerWithRole('alert')?.textContent).toContain('You are offline');
  });

  it('says nothing about pending work when there is none', () => {
    expect(render({ online: false })).not.toContain('pending');
  });

  it('counts one pending change without pluralising it', () => {
    // The reason this is an ICU plural and not string concatenation: "1
    // pendings" is wrong in English, and the rules are not the same in every
    // language.
    expect(render({ online: false, pending: 1 })).toContain('1 pending');
  });

  it('counts several pending changes', () => {
    expect(render({ online: false, pending: 3 })).toContain('3 pending');
  });

  it('confirms reconnection once everything has been sent', () => {
    render({ online: true, wasOffline: true, pending: 0 });

    expect(bannerWithRole('status')?.textContent).toContain('all changes synced');
  });

  it('does not claim everything synced while work is still queued', () => {
    // The lie worth guarding against: the connection is back but the queue
    // has not drained, and telling someone their work is saved when it is
    // not is the one thing this banner must never do.
    const text = render({ online: true, wasOffline: true, pending: 2 });

    expect(text).toContain('Back online');
    expect(text).not.toContain('all changes synced');
  });

  it('stops warning once the connection returns', () => {
    render({ online: false });
    expect(bannerWithRole('alert')).not.toBeNull();

    render({ online: true, wasOffline: true });

    expect(bannerWithRole('alert')).toBeNull();
  });
});
