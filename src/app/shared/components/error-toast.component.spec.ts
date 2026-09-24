import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ErrorToastComponent } from './error-toast.component';
import { GlobalErrorHandler } from '../../core/handlers/global-error.handler';
import { RemoteLoggingService } from '../../core/services/remote-logging.service';
import { definitely } from '../../../testing/definitely';

/**
 * What a reader is told when something fails, and whether they are told at
 * all.
 *
 * <p>Queries go through roles and labels rather than the class names the
 * template happens to use (§14), so restyling the toast does not rewrite
 * this file and a change to what it *says* does.
 */
describe('the error toast', () => {
  let handler: GlobalErrorHandler;
  let logged: unknown[];

  function render() {
    const fixture = TestBed.createComponent(ErrorToastComponent);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    logged = [];
    TestBed.configureTestingModule({
      imports: [ErrorToastComponent],
      providers: [
        GlobalErrorHandler,
        { provide: RemoteLoggingService, useValue: { log: (e: unknown) => logged.push(e) } },
      ],
    });
    handler = TestBed.inject(GlobalErrorHandler);
  });

  describe('announcing a failure to someone who cannot see it', () => {
    it('keeps a live region on the page before anything has failed', () => {
      // The region has to exist at first render. A live region created in
      // the same change as its first message is not announced by most
      // screen readers, so building it on demand means the failure is
      // shown and never spoken.
      const region = render().nativeElement.querySelector('[aria-live]');

      expect(region).not.toBeNull();
      expect(definitely(region).getAttribute('aria-live')).toBe('assertive');
    });

    it('announces each new failure instead of re-reading the earlier ones', () => {
      const region = render().nativeElement.querySelector('[aria-live]');

      expect(definitely(region).getAttribute('aria-atomic')).toBe('false');
    });

    it('does not also claim the alert role, which would contradict that', () => {
      // role="alert" carries an implicit aria-atomic="true". Setting both
      // leaves the announcement up to which one the screen reader honours.
      const region = render().nativeElement.querySelector('[aria-live]');

      expect(definitely(region).getAttribute('role')).toBeNull();
    });

    it('hides the severity emoji from the announcement', () => {
      handler.handleError(new Error('boom'));
      const fixture = render();
      const icon = fixture.nativeElement.querySelector('[aria-hidden="true"]');

      expect(icon).not.toBeNull();
      expect(definitely(icon).textContent?.trim()).not.toBe('');
    });
  });

  describe('what it puts on screen', () => {
    it('shows the sentence the handler wrote', () => {
      handler.handleError(
        new HttpErrorResponse({ status: 404, statusText: 'Not Found' })
      );
      const text = render().nativeElement.textContent ?? '';

      expect(text).toContain('could not be found');
    });

    it('shows nothing at all until something fails', () => {
      const text = render().nativeElement.textContent ?? '';

      expect(text.trim()).toBe('');
    });

    it('stops showing an error once it is dismissed', () => {
      handler.handleError(
        new HttpErrorResponse({ status: 404, statusText: 'Not Found' })
      );
      const fixture = render();
      const dismiss = fixture.nativeElement.querySelector('button[aria-label]');

      definitely(dismiss).click();
      fixture.detectChanges();

      expect((fixture.nativeElement.textContent ?? '').trim()).toBe('');
    });

    it('offers a way back only when the application itself went stale', () => {
      handler.handleError(new Error('Loading chunk 7 failed'));
      const withOffer = render().nativeElement.textContent ?? '';

      expect(withOffer).toContain('Refresh');
    });

    it('does not offer a refresh for an ordinary fault', () => {
      // Refreshing does not fix a TypeError, and offering it sends the
      // reader down a path that cannot work.
      handler.handleError(new TypeError('x is undefined'));
      const text = render().nativeElement.textContent ?? '';

      expect(text).not.toContain('Refresh');
    });

    it('never puts the exception text on screen', () => {
      handler.handleError(
        new TypeError("Cannot read properties of undefined (reading 'pageNumber')")
      );
      const text = render().nativeElement.textContent ?? '';

      expect(text).not.toContain('pageNumber');
    });
  });

  describe('the controls a reader has to be able to hit', () => {
    it('gives the dismiss button a target of at least 24 CSS px', () => {
      // SC 2.5.8. The bare ✕ glyph this replaced was around half that, and
      // dismissing is the only thing a reader can do to the toast.
      handler.handleError(new Error('boom'));
      const dismiss = render().nativeElement.querySelector('button[aria-label]');
      const classes = definitely(dismiss).className;

      expect(classes).toContain('min-w-6');
      expect(classes).toContain('min-h-6');
    });

    it('labels the dismiss button, whose only content is a glyph', () => {
      handler.handleError(new Error('boom'));
      const dismiss = render().nativeElement.querySelector('button[aria-label]');

      expect(definitely(dismiss).getAttribute('aria-label')).toBeTruthy();
    });
  });

  describe('severity is not carried by colour alone', () => {
    it('gives a permission failure a different glyph from a server fault', () => {
      const toast = TestBed.createComponent(ErrorToastComponent).componentInstance;

      expect(toast.toastIcon('http', 403)).not.toBe(toast.toastIcon('http', 500));
    });

    it('distinguishes a stale application from a request failure', () => {
      const toast = TestBed.createComponent(ErrorToastComponent).componentInstance;

      expect(toast.toastIcon('chunk')).not.toBe(toast.toastIcon('http'));
    });

    it('still varies the colour, as the sighted second cue', () => {
      const toast = TestBed.createComponent(ErrorToastComponent).componentInstance;

      expect(toast.toastClass('http', 500)).not.toBe(toast.toastClass('http', 404));
      expect(toast.toastClass('http', 401)).not.toBe(toast.toastClass('runtime'));
    });
  });
});
