import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting }
  from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { RemoteLoggingService, RemoteLogEvent, TELEMETRY_ENABLED, telemetryPermitted }
  from './remote-logging.service';
import { AuthService } from './auth.service';

/**
 * Sending a fault report off the browser.
 *
 * <p>This file used to test nothing. Its own comment said so — "log() is a
 * no-op in dev mode (isDevMode() = true in tests)" — and every case below it
 * asserted that calling the method did not throw. So the whole production
 * path had never run: the payload it builds, the rate limit, the Sentry
 * integration, the silent handling of an unreachable endpoint. Five green
 * tests, none of them touching any of it.
 *
 * <p>What made it untestable was the decision being taken inside the method.
 * `TELEMETRY_ENABLED` is that decision as a token now, so a case can provide
 * either answer — and the token is also what gives §9.3's "no telemetry
 * egress" an actual switch, which `isDevMode()` could not, an air-gapped
 * deployment being a production build.
 *
 * <p>What matters most here is what does *not* leave the browser. §5.7 lists
 * what must never be logged, and this sends to an internal endpoint and,
 * where one is configured, to a third party — which makes it a sub-processor
 * boundary (§6.1) rather than a log line.
 */
describe('reporting a fault from the browser', () => {
  let logging: RemoteLoggingService;
  let httpMock: HttpTestingController;

  function fault(
    overrides: Partial<Omit<RemoteLogEvent, 'url' | 'userAgent' | 'timestamp' | 'username'>> = {},
  ) {
    return {
      level: 'error' as const, type: 'runtime',
      message: 'Cannot read properties of undefined',
      ...overrides,
    };
  }

  /** The body of the report sent to the internal endpoint. */
  function reportedToBackend(): RemoteLogEvent {
    const request = httpMock.expectOne('/api/logs/errors');
    request.flush({});
    return request.request.body as RemoteLogEvent;
  }

  function metaTag(name: string, content: string) {
    const meta = document.createElement('meta');
    meta.setAttribute('name', name);
    meta.setAttribute('content', content);
    document.head.appendChild(meta);
    return meta;
  }

  /**
   * Builds the service with telemetry on or off, and with whoever is signed
   * in. Called per case rather than from a shared `beforeEach`, because both
   * are things individual cases need to vary.
   */
  function build({ telemetry = true, username = 'sam.okonkwo' as string | null } = {}) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        RemoteLoggingService,
        { provide: TELEMETRY_ENABLED, useValue: telemetry },
        { provide: AuthService, useValue: { username: signal(username) } },
      ],
    });
    logging = TestBed.inject(RemoteLoggingService);
    httpMock = TestBed.inject(HttpTestingController);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    build();
  });

  afterEach(() => {
    document.head
      .querySelectorAll('meta[name="sentry-dsn"], meta[name="app-version"]')
      .forEach((meta) => meta.remove());
    vi.useRealTimers();
    httpMock.verify();
  });

  describe('deciding whether anything may be sent', () => {
    // The rule itself, rather than the service's use of it. Every case below
    // provides the token directly, which steps over this entirely — so
    // without these the opt-out was written and verified by nothing.
    // Confirmed by making the rule always permit: these fail and nothing
    // else does.

    it('sends nothing from a development build', () => {
      expect(telemetryPermitted(true, null)).toBe(false);
    });

    it('sends nothing from a development build even if a tag says otherwise', () => {
      expect(telemetryPermitted(true, 'on')).toBe(false);
    });

    it('sends from a production build that says nothing about it', () => {
      // Opt-out, not opt-in: absence means send, so adding the switch did
      // not silently stop every deployment already reporting faults.
      expect(telemetryPermitted(false, null)).toBe(true);
    });

    it('sends nothing from a deployment that switched it off (§9.3)', () => {
      // An air-gapped deployment is a production build, so `isDevMode()`
      // alone could never express this — and every caught fault attempted
      // an outbound POST.
      expect(telemetryPermitted(false, 'off')).toBe(false);
    });

    it('reads the switch whatever case and spacing it was written in', () => {
      expect(telemetryPermitted(false, ' OFF ')).toBe(false);
      expect(telemetryPermitted(false, 'Off')).toBe(false);
    });

    it('treats any other value as permission', () => {
      // One spelling turns it off. Anything else is not an accidental
      // silencing of a deployment's error reporting.
      expect(telemetryPermitted(false, 'on')).toBe(true);
      expect(telemetryPermitted(false, '')).toBe(true);
      expect(telemetryPermitted(false, 'disabled')).toBe(true);
    });
  });

  describe('a deployment that sends no telemetry', () => {

    it('sends nothing at all', () => {
      // A developer's own broken build would otherwise fill the shared
      // error store with faults nobody will fix, and an air-gapped
      // deployment must not attempt the call at all (§9.3).
      build({ telemetry: false });

      logging.log(fault());

      httpMock.verify();
    });

    it('does not throw when there is nowhere to send to', () => {
      build({ telemetry: false });

      expect(() => logging.log(fault())).not.toThrow();
    });
  });

  describe('what reaches the internal endpoint', () => {
    it('carries the fault and its kind', () => {
      logging.log(fault({ message: 'boom', type: 'chunk' }));

      const report = reportedToBackend();
      expect(report.message).toBe('boom');
      expect(report.type).toBe('chunk');
    });

    it('carries the level, so a warning is not filed as an outage', () => {
      logging.log(fault({ level: 'warning' }));

      expect(reportedToBackend().level).toBe('warning');
    });

    it('names who hit it', () => {
      // §5.7 requires the actor on every recorded event. Without it a report
      // cannot be tied back to what the person was doing.
      logging.log(fault());

      expect(reportedToBackend().username).toBe('sam.okonkwo');
    });

    it('omits the name when nobody is signed in', () => {
      build({ username: null });

      logging.log(fault());

      expect(reportedToBackend().username).toBeUndefined();
    });

    it('says when it happened', () => {
      logging.log(fault());

      expect(reportedToBackend().timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('says which build it happened on', () => {
      // A stack trace from an unknown release is a stack trace against
      // unknown line numbers.
      metaTag('app-version', '4.2.1');

      logging.log(fault());

      expect(reportedToBackend().release).toBe('4.2.1');
    });

    it('falls back to a version rather than sending none', () => {
      logging.log(fault());

      expect(reportedToBackend().release).toBeTruthy();
    });

    it('tags the platform it came from', () => {
      logging.log(fault());

      expect(reportedToBackend().tags?.['platform']).toBe('cde-web');
    });

    it('keeps the caller’s own tags alongside it', () => {
      logging.log(fault({ tags: { http_status: '502' } }));

      const report = reportedToBackend();
      expect(report.tags?.['http_status']).toBe('502');
      expect(report.tags?.['platform']).toBe('cde-web');
    });

    it('carries the stack when there is one', () => {
      logging.log(fault({ stack: 'at viewerShell (main.js:1:2)' }));

      expect(reportedToBackend().stack).toContain('viewerShell');
    });

    it('never carries a credential, because it is never given one', () => {
      // The payload is built from a fixed field list rather than spread from
      // anything ambient, which is what keeps §5.7's "never log tokens" true
      // by construction. Asserted so a later change that widened it would
      // fail here.
      logging.log(fault());
      const report = reportedToBackend();

      expect(Object.keys(report).sort()).toEqual([
        'level', 'message', 'release', 'tags', 'timestamp', 'type',
        'url', 'useragent', 'username',
      ].sort().map((key) => key === 'useragent' ? 'userAgent' : key).sort());
    });
  });

  describe('a logging endpoint that is not there', () => {
    it('does not throw, and does not report the failure to report', () => {
      // The one thing this service must never do. An error handler that
      // errors turns one fault into a loop.
      logging.log(fault());

      expect(() => httpMock.expectOne('/api/logs/errors')
        .flush({}, { status: 503, statusText: 'Service Unavailable' })).not.toThrow();
      httpMock.verify();
    });
  });

  describe('a flood of faults', () => {
    it('sends the first ten', () => {
      for (let each = 0; each < 10; each += 1) logging.log(fault());

      expect(httpMock.match('/api/logs/errors')).toHaveLength(10);
    });

    it('stops after ten in a minute', () => {
      // A render loop can throw thousands of times a second. Without this
      // the browser spends the rest of the session posting them, and the
      // store fills with copies of one fault.
      for (let each = 0; each < 50; each += 1) logging.log(fault());

      expect(httpMock.match('/api/logs/errors')).toHaveLength(10);
    });

    it('sends again once the minute has passed', () => {
      for (let each = 0; each < 15; each += 1) logging.log(fault());
      httpMock.match('/api/logs/errors');

      vi.advanceTimersByTime(60_001);
      logging.log(fault());

      expect(httpMock.match('/api/logs/errors')).toHaveLength(1);
    });

    it('does not reset partway through the minute', () => {
      for (let each = 0; each < 10; each += 1) logging.log(fault());
      httpMock.match('/api/logs/errors');

      vi.advanceTimersByTime(30_000);
      logging.log(fault());

      expect(httpMock.match('/api/logs/errors')).toHaveLength(0);
    });
  });

  describe('a third-party error service', () => {
    it('is not contacted when none is configured', () => {
      // §6.1: a third-party integration has to be off unless a deployment
      // turns it on. An air-gapped deployment sets no DSN, and this is what
      // makes that mean "no outbound call" rather than "a failed one".
      logging.log(fault());

      httpMock.expectOne('/api/logs/errors').flush({});
      httpMock.verify();
    });

    it('is contacted alongside the internal endpoint when one is', () => {
      metaTag('sentry-dsn', 'https://abc123@errors.example.com/42');

      logging.log(fault());

      httpMock.expectOne('/api/logs/errors').flush({});
      httpMock.expectOne('https://errors.example.com/api/42/store/').flush({});
    });

    it('authenticates with the key from the configured address', () => {
      metaTag('sentry-dsn', 'https://abc123@errors.example.com/42');

      logging.log(fault());
      httpMock.expectOne('/api/logs/errors').flush({});

      const request = httpMock.expectOne('https://errors.example.com/api/42/store/');
      expect(request.request.headers.get('X-Sentry-Auth')).toContain('abc123');
      request.flush({});
    });

    it('still reaches the internal endpoint when the address is unreadable', () => {
      // The internal store is the one that must not be lost. A malformed
      // DSN is a misconfiguration, not a reason to drop the report.
      metaTag('sentry-dsn', 'not a url at all');

      logging.log(fault());

      httpMock.expectOne('/api/logs/errors').flush({});
      httpMock.verify();
    });

    it('does not throw on an unreadable address', () => {
      metaTag('sentry-dsn', '::::');

      expect(() => logging.log(fault())).not.toThrow();
      httpMock.expectOne('/api/logs/errors').flush({});
    });

    it('survives the third party being unreachable', () => {
      metaTag('sentry-dsn', 'https://abc123@errors.example.com/42');
      logging.log(fault());
      httpMock.expectOne('/api/logs/errors').flush({});

      expect(() => httpMock.expectOne('https://errors.example.com/api/42/store/')
        .flush({}, { status: 500, statusText: 'Server Error' })).not.toThrow();
    });
  });
});
