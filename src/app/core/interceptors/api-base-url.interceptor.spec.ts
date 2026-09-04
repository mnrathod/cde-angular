import { TestBed } from '@angular/core/testing';
import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { API_BASE_URL } from '../config/api-base-url';
import { apiBaseUrlInterceptor } from './api-base-url.interceptor';

/**
 * Where API calls actually go.
 *
 * <p>Every service in the application asks for a relative `/api/...` path,
 * which silently assumes the backend shares an origin with the page. That
 * holds for this application and fails for the embeddable viewer, where the
 * page belongs to somebody else.
 */
describe('apiBaseUrlInterceptor', () => {

  function clientWithBase(baseUrl: string) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiBaseUrlInterceptor])),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: baseUrl },
      ],
    });
    return {
      http: TestBed.inject(HttpClient),
      backend: TestBed.inject(HttpTestingController),
    };
  }

  afterEach(() => TestBed.resetTestingModule());

  describe('with no base URL configured', () => {

    it('leaves the request exactly as it was', () => {
      const { http, backend } = clientWithBase('');

      http.get('/api/documents/4').subscribe();

      // Asserted as the untouched path rather than "some URL ending in it":
      // the default is same-origin deployment, and it has to keep behaving
      // as though this interceptor were not installed at all.
      backend.expectOne('/api/documents/4').flush({});
      backend.verify();
    });
  });

  describe('with a base URL configured', () => {

    it('sends API calls to the configured origin', () => {
      const { http, backend } = clientWithBase('https://cde.example.test');

      http.get('/api/documents/4').subscribe();

      backend.expectOne('https://cde.example.test/api/documents/4').flush({});
      backend.verify();
    });

    it('does not produce a double slash when the base has a trailing one', () => {
      const { http, backend } = clientWithBase('https://cde.example.test/');

      http.get('/api/documents/4').subscribe();

      // `//api/...` is protocol-relative and resolves to a host called
      // `api`, which fails looking like DNS rather than configuration.
      backend.expectOne('https://cde.example.test/api/documents/4').flush({});
      backend.verify();
    });

    it('leaves an absolute URL alone even when its path contains /api/', () => {
      const { http, backend } = clientWithBase('https://cde.example.test');

      // The error reporter's endpoint. A rule matching "contains /api/"
      // rather than "is a relative /api path" would send crash reports to
      // the document API, which is the trap this test exists for.
      http.post('https://errors.example.test/api/7/store/', {}).subscribe();

      backend.expectOne('https://errors.example.test/api/7/store/').flush({});
      backend.verify();
    });

    it('leaves non-API paths alone, because only the API moves', () => {
      const { http, backend } = clientWithBase('https://cde.example.test');

      http.get('/assets/i18n/en.json').subscribe();

      backend.expectOne('/assets/i18n/en.json').flush({});
      backend.verify();
    });

    it('does not capture a path that merely starts with the letters', () => {
      const { http, backend } = clientWithBase('https://cde.example.test');

      http.get('/apiary/hives').subscribe();

      backend.expectOne('/apiary/hives').flush({});
      backend.verify();
    });

    it('rewrites the bare /api path', () => {
      const { http, backend } = clientWithBase('https://cde.example.test');

      http.get('/api').subscribe();

      backend.expectOne('https://cde.example.test/api').flush({});
      backend.verify();
    });
  });
});
