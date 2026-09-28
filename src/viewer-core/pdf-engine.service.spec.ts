import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { PdfEngineService } from './pdf-engine.service';

/**
 * Reading a PDF: its text, its size, and where a search term appears.
 *
 * <p>The parts under test here take a pdf.js document and ask it questions.
 * They never touch the library itself — they call `getPage`, `getTextContent`
 * and `getViewport` on whatever they are handed — so a fake document exercises
 * the real code. Rendering is left out deliberately: painting to a canvas in
 * jsdom tests jsdom.
 *
 * <p>Searching is where the behaviour actually lives, and it is the part a
 * user notices being wrong. A drawing's text comes back as a flat run of
 * fragments, so a term appearing three times has to be found three times, at
 * the right offsets, with enough of its surroundings to be recognisable in a
 * results list. The awkward case is a term that overlaps itself — "aa" in
 * "aaaa" — which a scan that advances by the term's length silently reports
 * as two matches instead of three.
 */
describe('reading a PDF', () => {
  let engine: PdfEngineService;

  /**
   * A stand-in for a pdf.js document.
   *
   * <p>Takes one string per page. The text-content shape mirrors the real
   * one — an `items` array of objects with a `str` — because the joining of
   * those fragments is itself part of what is being tested.
   */
  function documentOf(...pages: string[]) {
    return {
      numPages: pages.length,
      getPage: vi.fn(async (pageNumber: number) => ({
        getTextContent: async () => ({
          items: (pages[pageNumber - 1] ?? '').split(' ').map((str) => ({ str })),
        }),
        getViewport: ({ scale }: { scale: number }) => ({
          width: 612 * scale,
          height: 792 * scale,
          scale,
        }),
      })),
    };
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [PdfEngineService] });
    engine = TestBed.inject(PdfEngineService);
  });

  describe('taking the text off a page', () => {
    it('joins the fragments back into readable text', () => {
      // pdf.js hands back one item per positioned run, not per word, so a
      // sentence arrives in pieces.
      return expect(engine.getPageText(documentOf('Fire door FD30 to corridor'), 1))
        .resolves.toBe('Fire door FD30 to corridor');
    });

    it('reads the page asked for, not the first one', () => {
      return expect(engine.getPageText(documentOf('first', 'second', 'third'), 3))
        .resolves.toBe('third');
    });

    it('gives back nothing for a page with no text', () => {
      return expect(engine.getPageText(documentOf(''), 1)).resolves.toBe('');
    });
  });

  describe('searching a document', () => {
    it('finds a term on the page it is on', async () => {
      const found = await engine.searchDocument(
        documentOf('nothing here', 'fire door here'), 'fire');

      expect(found).toHaveLength(1);
      expect(found[0]?.pageIndex).toBe(2);
    });

    it('finds a term on every page it appears on', async () => {
      const found = await engine.searchDocument(
        documentOf('fire door', 'no match', 'fire exit'), 'fire');

      expect(found.map((each) => each.pageIndex)).toEqual([1, 3]);
    });

    it('finds every occurrence on one page, not just the first', async () => {
      // A results list showing one hit on a page that has four is worse than
      // showing none: somebody checks the one and moves on.
      const found = await engine.searchDocument(documentOf('door door door'), 'door');

      expect(found).toHaveLength(3);
    });

    it('finds a term that overlaps itself', async () => {
      // "aa" occurs three times in "aaaa". A scan that advances by the term's
      // length reports two, which is the reason this advances by one.
      const found = await engine.searchDocument(documentOf('aaaa'), 'aa');

      expect(found).toHaveLength(3);
    });

    it('ignores letter case', async () => {
      const found = await engine.searchDocument(documentOf('FIRE DOOR'), 'fire');

      expect(found).toHaveLength(1);
    });

    it('ignores the case of the term as well as the text', async () => {
      const found = await engine.searchDocument(documentOf('fire door'), 'FIRE');

      expect(found).toHaveLength(1);
    });

    it('says where on the page the match was', async () => {
      const found = await engine.searchDocument(documentOf('a b fire'), 'fire');

      expect(found[0]?.matchIndex).toBe(4);
    });

    it('carries enough surrounding text to recognise the match', async () => {
      // A results list of the bare search term, repeated, is unusable —
      // every row looks identical.
      const found = await engine.searchDocument(
        documentOf('the quick brown fox jumps over the lazy dog'), 'fox');

      expect(found[0]?.text).toContain('brown fox jumps');
    });

    it('does not run off the start of the page for a match near the beginning', async () => {
      const found = await engine.searchDocument(documentOf('fox jumps over'), 'fox');

      expect(found[0]?.text?.startsWith('fox')).toBe(true);
    });

    it('does not run off the end for a match near the end', async () => {
      const found = await engine.searchDocument(documentOf('over the lazy dog'), 'dog');

      expect(found[0]?.text?.endsWith('dog')).toBe(true);
    });

    it('finds nothing for an empty search rather than every position', async () => {
      // An empty needle matches at every index, which would return one result
      // per character in the document.
      expect(await engine.searchDocument(documentOf('anything at all'), '')).toEqual([]);
    });

    it('finds nothing for a search of only spaces', async () => {
      expect(await engine.searchDocument(documentOf('anything at all'), '   ')).toEqual([]);
    });

    it('finds nothing in a document that does not contain the term', async () => {
      expect(await engine.searchDocument(documentOf('fire door'), 'window')).toEqual([]);
    });

    it('searches every page of a long document', async () => {
      const pages = Array.from({ length: 12 }, (_, index) =>
        index === 11 ? 'fire' : 'nothing');

      const found = await engine.searchDocument(documentOf(...pages), 'fire');

      expect(found[0]?.pageIndex).toBe(12);
    });
  });

  describe('sizing a page without painting it', () => {
    it('reports the size at the zoom asked for', async () => {
      // This is what lets an off-screen page hold correct scroll height
      // without costing a canvas.
      const size = await engine.getPageSize(documentOf('x'), 1, 2);

      expect(size.width).toBe(1224);
      expect(size.height).toBe(1584);
    });

    it('defaults to unscaled', async () => {
      const size = await engine.getPageSize(documentOf('x'), 1);

      expect(size.width).toBe(612);
      expect(size.height).toBe(792);
    });

    it('hands back the viewport, which the caller needs to place the text layer', async () => {
      const size = await engine.getPageSize(documentOf('x'), 1, 1.5);

      expect(size.viewport.scale).toBe(1.5);
    });
  });

  describe('marking the matches in a rendered text layer', () => {
    function span(text: string): HTMLElement {
      const element = document.createElement('span');
      element.textContent = text;
      return element;
    }

    it('marks the element containing the term', () => {
      const elements = [span('fire door'), span('window')];

      engine.markMatches(elements, 'fire');

      expect(elements[0]?.classList.contains('cde-search-match')).toBe(true);
    });

    it('leaves the elements that do not contain it alone', () => {
      const elements = [span('fire door'), span('window')];

      engine.markMatches(elements, 'fire');

      expect(elements[1]?.classList.contains('cde-search-match')).toBe(false);
    });

    it('marks every element containing it, not just the first', () => {
      const elements = [span('fire door'), span('fire exit')];

      engine.markMatches(elements, 'fire');

      expect(elements.every((each) => each.classList.contains('cde-search-match'))).toBe(true);
    });

    it('ignores letter case', () => {
      const elements = [span('FIRE DOOR')];

      engine.markMatches(elements, 'fire');

      expect(elements[0]?.classList.contains('cde-search-match')).toBe(true);
    });

    it('marks nothing for an empty term', () => {
      // Otherwise clearing the search box highlights the entire page.
      const elements = [span('fire door')];

      engine.markMatches(elements, '');

      expect(elements[0]?.classList.contains('cde-search-match')).toBe(false);
    });

    it('marks nothing for a term of only spaces', () => {
      const elements = [span('fire door')];

      engine.markMatches(elements, '   ');

      expect(elements[0]?.classList.contains('cde-search-match')).toBe(false);
    });

    it('survives an element with no text at all', () => {
      const empty = document.createElement('span');

      expect(() => engine.markMatches([empty], 'fire')).not.toThrow();
    });

    it('does not mark the same element twice', () => {
      const elements = [span('fire door')];

      engine.markMatches(elements, 'fire');
      engine.markMatches(elements, 'door');

      expect(elements[0]?.className.split(' ')
        .filter((each) => each === 'cde-search-match')).toHaveLength(1);
    });
  });
});
