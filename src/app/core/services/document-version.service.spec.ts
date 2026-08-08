import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { DocumentVersionService, DocumentVersion } from './document-version.service';
import { RedactionService } from './redaction.service';
import { OcrService } from './ocr.service';
import { PdfFormService } from './pdf-form.service';
import { FlattenService } from './viewer/flatten.service';
import { RedactionRegion } from './viewer/viewer-state.service';

describe('DocumentVersionService', () => {
  let service: DocumentVersionService;
  let httpMock: HttpTestingController;

  const VERSION: DocumentVersion = {
    version:     2,
    operation:   'OCR',
    summary:     'Recognised 3 page(s)',
    fileName:    'plan.pdf',
    fileSize:    2048,
    contentHash: 'abc123',
    createdBy:   'admin',
    createdAt:   '2026-08-08T10:00:00',
    current:     true
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service  = TestBed.inject(DocumentVersionService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('history', () => {
    it('requests the document version list', () => {
      let received: DocumentVersion[] | undefined;
      service.listVersions(7).subscribe(v => received = v);

      const req = httpMock.expectOne('/api/documents/7/versions');
      expect(req.request.method).toBe('GET');
      req.flush([VERSION]);

      expect(received).toEqual([VERSION]);
    });

    it('posts to restore an earlier version', () => {
      service.restore(7, 1).subscribe();

      const req = httpMock.expectOne('/api/documents/7/versions/1/restore');
      expect(req.request.method).toBe('POST');
      req.flush({ ...VERSION, version: 3, operation: 'RESTORE' });
    });

    it('downloads a version as a blob', () => {
      service.downloadVersion(7, 2).subscribe();

      const req = httpMock.expectOne('/api/documents/7/versions/2/file');
      expect(req.request.method).toBe('GET');
      expect(req.request.responseType).toBe('blob');
      req.flush(new Blob(['pdf']));
    });
  });

  describe('formatting', () => {
    it('labels every operation the server can report', () => {
      expect(service.operationLabel('UPLOAD')).toBe('Uploaded');
      expect(service.operationLabel('REDACT')).toBe('Redacted');
      expect(service.operationLabel('OCR')).toBe('OCR');
      expect(service.operationLabel('FLATTEN')).toBe('Flattened');
      expect(service.operationLabel('FORM_FILL')).toBe('Form filled');
      expect(service.operationLabel('RESTORE')).toBe('Restored');
    });

    it('falls back to the raw name for an operation it does not know', () => {
      expect(service.operationLabel('SOMETHING_NEW' as never)).toBe('SOMETHING_NEW');
    });

    it('scales file sizes through the unit boundaries', () => {
      expect(service.formatSize(512)).toBe('512 B');
      expect(service.formatSize(2048)).toBe('2.0 KB');
      expect(service.formatSize(5 * 1024 * 1024)).toBe('5.0 MB');
      expect(service.formatSize(3 * 1024 * 1024 * 1024)).toBe('3.0 GB');
    });

    it('renders nothing for a missing size', () => {
      expect(service.formatSize(null)).toBe('');
    });
  });
});

/**
 * The four rewriting operations previously returned the PDF itself, which is
 * what stopped them composing. These assert the contract they moved to: a JSON
 * body naming the version they committed.
 */
describe('processing operations commit versions', () => {
  let httpMock: HttpTestingController;

  const COMMITTED = {
    success: true, documentId: 7, version: 4,
    operation: 'OCR', summary: 'Recognised 3 page(s)',
    fileSize: 2048, createdAt: '2026-08-08T10:00:00',
    details: { ocrPages: 3, skippedPages: 1 }
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('redaction asks for JSON, not a file download', () => {
    const regions: RedactionRegion[] = [
      { id: 'r1', page: 1, x: 10, y: 20, width: 100, height: 50, reason: 'PII' }
    ];
    let version = 0;
    TestBed.inject(RedactionService).redact(7, regions).subscribe(r => version = r.version);

    const req = httpMock.expectOne('/api/documents/7/redact');
    expect(req.request.responseType).toBe('json');
    expect(req.request.body.regions).toEqual([
      { page: 1, x: 10, y: 20, width: 100, height: 50, reason: 'PII' }
    ]);
    req.flush({ ...COMMITTED, operation: 'REDACT' });

    expect(version).toBe(4);
  });

  it('OCR reads its page counts from the committed version details', () => {
    const ocr = TestBed.inject(OcrService);
    let counts = { ocrPages: 0, skippedPages: 0 };
    ocr.makeSearchable(7).subscribe(r => counts = ocr.readCounts(r));

    httpMock.expectOne('/api/documents/7/ocr').flush(COMMITTED);

    expect(counts).toEqual({ ocrPages: 3, skippedPages: 1 });
  });

  it('OCR reports zero counts when the server omits them', () => {
    const ocr = TestBed.inject(OcrService);
    let counts = { ocrPages: -1, skippedPages: -1 };
    ocr.makeSearchable(7).subscribe(r => counts = ocr.readCounts(r));

    httpMock.expectOne('/api/documents/7/ocr').flush({ ...COMMITTED, details: {} });

    expect(counts).toEqual({ ocrPages: 0, skippedPages: 0 });
  });

  it('form fill sends values and the flatten flag', () => {
    let version = 0;
    TestBed.inject(PdfFormService)
      .fillForm(7, { name: 'Ada', agreed: true }, true)
      .subscribe(r => version = r.version);

    const req = httpMock.expectOne('/api/documents/7/form-fill');
    expect(req.request.body).toEqual({ fields: { name: 'Ada', agreed: true }, flatten: true });
    req.flush({ ...COMMITTED, operation: 'FORM_FILL' });

    expect(version).toBe(4);
  });

  it('flatten posts the shapes and quality to the viewer endpoint', () => {
    let operation = '';
    TestBed.inject(FlattenService)
      .flattenToPdf({ documentId: 7, shapes: [], quality: 'print' })
      .subscribe(r => operation = r.operation);

    const req = httpMock.expectOne('/api/viewer/7/flatten');
    expect(req.request.body).toEqual({ shapes: [], quality: 'print' });
    req.flush({ ...COMMITTED, operation: 'FLATTEN' });

    expect(operation).toBe('FLATTEN');
  });
});
