/**
 * The organiser holds a working copy of the page layout that is not written
 * until Apply, so the behaviour worth pinning is what that draft does to the
 * request it eventually sends.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  OrganiserHarness, click, createOrganiser, ctrlClick, dropBetween,
} from './page-organiser.harness';

describe('PageOrganiserComponent', () => {
  let harness: OrganiserHarness;

  beforeEach(() => { harness = createOrganiser(); });
  afterEach(() => harness.httpMock.verify());

  describe('loading', () => {
    it('builds a draft page per thumbnail', () => {
      harness.loadPages(3);
      expect(harness.sourceOrder()).toEqual([1, 2, 3]);
      expect(harness.organiser.pages.dirty()).toBe(false);
    });

    it('rebuilds when a committed version changes the page count', () => {
      harness.loadPages(3);
      harness.organiser.pages.toggleSelectAll();
      harness.state.applyVersionCommit(2, 'Deleted 1 page');
      harness.loadPages(2);

      expect(harness.sourceOrder()).toEqual([1, 2]);
      expect(harness.organiser.pages.dirty()).toBe(false);
      expect(harness.organiser.pages.hasSelection()).toBe(false);
    });

    it('makes every page card draggable', () => {
      // `cdkDrag` briefly sat in the card's own `host` block, where it only
      // added an attribute: a directive never matches the host element of
      // its own component, so nothing instantiated and the grip was inert.
      // The class is what CdkDrag itself puts on the element it runs on.
      harness.loadPages(2);
      const host = harness.fixture.nativeElement as HTMLElement;

      const cards = Array.from(host.querySelectorAll('app-page-card'));
      expect(cards).toHaveLength(2);
      expect(cards.every(card => card.classList.contains('cdk-drag'))).toBe(true);
    });
  });

  describe('selection', () => {
    it('a plain click selects one page and replaces the previous selection', () => {
      harness.loadPages(3);
      harness.organiser.toggle(harness.idAt(0), click);
      harness.organiser.toggle(harness.idAt(2), click);

      expect(harness.organiser.pages.selection().size).toBe(1);
      expect(harness.organiser.pages.isSelected(harness.idAt(2))).toBe(true);
    });

    it('ctrl-click adds to the selection', () => {
      harness.loadPages(3);
      harness.organiser.toggle(harness.idAt(0), click);
      harness.organiser.toggle(harness.idAt(2), ctrlClick);

      expect(harness.organiser.pages.selection().size).toBe(2);
    });

    it('clicking the only selected page clears it', () => {
      harness.loadPages(2);
      harness.organiser.toggle(harness.idAt(0), click);
      harness.organiser.toggle(harness.idAt(0), click);

      expect(harness.organiser.pages.hasSelection()).toBe(false);
    });

    it('select-all toggles both ways', () => {
      harness.loadPages(3);
      harness.organiser.pages.toggleSelectAll();
      expect(harness.organiser.pages.allSelected()).toBe(true);

      harness.organiser.pages.toggleSelectAll();
      expect(harness.organiser.pages.hasSelection()).toBe(false);
    });
  });
});
