import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SkeletonComponent } from './skeleton.component';

/**
 * The placeholder shown while a section is still loading.
 *
 * <p>§1.4 asks for skeletons rather than spinners, and for no layout shift —
 * which is the whole point of a skeleton: it occupies the space the content
 * will occupy. So the cases here are about how many boxes are drawn and
 * whether the shape asked for is the shape rendered, not about class names.
 */
describe('the loading skeleton', () => {
  let fixture: ComponentFixture<SkeletonComponent>;

  function render(inputs: Partial<SkeletonComponent> = {}) {
    Object.assign(fixture.componentInstance, inputs);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  /** Every shimmering box currently drawn. */
  function placeholders(host: HTMLElement) {
    return host.querySelectorAll('.skeleton-bg');
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [SkeletonComponent] });
    fixture = TestBed.createComponent(SkeletonComponent);
  });

  describe('telling someone who cannot see it that something is loading', () => {
    it('announces itself as a status', () => {
      // Without this the skeleton is a pile of empty boxes: it reads as
      // nothing, so the page just sits blank with no explanation.
      const host = render();

      expect(host.getAttribute('role')).toBe('status');
    });

    it('carries a sentence for the announcement to contain', () => {
      // role="status" announces the region's *contents*. An empty live
      // region announces nothing, so the visually hidden text is what makes
      // the role do anything at all.
      const host = render();
      const announcement = host.querySelector('.sr-only');

      expect(announcement?.textContent?.trim()).toBe('Loading…');
    });

    it('keeps that sentence off the screen', () => {
      // `sr-only` and not `hidden`: display:none would remove it from the
      // accessibility tree too, which is the whole thing it exists for.
      const host = render();

      expect(host.querySelector('[hidden]')).toBeNull();
      expect(host.querySelector('.sr-only')).not.toBeNull();
    });
  });

  describe('drawing the shape the caller asked for', () => {
    it('draws a card grid by default', () => {
      const host = render();

      expect(host.querySelector('.grid')).not.toBeNull();
    });

    it('draws one card per requested count', () => {
      // Four boxes per card: the thumbnail band and three text lines.
      const host = render({ type: 'card', count: 3 });

      expect(placeholders(host)).toHaveLength(3 * 4);
    });

    it('draws one row per requested count in a list', () => {
      // An avatar circle and two text lines per row.
      const host = render({ type: 'list', count: 5 });

      expect(placeholders(host)).toHaveLength(5 * 3);
    });

    it('draws one bar per requested line of text', () => {
      const host = render({ type: 'text', lines: 4 });

      expect(placeholders(host)).toHaveLength(4);
    });

    it('draws a thumbnail and its caption for each page', () => {
      const host = render({ type: 'thumbnail', count: 2 });

      expect(placeholders(host)).toHaveLength(2 * 2);
    });

    it('draws a header row plus one row per record in a table', () => {
      // 1 header + 4 cells per row.
      const host = render({ type: 'table', count: 3 });

      expect(placeholders(host)).toHaveLength(1 + 3 * 4);
    });

    it('draws a single bar inline', () => {
      const host = render({ type: 'inline' });

      expect(placeholders(host)).toHaveLength(1);
    });

    it('draws only the shape asked for', () => {
      // Each shape is its own @if, so a stray condition would draw two at
      // once — a list inside a card grid, which nothing would otherwise
      // report.
      const host = render({ type: 'inline' });

      expect(host.querySelector('.grid')).toBeNull();
    });
  });

  describe('holding the space the content will take', () => {
    it('takes the caller’s width for an inline bar', () => {
      // A skeleton narrower than its content is a layout shift when the
      // content arrives, which is exactly what §1.4 forbids.
      const host = render({ type: 'inline', width: '40%' });
      const bar = host.querySelector<HTMLElement>('.skeleton-bg');

      expect(bar?.style.width).toBe('40%');
    });

    it('shortens the last line of a text block', () => {
      // Real paragraphs do not end flush, and a block of equal bars reads
      // as a table rather than as prose.
      const host = render({ type: 'text', lines: 3 });
      const bars = host.querySelectorAll<HTMLElement>('.skeleton-bg');

      expect(bars[0]?.style.width).toBe('100%');
      expect(bars[2]?.style.width).toBe('65%');
    });

    it('varies the row widths in a list rather than repeating one', () => {
      const host = render({ type: 'list', count: 4 });
      const firstBars = [...host.querySelectorAll<HTMLElement>('.skeleton-bg')]
        .filter((bar) => bar.style.width);

      expect(new Set(firstBars.map((bar) => bar.style.width)).size)
        .toBeGreaterThan(1);
    });

    it('cycles the widths rather than running off the end of the list', () => {
      // There are six widths. A seventh row must reuse the first, not read
      // undefined and render a bar with no width at all.
      const host = render({ type: 'list', count: 8 });
      const widths = [...host.querySelectorAll<HTMLElement>('.skeleton-bg')]
        .map((bar) => bar.style.width)
        .filter(Boolean);

      expect(widths).not.toContain('');
      expect(widths[6]).toBe(widths[0]);
    });
  });

  describe('counts that would otherwise draw nothing or forever', () => {
    it('draws nothing when asked for no items', () => {
      const host = render({ type: 'card', count: 0 });

      expect(placeholders(host)).toHaveLength(0);
    });

    it('draws nothing when asked for no lines', () => {
      const host = render({ type: 'text', lines: 0 });

      expect(placeholders(host)).toHaveLength(0);
    });
  });
});
