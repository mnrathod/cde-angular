/**
 * The session, as the browser is allowed to know it.
 *
 * <p>This service kept the JWT in `localStorage` and attached it as a bearer
 * header, which §4.6 forbids outright. The reason is narrow and worth stating,
 * because it is what the first test here guards: `localStorage` is readable by
 * any script on the origin, so one cross-site scripting bug anywhere in the
 * application hands over a token good for its whole lifetime, replayable from
 * anywhere. Nothing else had to be insecure for that to be true.
 *
 * <p>The session is an `HttpOnly` cookie now, which means this service never
 * sees a token at all — it cannot attach one, cannot read a username out of
 * one, and cannot delete one. Every test below follows from that.
 */
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  /** What the server replies with. The token is present and must be ignored. */
  const SIGNED_IN = {
    token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiJ9.synthetic',
    username: 'admin',
    role: 'ADMIN',
  };

  const credentials = { username: 'admin', password: 'a-synthetic-test-password' };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    service  = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => { httpMock.verify(); localStorage.clear(); });

  function signIn() {
    service.login(credentials).subscribe();
    httpMock.expectOne('/api/auth/login').flush(SIGNED_IN);
    tick();
  }

  it('writes nothing to browser storage when it signs in', fakeAsync(() => {
    // The assertion this whole change exists for. Asserted over the whole of
    // localStorage rather than one key, because the defect was a key name
    // chosen here and a different name would be the same defect.
    signIn();

    expect(localStorage.length).toBe(0);
  }));

  it('never exposes the token it was handed', fakeAsync(() => {
    // A field or signal holding it would put it back within reach of any
    // script on the page, and the point of the cookie is that there is
    // nothing to reach.
    //
    // Every own property is checked, and every signal among them is read,
    // rather than naming the one field that used to hold it — the defect was
    // a field someone chose to add, so a different name would be the same
    // defect. Serialising the whole service would be simpler and does not
    // work: it holds subscriptions, which are circular.
    signIn();

    for (const value of Object.values(service as unknown as Record<string, unknown>)) {
      expect(value).not.toBe(SIGNED_IN.token);
      if (typeof value === 'function') {
        // A signal reads with no arguments; anything else that throws or
        // wants arguments is not one, and is not holding a token either.
        let read: unknown;
        try { read = (value as () => unknown)(); } catch { continue; }
        expect(read).not.toBe(SIGNED_IN.token);
      }
    }
  }));

  it('knows nobody before it has asked', () => {
    expect(service.isLoggedIn()).toBe(false);
    expect(service.resolved()).toBe(false);
  });

  it('adopts the account it signed in as', fakeAsync(() => {
    signIn();

    expect(service.isLoggedIn()).toBe(true);
    expect(service.username()).toBe('admin');
    expect(service.role()).toBe('ADMIN');
  }));

  it('restores the session from the server, not from storage', fakeAsync(() => {
    // The cookie survives a reload but script cannot read it, so the only way
    // to find out who is signed in is to ask.
    service.restoreSession().subscribe();
    httpMock.expectOne('/api/auth/session').flush({ username: 'admin', role: 'ADMIN' });
    tick();

    expect(service.isLoggedIn()).toBe(true);
    expect(service.username()).toBe('admin');
  }));

  it('treats a refused session as nobody, not as an error', fakeAsync(() => {
    // Most page loads are by people who are not signed in, so a 401 here is
    // the ordinary answer rather than a failure.
    let resolvedTo: boolean | undefined;
    service.restoreSession().subscribe(value => resolvedTo = value);
    httpMock.expectOne('/api/auth/session')
      .flush({}, { status: 401, statusText: 'Unauthorized' });
    tick();

    expect(resolvedTo).toBe(false);
    expect(service.isLoggedIn()).toBe(false);
    expect(service.resolved()).toBe(true);
  }));

  it('asks the server to end the session', fakeAsync(() => {
    // The cookie is HttpOnly: clearing local state alone would leave the
    // browser holding a working credential while the interface claimed to be
    // signed out.
    signIn();

    service.logout();
    httpMock.expectOne('/api/auth/logout').flush(null);
    tick();

    expect(service.isLoggedIn()).toBe(false);
    expect(service.username()).toBeNull();
  }));

  it('still signs out locally when the server call fails', fakeAsync(() => {
    // Stranding someone on a page they appear to be signed out of would be
    // worse than a session that outlives the click.
    signIn();

    service.logout();
    httpMock.expectOne('/api/auth/logout')
      .flush({}, { status: 500, statusText: 'Server Error' });
    tick();

    expect(service.isLoggedIn()).toBe(false);
  }));

  it('stays signed out when the credentials are refused', fakeAsync(() => {
    let failure: unknown;
    service.login({ username: 'wrong', password: 'wrong' })
      .subscribe({ error: (error: unknown) => failure = error });
    httpMock.expectOne('/api/auth/login')
      .flush({}, { status: 401, statusText: 'Unauthorized' });
    tick();

    expect(failure).toBeTruthy();
    expect(service.isLoggedIn()).toBe(false);
  }));
});
