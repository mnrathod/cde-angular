import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CdkDragDrop } from '@angular/cdk/drag-drop';

import { PageOrganiserComponent, DraftPage } from './page-organiser.component';
import { ViewerStateService } from '../../../../viewer-core/viewer-state.service';
import { definitely } from '../../../../testing/definitely';

/**
 * A drop event carrying only what `onDrop` reads.
 *
 * <p>The tests previously cast a two-field object to `CdkDragDrop<never>`,
 * which strict mode refuses because `never` is not assignable to the element
 * type the component declares. Naming the two fields the component actually
 * uses is both what makes it type-check and a statement of the dependency —
 * if `onDrop` starts reading `container` or `item`, this stops compiling
 * rather than passing `undefined` into it.
 */
function dropBetween(previousIndex: number, currentIndex: number): CdkDragDrop<DraftPage[]> {
  return { previousIndex, currentIndex } as unknown as CdkDragDrop<DraftPage[]>;
}


/**
 * The organiser holds a working copy of the page layout that is not written
 * until Apply, so the behaviour worth pinning is what that draft does to the
 * request it eventually sends.
 */
describe('PageOrganiserComponent', () => {
  let fixture: ComponentFixture<PageOrganiserComponent>;
  let organiser: PageOrganiserComponent;
  let state: ViewerStateService;
  let httpMock: HttpTestingController;

  /** Click with no modifier — replaces the selection. */
  const click = new MouseEvent('click');
  /** Ctrl-click — adds to the selection. */
  const ctrlClick = new MouseEvent('click', { ctrlKey: true });

  function loadPages(count: number) {
    state.thumbnails.set(
      Array.from({ length: count }, (_, index) => ({
        pageNumber: index + 1,
        dataUrl: `data:image/jpeg;base64,page${index + 1}`
      }))
    );
    fixture.detectChanges();
  }

  /** Ids of the draft pages, which the selection is keyed on. */
  function ids(): number[] {
    return organiser.draft().map(page => page.id);
  }

  /**
   * The id of the nth draft page.
   *
   * <p>A named accessor rather than `ids()[n]` at each call site: indexing
   * yields `number | undefined`, and every use here follows a setup that
   * guarantees the page exists. Asserting once, here, keeps a genuine absence
   * a loud failure naming the index rather than a `TypeError` deep inside the
   * component.
   */
  function idAt(index: number): number {
    return definitely(ids()[index], `draft page ${index}`);
  }

  function sourceOrder(): number[] {
    return organiser.draft().map(page => page.sourcePage);
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PageOrganiserComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), ViewerStateService]
    });
    fixture   = TestBed.createComponent(PageOrganiserComponent);
    organiser = fixture.componentInstance;
    state     = TestBed.inject(ViewerStateService);
    httpMock  = TestBed.inject(HttpTestingController);
    state.documentId.set(7);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  describe('loading', () => {
    it('builds a draft page per thumbnail', () => {
      loadPages(3);
      expect(sourceOrder()).toEqual([1, 2, 3]);
      expect(organiser.dirty()).toBe(false);
    });

    it('rebuilds when a committed version changes the page count', () => {
      loadPages(3);
      organiser.selectAll();
      state.applyVersionCommit(2, 'Deleted 1 page');
      loadPages(2);

      expect(sourceOrder()).toEqual([1, 2]);
      expect(organiser.dirty()).toBe(false);
      expect(organiser.hasSelection()).toBe(false);
    });
  });

  describe('selection', () => {
    it('a plain click selects one page and replaces the previous selection', () => {
      loadPages(3);
      organiser.toggle(idAt(0), click);
      organiser.toggle(idAt(2), click);

      expect(organiser.selection().size).toBe(1);
      expect(organiser.isSelected(idAt(2))).toBe(true);
    });

    it('ctrl-click adds to the selection', () => {
      loadPages(3);
      organiser.toggle(idAt(0), click);
      organiser.toggle(idAt(2), ctrlClick);

      expect(organiser.selection().size).toBe(2);
    });

    it('clicking the only selected page clears it', () => {
      loadPages(2);
      organiser.toggle(idAt(0), click);
      organiser.toggle(idAt(0), click);

      expect(organiser.hasSelection()).toBe(false);
    });

    it('select-all toggles both ways', () => {
      loadPages(3);
      organiser.selectAll();
      expect(organiser.allSelected()).toBe(true);

      organiser.selectAll();
      expect(organiser.hasSelection()).toBe(false);
    });
  });

  describe('editing the draft', () => {
    it('reorders on drop', () => {
      loadPages(3);
      organiser.onDrop(dropBetween(2, 0));

      expect(sourceOrder()).toEqual([3, 1, 2]);
      expect(organiser.dirty()).toBe(true);
    });

    it('a drop that does not move anything leaves the draft clean', () => {
      loadPages(3);
      organiser.onDrop(dropBetween(1, 1));

      expect(organiser.dirty()).toBe(false);
    });

    it('rotation accumulates and wraps at 360', () => {
      loadPages(1);
      organiser.selectAll();
      organiser.rotateSelection(90);
      organiser.rotateSelection(90);
      expect(definitely(organiser.draft()[0]).rotate).toBe(180);

      organiser.rotateSelection(180);
      expect(definitely(organiser.draft()[0]).rotate).toBe(0);
      expect(organiser.dirty()).toBe(false);
    });

    it('rotating anticlockwise stays positive', () => {
      loadPages(1);
      organiser.selectAll();
      organiser.rotateSelection(-90);

      expect(definitely(organiser.draft()[0]).rotate).toBe(270);
    });

    it('duplicates a page next to itself, with its own identity', () => {
      loadPages(2);
      organiser.toggle(idAt(0), click);
      organiser.duplicateSelection();

      expect(sourceOrder()).toEqual([1, 1, 2]);
      // Distinct ids matter: two copies of page 1 must be separately
      // selectable and separately draggable.
      expect(new Set(ids()).size).toBe(3);
    });

    it('deletes the selected pages', () => {
      loadPages(3);
      organiser.toggle(idAt(1), click);
      organiser.deleteSelection();

      expect(sourceOrder()).toEqual([1, 3]);
    });

    it('refuses to delete every page', () => {
      loadPages(2);
      organiser.selectAll();

      expect(organiser.canDeleteSelection()).toBe(false);
      organiser.deleteSelection();
      expect(sourceOrder()).toEqual([1, 2]);
    });

    it('discard returns the draft to the loaded layout', () => {
      loadPages(3);
      organiser.selectAll();
      organiser.rotateSelection(90);
      organiser.onDrop(dropBetween(0, 2));
      expect(organiser.dirty()).toBe(true);

      organiser.discard();

      expect(sourceOrder()).toEqual([1, 2, 3]);
      expect(organiser.draft().every(page => page.rotate === 0)).toBe(true);
      expect(organiser.dirty()).toBe(false);
    });
  });

  describe('applying', () => {
    it('sends the whole layout, including rotations, as one request', () => {
      loadPages(3);
      organiser.toggle(idAt(0), click);
      organiser.rotateSelection(90);
      organiser.toggle(idAt(1), click);
      organiser.deleteSelection();
      organiser.apply();

      const req = httpMock.expectOne('/api/documents/7/pages/arrange');
      expect(req.request.body).toEqual({
        pages: [{ page: 1, rotate: 90 }, { page: 3, rotate: 0 }]
      });
      req.flush({
        success: true, documentId: 7, version: 4,
        summary: 'Deleted 1 page, rotated 1 page', pageCount: 2,
        createdAt: '2026-08-08T10:00:00'
      });

      expect(state.currentVersion()).toBe(4);
      expect(state.processingMessage()).toBe('v4 — Deleted 1 page, rotated 1 page');
    });

    it('does not call the server when nothing changed', () => {
      loadPages(3);
      organiser.apply();

      httpMock.expectNone('/api/documents/7/pages/arrange');
    });

    it('keeps the draft and reports the reason when the server refuses', () => {
      loadPages(3);
      organiser.toggle(idAt(0), click);
      organiser.deleteSelection();
      organiser.apply();

      // The RFC 9457 shape the API actually returns: the readable text is
      // `detail`, not `message`.
      httpMock.expectOne('/api/documents/7/pages/arrange')
        .flush({ type: '/problems/document-processing-failed',
                 title: 'Document processing failed',
                 status: 422,
                 detail: 'A document must keep at least one page.',
                 traceId: '4f8a1c2e9b7d6a5f3e2d1c0b9a8f7e6d' },
               { status: 422, statusText: 'Unprocessable Entity' });

      expect(organiser.messageIsError()).toBe(true);
      expect(organiser.message()).toBe('A document must keep at least one page.');
      expect(sourceOrder()).toEqual([2, 3]);
      expect(organiser.working()).toBe(false);
    });

    it('names the converter when it is the thing that is down', () => {
      loadPages(2);
      organiser.toggle(idAt(0), click);
      organiser.deleteSelection();
      organiser.apply();

      httpMock.expectOne('/api/documents/7/pages/arrange')
        .flush({}, { status: 503, statusText: 'Service Unavailable' });

      expect(organiser.message()).toContain('conversion service');
    });
  });

  describe('inserting from another document', () => {
    it('offers only the other PDFs in the same project', () => {
      loadPages(2);
      organiser.openInsertPicker();

      httpMock.expectOne('/api/documents/7').flush({ id: 7, projectId: 4 });
      httpMock.expectOne(req => req.url === '/api/documents/project/4').flush([
        { id: 7, name: 'This one',   fileName: 'a.pdf', fileType: 'application/pdf', projectId: 4 },
        { id: 8, name: 'Sibling',    fileName: 'b.pdf', fileType: 'application/pdf', projectId: 4 },
        { id: 9, name: 'A drawing',  fileName: 'c.dwg', fileType: 'image/vnd.dwg',   projectId: 4 }
      ]);

      // The document being edited would be a self-insert, and a DWG has no
      // pages to take.
      expect(organiser.candidates().map(c => c.id)).toEqual([8]);
    });

    it('asks the donor for its page count and inserts all of them', () => {
      loadPages(2);
      organiser.insertFrom(8);

      httpMock.expectOne('/api/documents/8/pages').flush({
        success: true, pageCount: 3,
        pages: [{ page: 1 }, { page: 2 }, { page: 3 }]
      });

      const req = httpMock.expectOne('/api/documents/7/pages/insert');
      expect(req.request.body.pages).toEqual([1, 2, 3]);
      expect(req.request.body.sourceDocumentId).toBe(8);
      req.flush({
        success: true, documentId: 7, version: 2,
        summary: 'Inserted 3 page(s) from "Sibling" at page 3',
        pageCount: 5, createdAt: '2026-08-08T10:00:00'
      });

      expect(state.currentVersion()).toBe(2);
    });

    it('inserts after the selected page', () => {
      loadPages(4);
      organiser.toggle(idAt(1), click);
      organiser.insertFrom(8);

      httpMock.expectOne('/api/documents/8/pages')
        .flush({ success: true, pageCount: 1, pages: [{ page: 1 }] });

      // Selected page 2, so the block starts at what is currently page 3.
      expect(httpMock.expectOne('/api/documents/7/pages/insert').request.body.position).toBe(3);
    });

    it('appends when nothing is selected', () => {
      loadPages(3);
      organiser.insertFrom(8);

      httpMock.expectOne('/api/documents/8/pages')
        .flush({ success: true, pageCount: 1, pages: [{ page: 1 }] });

      expect(httpMock.expectOne('/api/documents/7/pages/insert').request.body.position)
        .toBeUndefined();
    });

    it('says so when the donor has no pages, without calling insert', () => {
      loadPages(2);
      organiser.insertFrom(8);

      httpMock.expectOne('/api/documents/8/pages')
        .flush({ success: true, pageCount: 0, pages: [] });

      httpMock.expectNone('/api/documents/7/pages/insert');
      expect(organiser.messageIsError()).toBe(true);
      expect(organiser.working()).toBe(false);
    });
  });

  describe('extracting', () => {
    it('sends the selected source pages in document order', () => {
      loadPages(4);
      organiser.toggle(idAt(2), click);
      organiser.toggle(idAt(0), ctrlClick);
      organiser.extractSelection();

      const req = httpMock.expectOne('/api/documents/7/pages/extract');
      expect(req.request.body.pages).toEqual([1, 3]);
      req.flush({ success: true, documentId: 12, name: 'Plan (pages 1, 3)',
                  pageCount: 2, fileSize: 2048 });

      expect(organiser.messageIsError()).toBe(false);
      expect(organiser.message()).toContain('Plan (pages 1, 3)');
    });

    it('sends a duplicated page once', () => {
      loadPages(2);
      organiser.toggle(idAt(0), click);
      organiser.duplicateSelection();
      organiser.selectAll();
      organiser.extractSelection();

      const req = httpMock.expectOne('/api/documents/7/pages/extract');
      expect(req.request.body.pages).toEqual([1, 2]);
      req.flush({ success: true, documentId: 12, name: 'x', pageCount: 2, fileSize: 1 });
    });
  });
});
