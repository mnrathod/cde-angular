import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { RedactionService, REDACTION_PRESETS, TextSearchResult } from './redaction.service';
import { RedactionRegion } from './viewer/viewer-state.service';
import { definitely } from '../../../testing/definitely';

describe('RedactionService', () => {
  let service: RedactionService;
  let httpMock: HttpTestingController;

  const COMMITTED = {
    success: true, documentId: 7, version: 3, operation: 'REDACT',
    summary: 'Redacted 2 match(es) of email across 1 page(s)',
    fileSize: 2048, createdAt: '2026-08-08T10:00:00', details: {}
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service  = TestBed.inject(RedactionService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('drawn regions', () => {
    it('sends only the geometry the server needs', () => {
      const regions: RedactionRegion[] = [
        { id: 'r1', page: 2, x: 10, y: 20, width: 100, height: 50, reason: 'PII' }
      ];
      service.redact(7, regions).subscribe();

      const req = httpMock.expectOne('/api/documents/7/redact');
      expect(req.request.body).toEqual({
        regions: [{ page: 2, x: 10, y: 20, width: 100, height: 50, reason: 'PII' }]
      });
      req.flush(COMMITTED);
    });
  });

  describe('finding text', () => {
    it('posts the search and reports matches', () => {
      let result: TextSearchResult | undefined;
      service.findText(7, { terms: ['secret'], presets: ['email'], matchCase: true })
        .subscribe(r => result = r);

      const req = httpMock.expectOne('/api/documents/7/find-text');
      expect(req.request.body).toEqual({
        terms: ['secret'], presets: ['email'], matchCase: true
      });
      req.flush({
        success: true, matchCount: 1, pagesWithoutText: 0,
        matches: [{ page: 1, text: 'a@b.com', pattern: 'preset:email',
                    x: 10, y: 20, width: 60, height: 12 }]
      });

      expect(definitely(result?.matches[0]).text).toBe('a@b.com');
    });

    it('surfaces pages that cannot be searched', () => {
      // A scan has no text layer, so a nil result is not the same as
      // "this document is clean".
      let result: TextSearchResult | undefined;
      service.findText(7, { presets: ['email'] }).subscribe(r => result = r);

      httpMock.expectOne('/api/documents/7/find-text')
        .flush({ success: true, matchCount: 0, matches: [], pagesWithoutText: 3 });

      expect(result?.pagesWithoutText).toBe(3);
    });
  });

  describe('redacting matches', () => {
    it('sends the search, not the previewed coordinates', () => {
      // The server searches again immediately before redacting, so a version
      // committed in between cannot black out the wrong part of the page.
      let version = 0;
      service.redactMatching(7, { presets: ['email', 'phone'] }).subscribe(r => version = r.version);

      const req = httpMock.expectOne('/api/documents/7/redact-matching');
      expect(req.request.body).toEqual({ presets: ['email', 'phone'] });
      expect(JSON.stringify(req.request.body)).not.toContain('"x"');
      req.flush(COMMITTED);

      expect(version).toBe(3);
    });
  });

  describe('presets', () => {
    it('offers the categories the server recognises, each with a label', () => {
      expect(REDACTION_PRESETS.map(p => p.id).sort()).toEqual(
        ['creditCard', 'email', 'iban', 'niNumber', 'phone', 'postcode', 'ssn']);
      expect(REDACTION_PRESETS.every(p => p.label.length > 0)).toBe(true);
    });
  });
});
