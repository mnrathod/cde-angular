import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { GlobalErrorHandler } from './global-error.handler';
import { definitely } from '../../../testing/definitely';

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
    expect(definitely(errors[0]).message).toBe('Something broke');
    expect(definitely(errors[0]).dismissed).toBe(false);
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
    expect(definitely(handler.errors()[0]).message).toContain('not found');
  });

  it('should classify chunk load error', () => {
    handler.handleError(new Error('Loading chunk 5 failed'));
    expect(definitely(handler.errors()[0]).type).toBe('chunk');
    expect(definitely(handler.errors()[0]).message).toContain('refresh');
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
});
