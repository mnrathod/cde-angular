import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { PageService, PdfPageInfoResponse } from './page.service';
import { definitely } from '../../../testing/definitely';

describe('PageService', () => {
  let service: PageService;
  let httpMock: HttpTestingController;

  const ARRANGED = {
    success: true, documentId: 7, version: 3,
    summary: 'Deleted 1 page, reordered pages', pageCount: 2,
    createdAt: '2026-08-08T10:00:00'
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service  = TestBed.inject(PageService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('reads page sizes and rotations', () => {
    let received: PdfPageInfoResponse | undefined;
    service.getPages(7).subscribe(r => received = r);

    const req = httpMock.expectOne('/api/documents/7/pages');
    expect(req.request.method).toBe('GET');
    req.flush({
      success: true, pageCount: 1,
      pages: [{ page: 1, width: 612, height: 792, rotation: 90 }]
    });

    expect(definitely(received?.pages[0]).rotation).toBe(90);
  });

  it('sends the whole layout to arrange, not a list of commands', () => {
    // Reorder, delete, duplicate and rotate share one request so a batch of
    // edits commits as a single version.
    let summary = '';
    service.arrange(7, [
      { page: 3, rotate: 90 },
      { page: 1, rotate: 0 },
      { page: 1, rotate: 0 }
    ]).subscribe(r => summary = r.summary);

    const req = httpMock.expectOne('/api/documents/7/pages/arrange');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      pages: [
        { page: 3, rotate: 90 },
        { page: 1, rotate: 0 },
        { page: 1, rotate: 0 }
      ]
    });
    req.flush(ARRANGED);

    expect(summary).toBe('Deleted 1 page, reordered pages');
  });

  it('names the donor document and position when inserting', () => {
    service.insert(7, 9, [1, 2], 3).subscribe();

    const req = httpMock.expectOne('/api/documents/7/pages/insert');
    expect(req.request.body).toEqual({ sourceDocumentId: 9, pages: [1, 2], position: 3 });
    req.flush(ARRANGED);
  });

  it('omits the position when appending', () => {
    service.insert(7, 9, [1]).subscribe();

    const req = httpMock.expectOne('/api/documents/7/pages/insert');
    expect(req.request.body.position).toBeUndefined();
    req.flush(ARRANGED);
  });

  it('extracts pages into a new document', () => {
    let created = 0;
    service.extract(7, [1, 3], 'Cover sheets').subscribe(r => created = r.documentId);

    const req = httpMock.expectOne('/api/documents/7/pages/extract');
    expect(req.request.body).toEqual({ pages: [1, 3], name: 'Cover sheets' });
    req.flush({ success: true, documentId: 12, name: 'Cover sheets', pageCount: 2, fileSize: 1024 });

    expect(created).toBe(12);
  });
});
