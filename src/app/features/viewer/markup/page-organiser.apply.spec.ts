/**
 * Sending the draft, and taking pages out to a document of their own.
 *
 * <p>This is where the working copy stops being a working copy, so the
 * assertions are on the request that goes out rather than on the component's
 * own state: a draft that looks right and sends the wrong plan is the failure
 * that reaches a user's document.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  OrganiserHarness, click, createOrganiser, ctrlClick, dropBetween,
} from './page-organiser.harness';

describe('sending the page organiser draft', () => {
  let harness: OrganiserHarness;

  beforeEach(() => { harness = createOrganiser(); });
  afterEach(() => harness.httpMock.verify());

  describe('applying', () => {
    it('sends the whole layout, including rotations, as one request', () => {
      harness.loadPages(3);
      harness.organiser.toggle(harness.idAt(0), click);
      harness.organiser.rotateSelection(90);
      harness.organiser.toggle(harness.idAt(1), click);
      harness.organiser.deleteSelection();
      harness.organiser.apply();

      const req = harness.httpMock.expectOne('/api/documents/7/pages/arrange');
      expect(req.request.body).toEqual({
        pages: [{ page: 1, rotate: 90 }, { page: 3, rotate: 0 }]
      });
      req.flush({
        success: true, documentId: 7, version: 4,
        summary: 'Deleted 1 page, rotated 1 page', pageCount: 2,
        createdAt: '2026-08-08T10:00:00'
      });

      expect(harness.state.currentVersion()).toBe(4);
      expect(harness.state.processingMessage()).toBe('v4 — Deleted 1 page, rotated 1 page');
    });

    it('does not call the server when nothing changed', () => {
      harness.loadPages(3);
      harness.organiser.apply();

      harness.httpMock.expectNone('/api/documents/7/pages/arrange');
    });

    it('keeps the draft and reports the reason when the server refuses', () => {
      harness.loadPages(3);
      harness.organiser.toggle(harness.idAt(0), click);
      harness.organiser.deleteSelection();
      harness.organiser.apply();

      // The RFC 9457 shape the API actually returns: the readable text is
      // `detail`, not `message`.
      harness.httpMock.expectOne('/api/documents/7/pages/arrange')
        .flush({ type: '/problems/document-processing-failed',
                 title: 'Document processing failed',
                 status: 422,
                 detail: 'A document must keep at least one page.',
                 traceId: '4f8a1c2e9b7d6a5f3e2d1c0b9a8f7e6d' },
               { status: 422, statusText: 'Unprocessable Entity' });

      expect(harness.organiser.operations.messageIsError()).toBe(true);
      // The reference is appended now: §1.4 requires a correlation identifier
      // the user can quote to support, and this is the only place they see
      // one. The server's sentence still leads — it is what tells them what to
      // do, and the identifier is only useful once they have given up doing it
      // themselves.
      expect(harness.organiser.operations.message()).toBe(
        'A document must keep at least one page. Reference 4f8a1c2e9b7d6a5f3e2d1c0b9a8f7e6d.');
      expect(harness.sourceOrder()).toEqual([2, 3]);
      expect(harness.organiser.operations.working()).toBe(false);
    });

    it('names the converter when it is the thing that is down', () => {
      harness.loadPages(2);
      harness.organiser.toggle(harness.idAt(0), click);
      harness.organiser.deleteSelection();
      harness.organiser.apply();

      harness.httpMock.expectOne('/api/documents/7/pages/arrange')
        .flush({}, { status: 503, statusText: 'Service Unavailable' });

      expect(harness.organiser.operations.message()).toContain('conversion service');
    });
  });

  describe('extracting', () => {
    it('sends the selected source pages in document order', () => {
      harness.loadPages(4);
      harness.organiser.toggle(harness.idAt(2), click);
      harness.organiser.toggle(harness.idAt(0), ctrlClick);
      harness.organiser.extractSelection();

      const req = harness.httpMock.expectOne('/api/documents/7/pages/extract');
      expect(req.request.body.pages).toEqual([1, 3]);
      req.flush({ success: true, documentId: 12, name: 'Plan (pages 1, 3)',
                  pageCount: 2, fileSize: 2048 });

      expect(harness.organiser.operations.messageIsError()).toBe(false);
      expect(harness.organiser.operations.message()).toContain('Plan (pages 1, 3)');
    });

    it('sends a duplicated page once', () => {
      harness.loadPages(2);
      harness.organiser.toggle(harness.idAt(0), click);
      harness.organiser.duplicateSelection();
      harness.organiser.pages.toggleSelectAll();
      harness.organiser.extractSelection();

      const req = harness.httpMock.expectOne('/api/documents/7/pages/extract');
      expect(req.request.body.pages).toEqual([1, 2]);
      req.flush({ success: true, documentId: 12, name: 'x', pageCount: 2, fileSize: 1 });
    });
  });
});
