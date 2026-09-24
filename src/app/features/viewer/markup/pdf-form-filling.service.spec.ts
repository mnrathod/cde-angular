import { TestBed } from '@angular/core/testing';
import { of, throwError, Subject } from 'rxjs';
import { describe, it, expect, beforeEach } from 'vitest';

import { PdfFormFillingService } from './pdf-form-filling.service';
import { PdfFormField, PdfFormService } from '../../../core/services/pdf-form.service';

/**
 * The two requests the form panel makes, and what a reader is told about
 * each.
 *
 * <p>Almost all of this service is its failure paths, so that is what the
 * cases below are: which sentence appears, and whether it is one somebody
 * can act on. The happy paths matter mostly for what they must *not* do —
 * run the callback when the server said no.
 */
describe('reading and filling a document’s form', () => {
  let filling: PdfFormFillingService;
  let formService: {
    getFields: (id: number) => unknown;
    fillForm: (id: number, values: unknown, flatten: boolean) => unknown;
  };
  let filledWith: Array<{ values: unknown; flatten: boolean }>;

  function field(name: string, kind: string): PdfFormField {
    return { name, kind } as PdfFormField;
  }

  function failing(status: number, body?: Record<string, unknown>) {
    return () => throwError(() => ({ status, error: body }));
  }

  beforeEach(() => {
    filledWith = [];
    formService = {
      getFields: () => of({ success: true, fields: [] }),
      fillForm: (_id, values, flatten) => {
        filledWith.push({ values, flatten });
        return of({ version: 2, summary: 'Filled 4 fields' });
      },
    };

    TestBed.configureTestingModule({
      providers: [
        PdfFormFillingService,
        { provide: PdfFormService, useValue: formService },
      ],
    });
    filling = TestBed.inject(PdfFormFillingService);
  });

  describe('reading the fields', () => {
    it('hands back the fields a reader can fill', () => {
      formService.getFields = () =>
        of({ success: true, fields: [field('name', 'text'), field('agree', 'checkbox')] });
      let received: PdfFormField[] = [];

      filling.readFields(1, (fields) => { received = fields; });

      expect(received.map((f) => f.name)).toEqual(['name', 'agree']);
    });

    it('leaves out push buttons, which have nothing to fill', () => {
      formService.getFields = () =>
        of({ success: true, fields: [field('name', 'text'), field('submit', 'button')] });
      let received: PdfFormField[] = [];

      filling.readFields(1, (fields) => { received = fields; });

      expect(received.map((f) => f.name)).toEqual(['name']);
    });

    it('copes with a success that carried no fields array at all', () => {
      formService.getFields = () => of({ success: true });
      let received: PdfFormField[] | null = null;

      filling.readFields(1, (fields) => { received = fields; });

      expect(received).toEqual([]);
    });

    it('stops showing the spinner once the answer arrives', () => {
      filling.readFields(1, () => {});

      expect(filling.loading()).toBe(false);
    });

    it('is loading until then', () => {
      const pending = new Subject<unknown>();
      formService.getFields = () => pending;

      filling.readFields(1, () => {});

      expect(filling.loading()).toBe(true);
    });

    it('does not run the callback when the server reports no form', () => {
      // The panel would otherwise render an empty form as though the
      // document simply had no fields, rather than saying it could not read
      // them.
      formService.getFields = () => of({ success: false, error: 'no AcroForm found' });
      let called = false;

      filling.readFields(1, () => { called = true; });

      expect(called).toBe(false);
    });

    it('does not put the server’s diagnostic on screen', () => {
      // "no AcroForm found" is an English sentence about the file's
      // internals. It is neither translated nor anything a reader can act
      // on (§1.4).
      formService.getFields = () => of({ success: false, error: 'no AcroForm found' });

      filling.readFields(1, () => {});

      expect(filling.error()).not.toContain('AcroForm');
      expect(filling.error()).toContain('could not be read');
    });

    it('says what to try next when the fields cannot be read', () => {
      formService.getFields = () => of({ success: false });

      filling.readFields(1, () => {});

      expect(filling.error()).toContain('re-uploading');
    });

    it('clears a previous failure before asking again', () => {
      formService.getFields = () => of({ success: false });
      filling.readFields(1, () => {});
      expect(filling.error()).not.toBe('');

      formService.getFields = () => of({ success: true, fields: [] });
      filling.readFields(1, () => {});

      expect(filling.error()).toBe('');
    });

    it('names the converter when it is the converter that is down', () => {
      // A 503 here is a deployment problem, not a problem with the
      // document — the only one of these a reader can actually report
      // usefully.
      formService.getFields = failing(503);

      filling.readFields(1, () => {});

      expect(filling.error()).toContain('converter');
    });

    it('prefers the server’s explanation over the generic one', () => {
      formService.getFields = failing(422, {
        detail: 'This document is encrypted.',
      });

      filling.readFields(1, () => {});

      expect(filling.error()).toContain('encrypted');
    });

    it('falls back to its own sentence when the server explained nothing', () => {
      formService.getFields = failing(500);

      filling.readFields(1, () => {});

      expect(filling.error()).toContain('Could not read form fields');
    });

    it('stops loading even when the request failed', () => {
      formService.getFields = failing(500);

      filling.readFields(1, () => {});

      expect(filling.loading()).toBe(false);
    });
  });

  describe('filling the form', () => {
    it('sends the values and the flatten choice through', () => {
      filling.fill(1, { name: 'Ada' }, true, () => {});

      expect(filledWith).toEqual([{ values: { name: 'Ada' }, flatten: true }]);
    });

    it('hands the committed version back to the caller', () => {
      let result: { version: number } | null = null;

      filling.fill(1, {}, false, (r) => { result = r as { version: number }; });

      expect(result).not.toBeNull();
      expect(result!.version).toBe(2);
    });

    it('confirms the save by naming the new version', () => {
      filling.fill(1, {}, false, () => {});

      expect(filling.message()).toContain('2');
      expect(filling.message()).toContain('Filled 4 fields');
      expect(filling.messageIsError()).toBe(false);
    });

    it('refuses a second submission while one is in flight', () => {
      // Without this, a double-click commits two versions of the same
      // form — and the second races the first.
      formService.fillForm = (_id, values, flatten) => {
        filledWith.push({ values, flatten });
        return new Subject<unknown>();
      };

      filling.fill(1, { a: '1' }, false, () => {});
      filling.fill(1, { a: '2' }, false, () => {});

      expect(filledWith).toHaveLength(1);
    });

    it('accepts another submission once the first finished', () => {
      filling.fill(1, {}, false, () => {});
      filling.fill(1, {}, false, () => {});

      expect(filledWith).toHaveLength(2);
    });

    it('does not run the callback when the save failed', () => {
      formService.fillForm = failing(500) as typeof formService.fillForm;
      let called = false;

      filling.fill(1, {}, false, () => { called = true; });

      expect(called).toBe(false);
    });

    it('marks a failure as a failure, not as a confirmation', () => {
      // The panel styles this message by the flag. Leaving it false shows
      // a red-path outcome in the colour of a successful save.
      formService.fillForm = failing(500) as typeof formService.fillForm;

      filling.fill(1, {}, false, () => {});

      expect(filling.messageIsError()).toBe(true);
      expect(filling.message()).toContain('Filling the form failed');
    });

    it('names the converter when it is unreachable', () => {
      formService.fillForm = failing(503) as typeof formService.fillForm;

      filling.fill(1, {}, false, () => {});

      expect(filling.message()).toContain('converter');
    });

    it('releases the in-flight flag after a failure', () => {
      // Otherwise one failed save locks the panel for the rest of the
      // session.
      formService.fillForm = failing(500) as typeof formService.fillForm;
      filling.fill(1, {}, false, () => {});

      expect(filling.submitting()).toBe(false);
    });

    it('clears the previous message before submitting again', () => {
      formService.fillForm = failing(500) as typeof formService.fillForm;
      filling.fill(1, {}, false, () => {});

      formService.fillForm = () => new Subject<unknown>();
      filling.fill(1, {}, false, () => {});

      expect(filling.message()).toBe('');
    });
  });
});
