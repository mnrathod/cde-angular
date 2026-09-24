import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { GlobalErrorHandler } from './global-error.handler';
import { definitely } from '../../../testing/definitely';
import {
  notFoundMessage,
  serverErrorMessage,
  staleApplicationMessage,
  unexpectedFaultMessage,
} from './error-wording';

describe('GlobalErrorHandler', () => {
  let handler: GlobalErrorHandler;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [GlobalErrorHandler] });
    handler = TestBed.inject(GlobalErrorHandler);
  });

  it('should be created', () => {
    expect(handler).toBeTruthy();
  });

  it('errors() should be empty initially', () => {
    expect(handler.errors()).toEqual([]);
  });

  it('should classify runtime Error', () => {
    handler.handleError(new Error('Something broke'));
    const errors = handler.errors();
    expect(errors.length).toBe(1);
    expect(definitely(errors[0]).type).toBe('runtime');
    expect(definitely(errors[0]).dismissed).toBe(false);
  });

  it('tells a reader what to do, not what the exception said', () => {
    // This used to put err.message on screen. An exception message is
    // written for whoever will fix the fault: it is in English whatever the
    // reader's language, and it names internal shapes. The toast renders
    // this field, so it has to be a sentence a reader can act on (§1.4).
    handler.handleError(new TypeError("Cannot read properties of undefined (reading 'pageNumber')"));

    expect(definitely(handler.errors()[0]).message).toBe(unexpectedFaultMessage());
  });

  it('keeps the exception text for the remote log', () => {
    // Not rendered, but dropping it would cost the one field that makes a
    // report diagnosable.
    handler.handleError(new Error('Something broke'));

    expect(definitely(handler.errors()[0]).technical).toBe('Something broke');
  });

  it('should classify 401 HttpErrorResponse', () => {
    handler.handleError(new HttpErrorResponse({ status: 401, statusText: 'Unauthorized' }));
    const err = definitely(handler.errors()[0]);
    expect(err.type).toBe('http');
    expect(err.status).toBe(401);
    expect(err.message).toContain('session has expired');
  });

  it('should classify 404 HttpErrorResponse', () => {
    handler.handleError(new HttpErrorResponse({ status: 404, statusText: 'Not Found' }));
    expect(definitely(handler.errors()[0]).message).toBe(notFoundMessage());
  });

  it('should classify chunk load error', () => {
    handler.handleError(new Error('Loading chunk 5 failed'));
    expect(definitely(handler.errors()[0]).type).toBe('chunk');
    expect(definitely(handler.errors()[0]).message).toBe(staleApplicationMessage());
  });

  it('should classify unknown error', () => {
    handler.handleError('a string error');
    expect(definitely(handler.errors()[0]).type).toBe('unknown');
  });

  it('dismiss() should mark error as dismissed', () => {
    handler.handleError(new Error('test'));
    const id = definitely(handler.errors()[0]).id;
    handler.dismiss(id);
    expect(definitely(handler.errors()[0]).dismissed).toBe(true);
  });

  it('dismissAll() should dismiss all errors', () => {
    handler.handleError(new Error('e1'));
    handler.handleError(new Error('e2'));
    handler.dismissAll();
    expect(handler.errors().every(e => e.dismissed)).toBe(true);
  });

  it('should cap errors at 5', () => {
    for (let i = 0; i < 10; i++) {
      handler.handleError(new Error(`error ${i}`));
    }
    expect(handler.errors().length).toBeLessThanOrEqual(5);
  });

  it('should include timestamp on errors', () => {
    const before = new Date();
    handler.handleError(new Error('timed'));
    const after  = new Date();
    const ts     = definitely(handler.errors()[0]).timestamp;
    expect(ts.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(ts.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  describe('the reference a reader can quote to support (§1.4)', () => {
    const traceId = '4f8a1c2e9b7d6a5f3e2d1c0b9a8f7e6d';

    function failureCarrying(status: number, body: Record<string, unknown> = {}) {
      return new HttpErrorResponse({
        status,
        statusText: 'Error',
        error: { type: 'about:blank', status, traceId, ...body },
      });
    }

    it('quotes it on a server fault, where it matters most', () => {
      // A 500 reads no body for its wording, which is why the identifier
      // used to be dropped here — leaving the reader nothing to give
      // support for the one failure they cannot diagnose themselves.
      handler.handleError(failureCarrying(500));

      expect(definitely(handler.errors()[0]).message).toContain(traceId);
    });

    it('still says what happened before it says the reference', () => {
      handler.handleError(failureCarrying(500));
      const message = definitely(handler.errors()[0]).message;

      expect(message).toContain('went wrong at our end');
      expect(message.indexOf(traceId)).toBeGreaterThan(message.indexOf('wrong'));
    });

    it('quotes it alongside the sentence the server itself sent', () => {
      handler.handleError(
        failureCarrying(409, { detail: 'Someone else published revision P02.' })
      );
      const message = definitely(handler.errors()[0]).message;

      expect(message).toContain('revision P02');
      expect(message).toContain(traceId);
    });

    it('says nothing about a reference the server did not send', () => {
      // A reference support cannot look up is worse than none: the reader
      // reads out an identifier, and the conversation stops there.
      handler.handleError(
        new HttpErrorResponse({ status: 500, statusText: 'Error' })
      );
      const message = definitely(handler.errors()[0]).message;

      expect(message).toBe(serverErrorMessage());
    });

    it('ignores a reference that is not a string', () => {
      handler.handleError(
        new HttpErrorResponse({
          status: 500,
          statusText: 'Error',
          error: { traceId: { nested: 'object' } },
        })
      );

      expect(definitely(handler.errors()[0]).message).toBe(serverErrorMessage());
    });
  });
});
