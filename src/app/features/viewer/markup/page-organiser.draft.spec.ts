/**
 * Editing the draft, and what the organiser then says is pending.
 *
 * <p>Nothing here reaches the server. The draft is a working copy, so every
 * rotate, delete, reorder and insert has to survive in memory until Apply —
 * and has to be describable to the user before then, because a page layout
 * nobody can read back is a change nobody can check.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  OrganiserHarness, click, createOrganiser, ctrlClick, dropBetween,
} from './page-organiser.harness';
import { definitely } from '../../../../testing/definitely';

describe('the page organiser draft', () => {
  let harness: OrganiserHarness;

  beforeEach(() => { harness = createOrganiser(); });
  afterEach(() => harness.httpMock.verify());

  describe('editing the draft', () => {
    it('reorders on drop', () => {
      harness.loadPages(3);
      harness.organiser.onDrop(dropBetween(2, 0));

      expect(harness.sourceOrder()).toEqual([3, 1, 2]);
      expect(harness.organiser.pages.dirty()).toBe(true);
    });

    it('a drop that does not move anything leaves the draft clean', () => {
      harness.loadPages(3);
      harness.organiser.onDrop(dropBetween(1, 1));

      expect(harness.organiser.pages.dirty()).toBe(false);
    });

    it('moves a page one place earlier from the keyboard', () => {
      // The single-pointer alternative to the drag (SC 2.5.7). The card's
      // buttons call this; what they are wired to has to actually move it.
      harness.loadPages(3);
      harness.organiser.moveTo(2, 1);

      expect(harness.sourceOrder()).toEqual([1, 3, 2]);
    });

    it('moves a page one place later from the keyboard', () => {
      harness.loadPages(3);
      harness.organiser.moveTo(0, 1);

      expect(harness.sourceOrder()).toEqual([2, 1, 3]);
    });

    it('refuses a move off the front of the document', () => {
      // The card disables the button, but a guard here is what makes the
      // draft safe from a caller that does not. Array.splice(-1, 0, page)
      // silently inserts before the *last* page, which is a reordering
      // nobody asked for rather than a failure anyone would notice.
      harness.loadPages(3);
      harness.organiser.moveTo(0, -1);

      expect(harness.sourceOrder()).toEqual([1, 2, 3]);
      expect(harness.organiser.pages.dirty()).toBe(false);
    });

    it('refuses a move off the end of the document', () => {
      harness.loadPages(3);
      harness.organiser.moveTo(2, 3);

      expect(harness.sourceOrder()).toEqual([1, 2, 3]);
      expect(harness.organiser.pages.dirty()).toBe(false);
    });

    it('rotation accumulates and wraps at 360', () => {
      harness.loadPages(1);
      harness.organiser.pages.toggleSelectAll();
      harness.organiser.rotateSelection(90);
      harness.organiser.rotateSelection(90);
      expect(definitely(harness.organiser.pages.pages()[0]).rotate).toBe(180);

      harness.organiser.rotateSelection(180);
      expect(definitely(harness.organiser.pages.pages()[0]).rotate).toBe(0);
      expect(harness.organiser.pages.dirty()).toBe(false);
    });

    it('rotating anticlockwise stays positive', () => {
      harness.loadPages(1);
      harness.organiser.pages.toggleSelectAll();
      harness.organiser.rotateSelection(-90);

      expect(definitely(harness.organiser.pages.pages()[0]).rotate).toBe(270);
    });

    it('duplicates a page next to itself, with its own identity', () => {
      harness.loadPages(2);
      harness.organiser.toggle(harness.idAt(0), click);
      harness.organiser.duplicateSelection();

      expect(harness.sourceOrder()).toEqual([1, 1, 2]);
      // Distinct ids matter: two copies of page 1 must be separately
      // selectable and separately draggable.
      expect(new Set(harness.ids()).size).toBe(3);
    });

    it('deletes the selected pages', () => {
      harness.loadPages(3);
      harness.organiser.toggle(harness.idAt(1), click);
      harness.organiser.deleteSelection();

      expect(harness.sourceOrder()).toEqual([1, 3]);
    });

    it('refuses to delete every page', () => {
      harness.loadPages(2);
      harness.organiser.pages.toggleSelectAll();

      expect(harness.organiser.pages.canDeleteSelection()).toBe(false);
      harness.organiser.deleteSelection();
      expect(harness.sourceOrder()).toEqual([1, 2]);
    });

    it('discard returns the draft to the loaded layout', () => {
      harness.loadPages(3);
      harness.organiser.pages.toggleSelectAll();
      harness.organiser.rotateSelection(90);
      harness.organiser.onDrop(dropBetween(0, 2));
      expect(harness.organiser.pages.dirty()).toBe(true);

      harness.organiser.discard();

      expect(harness.sourceOrder()).toEqual([1, 2, 3]);
      expect(harness.organiser.pages.pages().every(page => page.rotate === 0)).toBe(true);
      expect(harness.organiser.pages.dirty()).toBe(false);
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
      harness.fixture.detectChanges();
      const host = harness.fixture.nativeElement as HTMLElement;
      return host.querySelector('.bg-amber-50')?.textContent ?? '';
    }

    it('says nothing has changed in count when pages were only rotated', () => {
      harness.loadPages(3);
      harness.organiser.pages.toggleSelectAll();
      harness.organiser.rotateSelection(90);

      expect(pendingBanner()).toContain('not yet applied');
      expect(pendingBanner()).not.toContain('was 3');
    });

    it('names both counts when pages were added or removed', () => {
      // The number a user checks before committing: "3 pages, was 2" is the
      // difference between a duplicate they meant and one they did not.
      harness.loadPages(2);
      harness.organiser.toggle(harness.idAt(0), click);
      harness.organiser.duplicateSelection();

      const banner = pendingBanner();
      expect(banner).toContain('3');
      expect(banner).toContain('2');
    });
  });
});
