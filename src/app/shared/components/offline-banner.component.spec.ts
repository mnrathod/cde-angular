/**
 * The banner that tells someone their connection dropped.
 *
 * <p>Worth testing properly rather than as a string check, because it is one
 * of the few pieces of interface a user meets while things are going wrong —
 * and because getting it *stuck* is the failure that matters. A banner that
 * keeps saying "you are offline" after the connection came back is worse than
 * no banner, and nothing about the markup makes that visible.
 *
 * <p>The previous version of this file carried a case named "does not claim
 * everything synced while work is still queued", which set a queue length by
 * hand and asserted the banner stayed quiet. It passed, and it guarded
 * nothing: no code path ever put anything in that queue, so the only state
 * the application could actually reach was the other branch — the one that
 * said "all changes synced" after syncing nothing. A test that reaches a
 * state the product cannot is not a weaker test, it is a test of a different
 * program. Every state below is one connectivity alone can produce.
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
  function render(state: { online: boolean; wasOffline?: boolean }): string {
    offline.isOnline.set(state.online);
    offline.wasOffline.set(state.wasOffline ?? false);
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
    // from here on will not reach the server at all.
    render({ online: false });

    expect(bannerWithRole('alert')?.textContent).toContain('You are offline');
  });

  it('tells the reader their changes cannot be saved', () => {
    // The sentence that matters. Saying only "you are offline" leaves the
    // reader to guess whether the application is holding their work.
    expect(render({ online: false })).toContain('cannot be saved');
  });

  it('never promises that anything will sync', () => {
    // The defect this replaced. Nothing is queued and nothing is replayed,
    // so a reader who believes otherwise keeps working and loses it.
    const text = render({ online: false });

    expect(text).not.toContain('sync');
  });

  it('confirms reconnection without claiming anything was sent', () => {
    const text = render({ online: true, wasOffline: true });

    expect(bannerWithRole('status')?.textContent).toContain('Back online');
    expect(text).not.toContain('synced');
  });

  it('stops warning once the connection returns', () => {
    render({ online: false });
    expect(bannerWithRole('alert')).not.toBeNull();

    render({ online: true, wasOffline: true });

    expect(bannerWithRole('alert')).toBeNull();
  });

  it('marks the decorative indicators as decorative', () => {
    // A pulsing dot and a tick announce as nothing useful, and the
    // sentence beside each already carries the meaning.
    render({ online: false });
    const dot = fixture.nativeElement.querySelector('[aria-hidden="true"]');

    expect(dot).not.toBeNull();
  });
});
