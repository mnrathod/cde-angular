import { TestBed, ComponentFixture } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, it, expect, beforeEach } from 'vitest';

import { UploadProgressComponent } from './upload-progress.component';
import { ChunkedUploadService, UploadProgress }
  from '../../core/services/chunked-upload.service';

/**
 * Telling somebody what happened to the file they just handed over.
 *
 * <p>This is the only place the product answers that question, which is why
 * the announcements matter as much as the pixels. §1A.4 asks for upload
 * progress and completion to reach assistive technology, and before these
 * cases existed none of it did: somebody using a screen reader handed over a
 * drawing and then had no way to find out whether it arrived.
 *
 * <p>Queried by role and accessible name throughout, per §14 — which is not
 * ceremony here. Asserting on the CSS classes would have passed happily
 * against the version with no live region, no progress bar semantics and a
 * dismiss button whose only name was a `✕` glyph.
 */
describe('showing what happened to an upload', () => {
  let fixture: ComponentFixture<UploadProgressComponent>;
  const uploads = signal<UploadProgress[]>([]);
  const removed: string[] = [];

  function upload(overrides: Partial<UploadProgress> = {}): UploadProgress {
    return {
      fileName: 'GA-Plan-Level-02.pdf',
      progress: 40,
      status: 'uploading',
      ...overrides,
    };
  }

  function showing(...items: UploadProgress[]) {
    uploads.set(items);
    fixture.detectChanges();
  }

  /** The text of the whole component, announcements included. */
  function text(): string {
    return fixture.nativeElement.textContent ?? '';
  }

  /**
   * The text of the visible list alone.
   *
   * <p>Separate from {@link text} because the announcement region carries the
   * same file names — asserting that a finished upload has left the list
   * against the whole component finds it in the announcement and fails,
   * which is what happened when this was written the lazy way.
   */
  function listedText(): string {
    return query('[role="region"]')?.textContent ?? '';
  }

  function query(selector: string): HTMLElement | null {
    return fixture.nativeElement.querySelector(selector);
  }

  function queryAll(selector: string): HTMLElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll(selector));
  }

  beforeEach(() => {
    uploads.set([]);
    removed.length = 0;
    TestBed.configureTestingModule({
      imports: [UploadProgressComponent],
      providers: [{
        provide: ChunkedUploadService,
        useValue: {
          uploads,
          removeUpload: (fileName: string) => removed.push(fileName),
        },
      }],
    });
    fixture = TestBed.createComponent(UploadProgressComponent);
    fixture.detectChanges();
  });

  describe('when nothing is being uploaded', () => {
    it('shows nothing at all', () => {
      // Not an empty panel: a persistent empty box in the corner is clutter
      // that §1.1 exists to prevent.
      expect(text().trim()).toBe('');
    });

    it('announces nothing', () => {
      expect(query('[aria-live]')).toBeNull();
    });
  });

  describe('an upload in progress', () => {
    beforeEach(() => showing(upload({ progress: 43 })));

    it('names the file', () => {
      expect(text()).toContain('GA-Plan-Level-02.pdf');
    });

    it('exposes the progress as a progress bar, not just a coloured div', () => {
      // Without the role the bar is decoration: its width is the only thing
      // carrying the information, and width is not readable.
      expect(query('[role="progressbar"]')).not.toBeNull();
    });

    it('carries the figure the bar is showing', () => {
      expect(query('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('43');
    });

    it('describes the figure in words, because a bare number says nothing', () => {
      const spoken = query('[role="progressbar"]')?.getAttribute('aria-valuetext') ?? '';

      expect(spoken).toContain('GA-Plan-Level-02.pdf');
      expect(spoken).toContain('43');
    });

    it('says what stage it is at', () => {
      expect(text()).toContain('Uploading');
    });

    it('offers no dismiss button while it is still running', () => {
      // Dismissing an upload in flight would hide it without stopping it.
      expect(queryAll('button')).toHaveLength(0);
    });

    it('does not announce anything yet', () => {
      // A progress bar changes many times a second; announcing each change
      // would talk over everything else on the page for the whole upload.
      expect(query('[aria-live]')?.textContent?.trim()).toBe('');
    });

    it('hides the decorative emoji from a screen reader', () => {
      const emoji = queryAll('[aria-hidden="true"]').map((each) => each.textContent?.trim());

      expect(emoji.some((each) => each === '📤')).toBe(true);
    });
  });

  describe('an upload that finished', () => {
    beforeEach(() => showing(upload({ status: 'done', progress: 90 })));

    it('announces that it arrived', () => {
      // The whole point: somebody who cannot see the panel still finds out.
      expect(query('[aria-live]')?.textContent).toContain('uploaded');
    });

    it('names the file in the announcement, because several may be running', () => {
      expect(query('[aria-live]')?.textContent).toContain('GA-Plan-Level-02.pdf');
    });

    it('announces politely rather than interrupting', () => {
      expect(query('[aria-live]')?.getAttribute('aria-live')).toBe('polite');
    });

    it('offers a way to dismiss it', () => {
      expect(queryAll('button')).toHaveLength(1);
    });

    it('gives the dismiss button a name that says what it dismisses', () => {
      // It was a bare glyph, which reads as its Unicode name or as nothing —
      // so the only control in this panel had no usable name.
      expect(queryAll('button')[0]?.getAttribute('aria-label'))
        .toContain('GA-Plan-Level-02.pdf');
    });

    it('dismisses the upload it names when pressed', () => {
      queryAll('button')[0]?.click();

      expect(removed).toEqual(['GA-Plan-Level-02.pdf']);
    });
  });

  describe('an upload that finished completely', () => {
    it('drops out of the list rather than sitting there at 100%', () => {
      // Finished and full is the one state worth removing on its own: the
      // panel is for work in flight.
      showing(upload({ status: 'done', progress: 100 }));

      expect(listedText()).not.toContain('GA-Plan-Level-02.pdf');
    });

    it('is still announced, because that is the outcome somebody waited for', () => {
      showing(upload({ status: 'done', progress: 100 }));

      expect(query('[aria-live]')?.textContent).toContain('uploaded');
    });
  });

  describe('an upload that failed', () => {
    beforeEach(() => showing(upload({ status: 'error', message: 'The file is too large.' })));

    it('shows the reason the server gave', () => {
      expect(text()).toContain('The file is too large.');
    });

    it('announces the failure', () => {
      expect(query('[aria-live]')?.textContent).toContain('could not be uploaded');
    });

    it('shows no progress bar, because there is no progress to report', () => {
      expect(query('[role="progressbar"]')).toBeNull();
    });

    it('can be dismissed', () => {
      queryAll('button')[0]?.click();

      expect(removed).toEqual(['GA-Plan-Level-02.pdf']);
    });

    it('says something when the server gave no reason', () => {
      // An empty red box is worse than a generic sentence.
      showing(upload({ status: 'error' }));

      expect(text()).toContain('Upload failed');
    });
  });

  describe('several uploads at once', () => {
    beforeEach(() => showing(
      upload({ fileName: 'one.pdf', progress: 20 }),
      upload({ fileName: 'two.pdf', status: 'error', message: 'Refused' }),
      upload({ fileName: 'three.pdf', status: 'done', progress: 60 }),
    ));

    it('lists every one of them', () => {
      expect(text()).toContain('one.pdf');
      expect(text()).toContain('two.pdf');
      expect(text()).toContain('three.pdf');
    });

    it('announces only the ones that settled', () => {
      const announced = query('[aria-live]')?.textContent ?? '';

      expect(announced).toContain('two.pdf');
      expect(announced).toContain('three.pdf');
      expect(announced).not.toContain('one.pdf');
    });

    it('gives each dismiss button its own name', () => {
      const names = queryAll('button').map((each) => each.getAttribute('aria-label'));

      expect(names).toHaveLength(2);
      expect(new Set(names).size).toBe(2);
    });

    it('dismisses only the one pressed', () => {
      const two = queryAll('button')
        .find((each) => each.getAttribute('aria-label')?.includes('two.pdf'));

      two?.click();

      expect(removed).toEqual(['two.pdf']);
    });
  });

  describe('the panel itself', () => {
    beforeEach(() => showing(upload()));

    it('is a named region, so it can be reached and skipped', () => {
      expect(query('[role="region"]')?.getAttribute('aria-label')).toBeTruthy();
    });

    it('gives the dismiss target room to be hit', () => {
      // SC 2.5.8's 24px floor. A 12px glyph is a target somebody with a
      // tremor cannot reliably press.
      showing(upload({ status: 'done', progress: 50 }));
      const dismiss = queryAll('button')[0];

      expect(dismiss?.className).toContain('min-w-6');
      expect(dismiss?.className).toContain('min-h-6');
    });
  });

  describe('naming a stage', () => {
    let component: UploadProgressComponent;

    beforeEach(() => {
      component = fixture.componentInstance;
    });

    it.each([
      ['pending', 'Waiting'],
      ['uploading', 'Uploading'],
      ['processing', 'Processing'],
      ['done', 'Complete'],
      ['error', 'Failed'],
    ])('describes %s as %s', (status, expected) => {
      expect(component.statusLabel(status)).toContain(expected);
    });

    it('falls back to the stage itself rather than showing a blank', () => {
      // A stage this component has not heard of should still say something.
      expect(component.statusLabel('quarantined')).toBe('quarantined');
    });

    it('prefers the message the service supplied over the generic stage', () => {
      showing(upload({ message: 'Uploading in 4 parts...' }));

      expect(text()).toContain('Uploading in 4 parts...');
    });
  });
});
