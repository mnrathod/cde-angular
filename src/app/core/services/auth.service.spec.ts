import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  const MOCK_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiJ9.test';
  const MOCK_RESPONSE = { token: MOCK_TOKEN, username: 'admin', role: 'ADMIN' };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ]
    });
    service  = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => { httpMock.verify(); localStorage.clear(); });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('isLoggedIn() should be false initially', () => {
    expect(service.isLoggedIn()).toBeFalse();
  });

  it('login() should store token and set signals', fakeAsync(() => {
    service.login({ username: 'admin', password: 'admin123' }).subscribe();
    const req = httpMock.expectOne('/api/auth/login');
    expect(req.request.method).toBe('POST');
    req.flush(MOCK_RESPONSE);
    tick();

    expect(service.isLoggedIn()).toBeTrue();
    expect(service.username()).toBe('admin');
    expect(localStorage.getItem('cde_token')).toBe(MOCK_TOKEN);
  }));

  it('logout() should clear token and signals', fakeAsync(() => {
    localStorage.setItem('cde_token', MOCK_TOKEN);
    service.login({ username: 'admin', password: 'admin123' }).subscribe();
    httpMock.expectOne('/api/auth/login').flush(MOCK_RESPONSE);
    tick();

    service.logout();
    expect(service.isLoggedIn()).toBeFalse();
    expect(service.token()).toBeNull();
    expect(service.username()).toBeNull();
    expect(localStorage.getItem('cde_token')).toBeNull();
  }));

  it('getAuthHeaders() should return Authorization header when logged in', fakeAsync(() => {
    service.login({ username: 'admin', password: 'admin123' }).subscribe();
    httpMock.expectOne('/api/auth/login').flush(MOCK_RESPONSE);
    tick();

    const headers = service.getAuthHeaders();
    expect(headers['Authorization']).toBe(`Bearer ${MOCK_TOKEN}`);
  }));

  it('getAuthHeaders() should return empty object when not logged in', () => {
    const headers = service.getAuthHeaders();
    expect(Object.keys(headers).length).toBe(0);
  });

  it('login() should handle 401 error', fakeAsync(() => {
    let error: any;
    service.login({ username: 'wrong', password: 'wrong' })
      .subscribe({ error: e => error = e });
    httpMock.expectOne('/api/auth/login').flush(
      { message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' }
    );
    tick();
    expect(error).toBeTruthy();
    expect(service.isLoggedIn()).toBeFalse();
  }));
});
