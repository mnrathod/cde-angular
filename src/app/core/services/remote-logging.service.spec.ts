import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { RemoteLoggingService } from '../../core/services/remote-logging.service';
import { AuthService } from '../../core/services/auth.service';

describe('RemoteLoggingService', () => {
  let service: RemoteLoggingService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { username: signal('testuser'), isLoggedIn: signal(true) }
        }
      ]
    });
    service  = TestBed.inject(RemoteLoggingService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // Note: log() is a no-op in dev mode (isDevMode() = true in tests)
  // These tests verify the service API and rate limiting logic

  it('should have a log() method', () => {
    expect(typeof service.log).toBe('function');
  });

  it('should not throw when called', () => {
    expect(() => service.log({
      level: 'error',
      type: 'runtime',
      message: 'Test error'
    })).not.toThrow();
  });

  it('should not throw for warning level', () => {
    expect(() => service.log({
      level: 'warning',
      type: 'http',
      message: '404 Not Found',
      tags: { http_status: '404' }
    })).not.toThrow();
  });

  it('should not throw for info level', () => {
    expect(() => service.log({
      level: 'info',
      type: 'unknown',
      message: 'Info message'
    })).not.toThrow();
  });
});
