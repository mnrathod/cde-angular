import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting }
  from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { DocumentService } from './document.service';
import { Document, DocumentStatus, DocumentType } from '../models';

/**
 * The cached list of a project's documents, and what keeps it honest.
 *
 * <p>This service holds a signal the grid renders from, so every operation has
 * two jobs: make the request, and leave the cache agreeing with what the
 * server now holds. A cache that drifts shows a document somebody deleted, or
 * hides one they just uploaded, and both read as the product having lost work.
 *
 * <p>It also reads two response shapes for the same endpoint — a page and a
 * bare array. Only one of those is what the backend sends today, so the other
 * is the branch nothing had ever taken.
 */
describe('a project’s documents', () => {
  let documents: DocumentService;
  let httpMock: HttpTestingController;

  function document(id: number, fields: Partial<Document> = {}): Document {
    return {
      id, name: `Doc ${id}`, fileName: `doc-${id}.pdf`,
      fileType: 'application/pdf', fileSize: 1024,
      documentType: 'DRAWING' as DocumentType,
      status: 'DRAFT' as DocumentStatus,
      projectId: 7, uploadedBy: 'sam.okonkwo',
      createdAt: '2026-03-04T10:00:00Z', updatedAt: '2026-03-04T10:00:00Z',
      ...fields,
    } as Document;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), DocumentService],
    });
    documents = TestBed.inject(DocumentService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('loading a project’s documents', () => {

    it('fills the list from a page of results', () => {
      documents.loadByProject(7).subscribe();

      httpMock.expectOne((request) => request.url === '/api/documents/project/7')
        .flush({ content: [document(1), document(2)], totalElements: 2 });

      expect(documents.documents().map((each) => each.id)).toEqual([1, 2]);
      expect(documents.totalDocs()).toBe(2);
    });

    it('reports the total from the page rather than from the page’s length', () => {
      // The grid's paging reads this. Taking the length would say a project
      // has fifty documents when fifty is simply the page size.
      documents.loadByProject(7).subscribe();

      httpMock.expectOne((request) => request.url === '/api/documents/project/7')
        .flush({ content: [document(1)], totalElements: 137 });

      expect(documents.totalDocs()).toBe(137);
    });

    it('reads a bare array as well as a page', () => {
      // The branch nothing had taken. Kept because the shape is not this
      // service's to guarantee, and a list rendered empty because the
      // envelope changed is a worse failure than a redundant check.
      documents.loadByProject(7).subscribe();

      httpMock.expectOne((request) => request.url === '/api/documents/project/7')
        .flush([document(1), document(2), document(3)]);

      expect(documents.documents()).toHaveLength(3);
      expect(documents.totalDocs()).toBe(3);
    });

    it('copes with a page that carries no content field', () => {
      documents.loadByProject(7).subscribe();

      httpMock.expectOne((request) => request.url === '/api/documents/project/7')
        .flush({ totalElements: 0 });

      expect(documents.documents()).toEqual([]);
      expect(documents.totalDocs()).toBe(0);
    });

    it('falls back to the content length when no total was sent', () => {
      documents.loadByProject(7).subscribe();

      httpMock.expectOne((request) => request.url === '/api/documents/project/7')
        .flush({ content: [document(1), document(2)] });

      expect(documents.totalDocs()).toBe(2);
    });

    it('asks for the page and size it was given', () => {
      documents.loadByProject(7, 2, 25).subscribe();

      const request = httpMock.expectOne(
        (candidate) => candidate.url === '/api/documents/project/7');

      expect(request.request.params.get('page')).toBe('2');
      expect(request.request.params.get('size')).toBe('25');
      request.flush({ content: [], totalElements: 0 });
    });

    it('asks for the newest first by default', () => {
      documents.loadByProject(7).subscribe();

      const request = httpMock.expectOne(
        (candidate) => candidate.url === '/api/documents/project/7');

      expect(request.request.params.get('sort')).toBe('createdAt,desc');
      request.flush({ content: [], totalElements: 0 });
    });

    it('is loading while the request is in flight', () => {
      documents.loadByProject(7).subscribe();

      expect(documents.loading()).toBe(true);
      httpMock.expectOne((request) => request.url === '/api/documents/project/7')
        .flush({ content: [], totalElements: 0 });
    });

    it('stops loading once the answer arrives', () => {
      documents.loadByProject(7).subscribe();
      httpMock.expectOne((request) => request.url === '/api/documents/project/7')
        .flush({ content: [], totalElements: 0 });

      expect(documents.loading()).toBe(false);
    });
  });

  describe('reading one document without disturbing the list', () => {

    it('returns it', () => {
      let received: Document | null = null;
      documents.getById(42).subscribe((doc) => { received = doc; });

      httpMock.expectOne('/api/documents/42').flush(document(42));

      expect(received).not.toBeNull();
      expect(received!.id).toBe(42);
    });

    it('leaves the cached list alone', () => {
      // The page organiser reads a document to find its project before it can
      // offer sibling pages. Replacing the grid's list from that would empty
      // the grid behind the dialog.
      documents.loadByProject(7).subscribe();
      httpMock.expectOne((request) => request.url === '/api/documents/project/7')
        .flush({ content: [document(1), document(2)], totalElements: 2 });

      documents.getById(42).subscribe();
      httpMock.expectOne('/api/documents/42').flush(document(42));

      expect(documents.documents().map((each) => each.id)).toEqual([1, 2]);
    });
  });

  describe('listing a project’s documents for a picker', () => {

    it('unwraps a page into a plain list', () => {
      let received: Document[] = [];
      documents.listByProject(7).subscribe((docs) => { received = docs; });

      httpMock.expectOne((request) => request.url === '/api/documents/project/7')
        .flush({ content: [document(1), document(2)] });

      expect(received.map((each) => each.id)).toEqual([1, 2]);
    });

    it('passes a bare array straight through', () => {
      let received: Document[] = [];
      documents.listByProject(7).subscribe((docs) => { received = docs; });

      httpMock.expectOne((request) => request.url === '/api/documents/project/7')
        .flush([document(1)]);

      expect(received).toHaveLength(1);
    });

    it('returns an empty list rather than undefined for an empty page', () => {
      let received: Document[] | null = null;
      documents.listByProject(7).subscribe((docs) => { received = docs; });

      httpMock.expectOne((request) => request.url === '/api/documents/project/7')
        .flush({});

      expect(received).toEqual([]);
    });

    it('sorts by name, because a picker is read rather than scanned', () => {
      documents.listByProject(7).subscribe();

      const request = httpMock.expectOne(
        (candidate) => candidate.url === '/api/documents/project/7');

      expect(request.request.params.get('sort')).toBe('name,asc');
      request.flush([]);
    });

    it('leaves the cached list alone', () => {
      documents.loadByProject(7).subscribe();
      httpMock.expectOne((request) => request.url === '/api/documents/project/7')
        .flush({ content: [document(1)], totalElements: 1 });

      documents.listByProject(9).subscribe();
      httpMock.expectOne((request) => request.url === '/api/documents/project/9')
        .flush([document(50), document(51)]);

      expect(documents.documents().map((each) => each.id)).toEqual([1]);
    });
  });

  describe('uploading', () => {
    const file = new File(['bytes'], 'A-101 Ground floor.pdf', { type: 'application/pdf' });

    function uploadedForm(meta: Partial<Document> = {}): FormData {
      documents.upload(7, file, meta).subscribe();
      const request = httpMock.expectOne('/api/documents/upload');
      const body = request.request.body as FormData;
      request.flush(document(99));
      return body;
    }

    it('adds the uploaded document to the list', () => {
      // So the grid shows it without a reload. §1.4's optimistic UI, except
      // this waits for the server, which is the right way round for an
      // upload — the id and the stored name come back from it.
      documents.upload(7, file, {}).subscribe();
      httpMock.expectOne('/api/documents/upload').flush(document(99));

      expect(documents.documents().map((each) => each.id)).toEqual([99]);
    });

    it('keeps the documents already listed', () => {
      documents.loadByProject(7).subscribe();
      httpMock.expectOne((request) => request.url === '/api/documents/project/7')
        .flush({ content: [document(1)], totalElements: 1 });

      documents.upload(7, file, {}).subscribe();
      httpMock.expectOne('/api/documents/upload').flush(document(99));

      expect(documents.documents().map((each) => each.id)).toEqual([1, 99]);
    });

    it('names the document after the file when no name was given', () => {
      // Without the extension: "A-101 Ground floor", not "A-101 Ground
      // floor.pdf". A document's name is read by people, and the extension
      // is already in its file name.
      expect(uploadedForm().get('name')).toBe('A-101 Ground floor');
    });

    it('prefers the name the uploader typed', () => {
      expect(uploadedForm({ name: 'Ground floor plan' }).get('name'))
        .toBe('Ground floor plan');
    });

    it('strips only the last extension', () => {
      const archive = new File(['x'], 'drawings.tar.gz', { type: 'application/gzip' });
      documents.upload(7, archive, {}).subscribe();
      const request = httpMock.expectOne('/api/documents/upload');

      expect((request.request.body as FormData).get('name')).toBe('drawings.tar');
      request.flush(document(1));
    });

    it('classifies an unclassified document as OTHER rather than sending nothing', () => {
      expect(uploadedForm().get('documentType')).toBe('OTHER');
    });

    it('sends the drawing number and revision when they were given', () => {
      const body = uploadedForm({ drawingNumber: 'A-101', revision: 'P02' });

      expect(body.get('drawingNumber')).toBe('A-101');
      expect(body.get('revision')).toBe('P02');
    });

    it('sends empty strings, not the word undefined, when they were not', () => {
      // A metadata field that arrives as the literal "undefined" is worse
      // than an absent one: it is stored, indexed and shown.
      const body = uploadedForm();

      expect(body.get('drawingNumber')).toBe('');
      expect(body.get('revision')).toBe('');
    });

    it('sends the project it belongs to', () => {
      expect(uploadedForm().get('projectId')).toBe('7');
    });

    it('does not add the document to the list when the upload failed', () => {
      documents.upload(7, file, {}).subscribe({ error: () => undefined });
      httpMock.expectOne('/api/documents/upload')
        .flush({ detail: 'Too large' }, { status: 413, statusText: 'Payload Too Large' });

      expect(documents.documents()).toEqual([]);
    });
  });

  describe('deleting', () => {

    it('removes it from the list', () => {
      documents.loadByProject(7).subscribe();
      httpMock.expectOne((request) => request.url === '/api/documents/project/7')
        .flush({ content: [document(1), document(2)], totalElements: 2 });

      documents.delete(1).subscribe();
      httpMock.expectOne('/api/documents/1').flush(null);

      expect(documents.documents().map((each) => each.id)).toEqual([2]);
    });

    it('leaves the list alone when the delete failed', () => {
      // The document is still there. Removing it from the list anyway would
      // show it gone until the next reload put it back.
      documents.loadByProject(7).subscribe();
      httpMock.expectOne((request) => request.url === '/api/documents/project/7')
        .flush({ content: [document(1)], totalElements: 1 });

      documents.delete(1).subscribe({ error: () => undefined });
      httpMock.expectOne('/api/documents/1')
        .flush({ detail: 'Nope' }, { status: 403, statusText: 'Forbidden' });

      expect(documents.documents().map((each) => each.id)).toEqual([1]);
    });

    it('removes nothing when the id is not in the list', () => {
      documents.loadByProject(7).subscribe();
      httpMock.expectOne((request) => request.url === '/api/documents/project/7')
        .flush({ content: [document(1)], totalElements: 1 });

      documents.delete(99).subscribe();
      httpMock.expectOne('/api/documents/99').flush(null);

      expect(documents.documents().map((each) => each.id)).toEqual([1]);
    });
  });

  describe('changing a document’s status', () => {

    it('replaces it in the list with what the server returned', () => {
      // Not with a locally patched copy: the server also moves
      // `updatedAt`, and a list showing the new status with the old
      // timestamp is a list that disagrees with the document.
      documents.loadByProject(7).subscribe();
      httpMock.expectOne((request) => request.url === '/api/documents/project/7')
        .flush({ content: [document(1), document(2)], totalElements: 2 });

      documents.updateStatus(1, 'APPROVED' as DocumentStatus).subscribe();
      httpMock.expectOne((request) => request.url === '/api/documents/1/status')
        .flush(document(1, { status: 'APPROVED' as DocumentStatus }));

      expect(documents.documents()[0]?.status).toBe('APPROVED');
      expect(documents.documents()[1]?.status).toBe('DRAFT');
    });

    it('sends the status as a parameter', () => {
      documents.updateStatus(1, 'IN_REVIEW' as DocumentStatus).subscribe();

      const request = httpMock.expectOne(
        (candidate) => candidate.url === '/api/documents/1/status');

      expect(request.request.params.get('status')).toBe('IN_REVIEW');
      request.flush(document(1));
    });

    it('leaves the list alone when the change was refused', () => {
      documents.loadByProject(7).subscribe();
      httpMock.expectOne((request) => request.url === '/api/documents/project/7')
        .flush({ content: [document(1)], totalElements: 1 });

      documents.updateStatus(1, 'APPROVED' as DocumentStatus)
        .subscribe({ error: () => undefined });
      httpMock.expectOne((request) => request.url === '/api/documents/1/status')
        .flush({ detail: 'Not yours to approve' },
               { status: 403, statusText: 'Forbidden' });

      expect(documents.documents()[0]?.status).toBe('DRAFT');
    });
  });

  describe('recognising what a document is', () => {

    it.each([
      ['plan.pdf', '📕'], ['spec.docx', '📝'], ['schedule.xlsx', '📊'],
      ['tower.ifc', '🏗'], ['tower.glb', '🎲'], ['plan.dwg', '📐'],
      ['site.png', '🖼'], ['detail.svg', '🎨'], ['part.stl', '🖨'],
    ])('gives %s its own icon', (fileName, icon) => {
      expect(documents.getFileIcon(document(1, { fileName }))).toBe(icon);
    });

    it('falls back to a generic icon for a format it does not know', () => {
      expect(documents.getFileIcon(document(1, { fileName: 'notes.xyz' }))).toBe('📄');
    });

    it('falls back for a file with no extension', () => {
      expect(documents.getFileIcon(document(1, { fileName: 'README' }))).toBe('📄');
    });

    it('falls back when there is no file name at all', () => {
      expect(documents.getFileIcon(document(1, { fileName: undefined })))
        .toBe('📄');
    });

    it('ignores the case of the extension', () => {
      // Windows uploads arrive as .PDF often enough to matter.
      expect(documents.getFileIcon(document(1, { fileName: 'PLAN.PDF' }))).toBe('📕');
    });

    it.each(['tower.ifc', 'tower.glb', 'tower.gltf', 'part.obj', 'part.stl',
             'cloud.ply', 'scene.dae', 'old.3ds', 'model.rvt', 'door.rfa'])(
      'recognises %s as a model', (fileName) => {
        expect(documents.is3D(document(1, { fileName }))).toBe(true);
      });

    it('does not mistake a drawing for a model', () => {
      // Both open in a viewer, and in different ones. Sending a DWG to the
      // 3D route gets an "unsupported format" for a file the product reads
      // perfectly well.
      expect(documents.is3D(document(1, { fileName: 'plan.dwg' }))).toBe(false);
      expect(documents.is3D(document(1, { fileName: 'plan.pdf' }))).toBe(false);
    });

    it('does not mistake a file with no name for a model', () => {
      expect(documents.is3D(document(1, { fileName: undefined }))).toBe(false);
    });

    it('recognises a model whatever the case of its extension', () => {
      expect(documents.is3D(document(1, { fileName: 'TOWER.IFC' }))).toBe(true);
    });
  });
});
