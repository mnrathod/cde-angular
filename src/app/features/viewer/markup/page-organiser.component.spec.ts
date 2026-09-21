import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CdkDragDrop } from '@angular/cdk/drag-drop';

import { PageOrganiserComponent } from './page-organiser.component';
import { DraftPage } from './page-draft';
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
    return organiser.pages.pages().map(page => page.id);
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
    return organiser.pages.pages().map(page => page.sourcePage);
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
      expect(organiser.pages.dirty()).toBe(false);
    });

    it('rebuilds when a committed version changes the page count', () => {
      loadPages(3);
      organiser.pages.toggleSelectAll();
      state.applyVersionCommit(2, 'Deleted 1 page');
      loadPages(2);

      expect(sourceOrder()).toEqual([1, 2]);
      expect(organiser.pages.dirty()).toBe(false);
      expect(organiser.pages.hasSelection()).toBe(false);
    });

    it('makes every page card draggable', () => {
      // `cdkDrag` briefly sat in the card's own `host` block, where it only
      // added an attribute: a directive never matches the host element of
      // its own component, so nothing instantiated and the grip was inert.
      // The class is what CdkDrag itself puts on the element it runs on.
      loadPages(2);
      const host = fixture.nativeElement as HTMLElement;

      const cards = Array.from(host.querySelectorAll('app-page-card'));
      expect(cards).toHaveLength(2);
      expect(cards.every(card => card.classList.contains('cdk-drag'))).toBe(true);
    });
  });

  describe('selection', () => {
    it('a plain click selects one page and replaces the previous selection', () => {
      loadPages(3);
      organiser.toggle(idAt(0), click);
      organiser.toggle(idAt(2), click);

      expect(organiser.pages.selection().size).toBe(1);
      expect(organiser.pages.isSelected(idAt(2))).toBe(true);
    });

    it('ctrl-click adds to the selection', () => {
      loadPages(3);
      organiser.toggle(idAt(0), click);
      organiser.toggle(idAt(2), ctrlClick);

      expect(organiser.pages.selection().size).toBe(2);
    });

    it('clicking the only selected page clears it', () => {
      loadPages(2);
      organiser.toggle(idAt(0), click);
      organiser.toggle(idAt(0), click);

      expect(organiser.pages.hasSelection()).toBe(false);
    });

    it('select-all toggles both ways', () => {
      loadPages(3);
      organiser.pages.toggleSelectAll();
      expect(organiser.pages.allSelected()).toBe(true);

      organiser.pages.toggleSelectAll();
      expect(organiser.pages.hasSelection()).toBe(false);
    });
  });

  describe('editing the draft', () => {
    it('reorders on drop', () => {
      loadPages(3);
      organiser.onDrop(dropBetween(2, 0));

      expect(sourceOrder()).toEqual([3, 1, 2]);
      expect(organiser.pages.dirty()).toBe(true);
    });

    it('a drop that does not move anything leaves the draft clean', () => {
      loadPages(3);
      organiser.onDrop(dropBetween(1, 1));

      expect(organiser.pages.dirty()).toBe(false);
    });

    it('moves a page one place earlier from the keyboard', () => {
      // The single-pointer alternative to the drag (SC 2.5.7). The card's
      // buttons call this; what they are wired to has to actually move it.
      loadPages(3);
      organiser.moveTo(2, 1);

      expect(sourceOrder()).toEqual([1, 3, 2]);
    });

    it('moves a page one place later from the keyboard', () => {
      loadPages(3);
      organiser.moveTo(0, 1);

      expect(sourceOrder()).toEqual([2, 1, 3]);
    });

    it('refuses a move off the front of the document', () => {
      // The card disables the button, but a guard here is what makes the
      // draft safe from a caller that does not. Array.splice(-1, 0, page)
      // silently inserts before the *last* page, which is a reordering
      // nobody asked for rather than a failure anyone would notice.
      loadPages(3);
      organiser.moveTo(0, -1);

      expect(sourceOrder()).toEqual([1, 2, 3]);
      expect(organiser.pages.dirty()).toBe(false);
    });

    it('refuses a move off the end of the document', () => {
      loadPages(3);
      organiser.moveTo(2, 3);

      expect(sourceOrder()).toEqual([1, 2, 3]);
      expect(organiser.pages.dirty()).toBe(false);
    });

    it('rotation accumulates and wraps at 360', () => {
      loadPages(1);
      organiser.pages.toggleSelectAll();
      organiser.rotateSelection(90);
      organiser.rotateSelection(90);
      expect(definitely(organiser.pages.pages()[0]).rotate).toBe(180);

      organiser.rotateSelection(180);
      expect(definitely(organiser.pages.pages()[0]).rotate).toBe(0);
      expect(organiser.pages.dirty()).toBe(false);
    });

    it('rotating anticlockwise stays positive', () => {
      loadPages(1);
      organiser.pages.toggleSelectAll();
      organiser.rotateSelection(-90);

      expect(definitely(organiser.pages.pages()[0]).rotate).toBe(270);
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
      organiser.pages.toggleSelectAll();

      expect(organiser.pages.canDeleteSelection()).toBe(false);
      organiser.deleteSelection();
      expect(sourceOrder()).toEqual([1, 2]);
    });

    it('discard returns the draft to the loaded layout', () => {
      loadPages(3);
      organiser.pages.toggleSelectAll();
      organiser.rotateSelection(90);
      organiser.onDrop(dropBetween(0, 2));
      expect(organiser.pages.dirty()).toBe(true);

      organiser.discard();

      expect(sourceOrder()).toEqual([1, 2, 3]);
      expect(organiser.pages.pages().every(page => page.rotate === 0)).toBe(true);
      expect(organiser.pages.dirty()).toBe(false);
    });
  });

  /**
   * The two sentences that tell someone what is about to happen to their
   * document. Both are easy to get subtly wrong and both are read at exactly
   * the moment when being wrong is expensive.
   */
  describe('describing what is pending', () => {
    /**
     * The banner as it reaches the screen.
     *
     * <p>Read from the rendered output rather than from a method on the
     * component: the sentence moved to the component that draws the banner,
     * and a test that called the old method would have kept passing while
     * nothing reached the page (§14 — never by implementation detail).
     */
    function pendingBanner(): string {
      fixture.detectChanges();
      const host = fixture.nativeElement as HTMLElement;
      return host.querySelector('.bg-amber-50')?.textContent ?? '';
    }

    it('says nothing has changed in count when pages were only rotated', () => {
      loadPages(3);
      organiser.pages.toggleSelectAll();
      organiser.rotateSelection(90);

      expect(pendingBanner()).toContain('not yet applied');
      expect(pendingBanner()).not.toContain('was 3');
    });

    it('names both counts when pages were added or removed', () => {
      // The number a user checks before committing: "3 pages, was 2" is the
      // difference between a duplicate they meant and one they did not.
      loadPages(2);
      organiser.toggle(idAt(0), click);
      organiser.duplicateSelection();

      const banner = pendingBanner();
      expect(banner).toContain('3');
      expect(banner).toContain('2');
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

      expect(organiser.operations.messageIsError()).toBe(true);
      // The reference is appended now: §1.4 requires a correlation identifier
      // the user can quote to support, and this is the only place they see
      // one. The server's sentence still leads — it is what tells them what to
      // do, and the identifier is only useful once they have given up doing it
      // themselves.
      expect(organiser.operations.message()).toBe(
        'A document must keep at least one page. Reference 4f8a1c2e9b7d6a5f3e2d1c0b9a8f7e6d.');
      expect(sourceOrder()).toEqual([2, 3]);
      expect(organiser.operations.working()).toBe(false);
    });

    it('names the converter when it is the thing that is down', () => {
      loadPages(2);
      organiser.toggle(idAt(0), click);
      organiser.deleteSelection();
      organiser.apply();

      httpMock.expectOne('/api/documents/7/pages/arrange')
        .flush({}, { status: 503, statusText: 'Service Unavailable' });

      expect(organiser.operations.message()).toContain('conversion service');
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

      expect(organiser.operations.messageIsError()).toBe(false);
      expect(organiser.operations.message()).toContain('Plan (pages 1, 3)');
    });

    it('sends a duplicated page once', () => {
      loadPages(2);
      organiser.toggle(idAt(0), click);
      organiser.duplicateSelection();
      organiser.pages.toggleSelectAll();
      organiser.extractSelection();

      const req = httpMock.expectOne('/api/documents/7/pages/extract');
      expect(req.request.body.pages).toEqual([1, 2]);
      req.flush({ success: true, documentId: 12, name: 'x', pageCount: 2, fileSize: 1 });
    });
  });
});
