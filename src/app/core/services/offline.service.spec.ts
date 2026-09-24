import { TestBed } from '@angular/core/testing';
import { OfflineService } from './offline.service';

/**
 * Connectivity as the banner reads it.
 *
 * <p>Driven by dispatching the real `online`/`offline` events rather than by
 * setting the signals directly: the listeners are the whole of this service,
 * so a test that set the signals itself would pass with them unregistered.
 */
describe('tracking whether the browser can reach the network', () => {
  let service: OfflineService;

  function goOffline() {
    window.dispatchEvent(new Event('offline'));
  }

  function goOnline() {
    window.dispatchEvent(new Event('online'));
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [OfflineService] });
    service = TestBed.inject(OfflineService);
  });

  it('starts from what the browser already knows', () => {
    expect(service.isOnline()).toBe(navigator.onLine);
  });

  it('has not seen a gap before one happens', () => {
    expect(service.wasOffline()).toBe(false);
  });

  it('notices connectivity being lost', () => {
    goOffline();

    expect(service.isOnline()).toBe(false);
  });

  it('notices connectivity coming back', () => {
    goOffline();
    goOnline();

    expect(service.isOnline()).toBe(true);
  });

  it('remembers the gap after connectivity returns', () => {
    // This is what lets the banner say "you are back online" rather than
    // simply vanishing. Clearing it on reconnect would make the recovery
    // message unreachable.
    goOffline();
    goOnline();

    expect(service.wasOffline()).toBe(true);
  });

  it('keeps remembering it across a second gap', () => {
    goOffline();
    goOnline();
    goOffline();
    goOnline();

    expect(service.wasOffline()).toBe(true);
  });
});
