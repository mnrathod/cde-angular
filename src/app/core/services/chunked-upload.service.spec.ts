import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { beforeEach, describe, expect, it } from 'vitest';
import { ChunkedUploadService } from './chunked-upload.service';

/**
 * How a large file is sent.
 *
 * <p>The server assembles the file on the chunk that completes the set, and it
 * needs a project to file the document under at that moment. The metadata went
 * with chunk zero instead, so a one-chunk upload worked and every larger one
 * uploaded every byte, reported success on each part, and quietly produced no
 * document at all — the failure was invisible from the client, which is why it
 * is pinned here.
 */
describe('ChunkedUploadService', () => {

  let service: ChunkedUploadService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), ChunkedUploadService]
    });
    service = TestBed.inject(ChunkedUploadService);
    http = TestBed.inject(HttpTestingController);
  });

  /** A file of a given size without allocating anything meaningful. */
  const fileOf = (megabytes: number, name = 'model.ifc') =>
    new File([new ArrayBuffer(megabytes * 1024 * 1024)], name);

  const formOf = (body: unknown) => body as FormData;

  it('sends the project and metadata on the last chunk, not the first', () => {
    // 6 MB at 2 MB a chunk is three chunks, and above the 10 MB direct limit?
    // No — so this one goes direct. Use a file that is genuinely chunked.
    service.upload(fileOf(6), 42, { name: 'GA Plan' }).subscribe();

    const direct = http.expectOne('/api/documents/upload');
    expect(formOf(direct.request.body).get('projectId')).toBe('42');
    direct.flush({ id: 7 });
  });

  it('chunks a large file and completes on the final part', () => {
    // 20 MB at 2 MB a chunk: ten chunks, and over the direct limit.
    let emitted: unknown = null;
    service.upload(fileOf(20), 42, { name: 'Model', documentType: 'BIM_MODEL' })
      .subscribe(response => { emitted = response; });

    for (let index = 0; index < 10; index++) {
      const request = http.expectOne('/api/documents/upload/chunk');
      const body = formOf(request.request.body);

      expect(body.get('chunkIndex')).toBe(String(index));
      expect(body.get('totalChunks')).toBe('10');

      const isLast = index === 9;
      // The whole point: the project reaches the server on the chunk that
      // completes the upload, and on no earlier one.
      expect(body.get('projectId')).toBe(isLast ? '42' : null);
      expect(body.get('name')).toBe(isLast ? 'Model' : null);

      request.flush(isLast
        ? { id: 1180, fileName: 'model.ifc' }
        : { uploadId: 'x', received: index + 1, totalChunks: 10 });
    }

    expect(emitted).toEqual({ id: 1180, fileName: 'model.ifc' });

    const progress = service.uploads().find(entry => entry.fileName === 'model.ifc');
    expect(progress?.status).toBe('done');
    expect(progress?.documentId).toBe(1180);
  });

  it('reports the server\'s explanation when a chunk is refused', () => {
    service.upload(fileOf(20), 42, {}).subscribe({ error: () => undefined });

    http.expectOne('/api/documents/upload/chunk').flush(
      { type: '/problems/upload-rejected', title: 'Upload rejected',
        detail: 'A single chunk may be at most 8 MB.' },
      { status: 422, statusText: 'Unprocessable Entity' });

    const progress = service.uploads().find(entry => entry.fileName === 'model.ifc');
    expect(progress?.status).toBe('error');
    // Not "Http failure response for /api/documents/upload/chunk: 422", which
    // is what the caller was shown before and says nothing about the limit.
    expect(progress?.message).toBe('A single chunk may be at most 8 MB.');
  });

  afterEach(() => http.verify());
});
