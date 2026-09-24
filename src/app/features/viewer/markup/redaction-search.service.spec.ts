import { TestBed } from '@angular/core/testing';
import { of, throwError, Subject } from 'rxjs';
import { describe, it, expect, beforeEach } from 'vitest';

import { RedactionSearchService } from './redaction-search.service';
import { RedactionService, TextSearch } from '../../../core/services/redaction.service';
import { ViewerStateService } from '../../../../viewer-core/viewer-state.service';

/**
 * Finding what a redaction would destroy, and then destroying it.
 *
 * <p>Redaction is the one operation in the viewer whose result cannot be
 * recovered from inside the file. That makes the preview the load-bearing
 * part: the rule that nothing is redacted without a previewed, non-empty
 * result is the difference between removing four phone numbers and removing
 * whatever the last search happened to leave behind.
 */
describe('previewing and applying a redaction', () => {
  let redactionSearch: RedactionSearchService;
  let service: {
    findText: (id: number, search: TextSearch) => unknown;
    redactMatching: (id: number, search: TextSearch) => unknown;
  };
  let state: ViewerStateService;
  let redactedWith: Array<{ id: number; search: TextSearch }>;

  const search = { query: 'confidential' } as unknown as TextSearch;

  function match(page: number) {
    return { page, text: 'confidential', rect: [0, 0, 10, 10] };
  }

  function failing(status: number, body?: Record<string, unknown>) {
    return () => throwError(() => ({ status, error: body }));
  }

  beforeEach(() => {
    redactedWith = [];
    service = {
      findText: () => of({ success: true, matchCount: 2, matches: [match(1), match(2)] }),
      redactMatching: (id, requested) => {
        redactedWith.push({ id, search: requested });
        return of({ version: 3, summary: 'Redacted 2 matches' });
      },
    };

    TestBed.configureTestingModule({
      providers: [
        RedactionSearchService,
        { provide: RedactionService, useValue: service },
        ViewerStateService,
      ],
    });
    redactionSearch = TestBed.inject(RedactionSearchService);
    state = TestBed.inject(ViewerStateService);
    state.documentId.set(42);
  });

  describe('previewing what would be removed', () => {
    it('shows every match found', () => {
      redactionSearch.preview(search);

      expect(redactionSearch.matches()).toHaveLength(2);
    });

    it('searches the document currently open', () => {
      let searchedId = -1;
      service.findText = (id) => {
        searchedId = id;
        return of({ success: true, matchCount: 0, matches: [] });
      };

      redactionSearch.preview(search);

      expect(searchedId).toBe(42);
    });

    it('reports being busy while the search runs', () => {
      service.findText = () => new Subject<unknown>();

      redactionSearch.preview(search);

      expect(redactionSearch.searching()).toBe(true);
      expect(redactionSearch.busy()).toBe(true);
    });

    it('stops being busy once the answer arrives', () => {
      redactionSearch.preview(search);

      expect(redactionSearch.busy()).toBe(false);
    });

    it('says plainly when there is nothing to redact', () => {
      service.findText = () => of({ success: true, matchCount: 0, matches: [] });

      redactionSearch.preview(search);

      expect(redactionSearch.message()).toContain('No matches');
      expect(redactionSearch.messageIsError()).toBe(false);
    });

    it('says what to do when the pages had no text to search', () => {
      // The distinction that saves a support ticket: a scanned drawing
      // matches nothing because it has no text layer, not because the term
      // is absent.
      service.findText = () =>
        of({ success: true, matchCount: 0, matches: [], pagesWithoutText: 3 });

      redactionSearch.preview(search);

      expect(redactionSearch.message()).toContain('OCR');
    });

    it('stays quiet when it did find something', () => {
      redactionSearch.preview(search);

      expect(redactionSearch.message()).toBe('');
    });

    it('copes with a success that carried no matches array', () => {
      service.findText = () => of({ success: true, matchCount: 0 });

      redactionSearch.preview(search);

      expect(redactionSearch.matches()).toEqual([]);
    });

    it('does not put the server’s diagnostic on screen', () => {
      // English prose from the service layer, neither translated nor
      // anything a reader can act on (§1.4).
      service.findText = () =>
        of({ success: false, error: 'pdftotext exited with status 2' });

      redactionSearch.preview(search);

      expect(redactionSearch.message()).not.toContain('pdftotext');
      expect(redactionSearch.message()).toContain('could not be searched');
      expect(redactionSearch.messageIsError()).toBe(true);
    });

    it('names the conversion service when it is unreachable', () => {
      service.findText = failing(503);

      redactionSearch.preview(search);

      expect(redactionSearch.message()).toContain('not running');
    });

    it('prefers the server’s explanation to its own', () => {
      service.findText = failing(422, { detail: 'This document is encrypted.' });

      redactionSearch.preview(search);

      expect(redactionSearch.message()).toContain('encrypted');
    });

    it('stops searching even when the request failed', () => {
      service.findText = failing(500);

      redactionSearch.preview(search);

      expect(redactionSearch.busy()).toBe(false);
    });

    it('clears a previous message before searching again', () => {
      service.findText = () => of({ success: false });
      redactionSearch.preview(search);
      expect(redactionSearch.message()).not.toBe('');

      service.findText = () => new Subject<unknown>();
      redactionSearch.preview(search);

      expect(redactionSearch.message()).toBe('');
    });
  });

  describe('not redacting on a stale preview', () => {
    it('refuses to redact when nothing has been previewed', () => {
      // The guard that matters. Without it, pressing redact after a search
      // that found nothing sends the request anyway.
      redactionSearch.redactMatches(search);

      expect(redactedWith).toEqual([]);
    });

    it('will not offer to redact an empty result', () => {
      service.findText = () => of({ success: true, matchCount: 0, matches: [] });
      redactionSearch.preview(search);

      expect(redactionSearch.canRedactMatches()).toBe(false);
    });

    it('offers to redact once matches exist', () => {
      redactionSearch.preview(search);

      expect(redactionSearch.canRedactMatches()).toBe(true);
    });

    it('drops the preview when the search changes', () => {
      // Any edit to the search invalidates what is on screen. Leaving the
      // old matches would let somebody redact the previous search's hits
      // while reading the current search's terms.
      redactionSearch.preview(search);

      redactionSearch.forget();

      expect(redactionSearch.canRedactMatches()).toBe(false);
      expect(redactionSearch.message()).toBe('');
    });
  });

  describe('applying the redaction', () => {
    beforeEach(() => redactionSearch.preview(search));

    it('redacts the document currently open, for the search previewed', () => {
      redactionSearch.redactMatches(search);

      expect(redactedWith).toEqual([{ id: 42, search }]);
    });

    it('commits the new version the server returned', () => {
      redactionSearch.redactMatches(search);

      expect(state.currentVersion()).toBe(3);
    });

    it('asks the viewer to re-read the redacted bytes', () => {
      // Without this the viewer keeps showing the unredacted pages under a
      // version label saying they were redacted.
      const before = state.reloadToken();

      redactionSearch.redactMatches(search);

      expect(state.reloadToken()).toBeGreaterThan(before);
    });

    it('clears the preview once it has been applied', () => {
      // They no longer exist in the document. Leaving them listed invites
      // a second redaction of text that has already gone.
      redactionSearch.redactMatches(search);

      expect(redactionSearch.matches()).toEqual([]);
      expect(redactionSearch.canRedactMatches()).toBe(false);
    });

    it('confirms what was removed', () => {
      redactionSearch.redactMatches(search);

      expect(redactionSearch.message()).toContain('Redacted 2 matches');
      expect(redactionSearch.messageIsError()).toBe(false);
    });

    it('reports being busy while it runs', () => {
      service.redactMatching = () => new Subject<unknown>();

      redactionSearch.redactMatches(search);

      expect(redactionSearch.redacting()).toBe(true);
      expect(redactionSearch.busy()).toBe(true);
    });

    it('keeps the preview when the redaction failed', () => {
      // Nothing was destroyed, so the matches are still accurate and the
      // reader can try again without searching afresh.
      service.redactMatching = failing(500) as typeof service.redactMatching;

      redactionSearch.redactMatches(search);

      expect(redactionSearch.matches()).toHaveLength(2);
    });

    it('says the redaction failed, as a failure', () => {
      service.redactMatching = failing(500) as typeof service.redactMatching;

      redactionSearch.redactMatches(search);

      expect(redactionSearch.message()).toContain('Redaction failed');
      expect(redactionSearch.messageIsError()).toBe(true);
    });

    it('names the conversion service when it is unreachable', () => {
      service.redactMatching = failing(503) as typeof service.redactMatching;

      redactionSearch.redactMatches(search);

      expect(redactionSearch.message()).toContain('not running');
    });

    it('releases the busy flag after a failure', () => {
      service.redactMatching = failing(500) as typeof service.redactMatching;

      redactionSearch.redactMatches(search);

      expect(redactionSearch.busy()).toBe(false);
    });

    it('does not move the version when the redaction failed', () => {
      service.redactMatching = failing(500) as typeof service.redactMatching;

      redactionSearch.redactMatches(search);

      expect(state.currentVersion()).toBe(1);
    });
  });
});
