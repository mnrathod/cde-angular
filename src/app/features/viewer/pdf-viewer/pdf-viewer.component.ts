import {
  Component, inject, OnInit, OnDestroy, AfterViewInit, signal, computed, effect,
  untracked, ElementRef, ViewChild, ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ViewerStateService } from '../../../core/services/viewer/viewer-state.service';
import { PdfEngineService } from '../../../core/services/viewer/pdf-engine.service';
import { AnnotationService } from '../../../core/services/viewer/annotation.service';
import { PdfPageComponent } from './pdf-page.component';

/**
 * How many pages either side of the visible range stay painted. One screen
 * of lookahead keeps scrolling smooth without holding the whole document
 * in GPU memory.
 */
const RENDER_BUFFER_PAGES = 2;

@Component({
  selector: 'app-pdf-viewer',
  standalone: true,
  imports: [CommonModule, PdfPageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div #scrollContainer
      class="flex-1 overflow-y-auto flex flex-col items-center gap-3 p-4"
      style="background:#525659"
      (scroll)="onScroll($event)">

      @for (page of pages(); track page) {
        <app-pdf-page
          [pdfDoc]="state.pdfDoc()"
          [pageNumber]="page"
          [zoom]="state.zoom()"
          [searchQuery]="state.searchQuery()"
          [active]="activePages().has(page)"
          [id]="'pdf-page-' + page"
          class="flex-shrink-0">
        </app-pdf-page>
      }
    </div>
  `
})
export class PdfViewerComponent implements OnInit, AfterViewInit, OnDestroy {
  state   = inject(ViewerStateService);
  engine  = inject(PdfEngineService);
  annService = inject(AnnotationService);

  @ViewChild('scrollContainer') scrollContainer!: ElementRef<HTMLElement>;

  pages = computed(() => {
    const total = this.state.totalPages();
    return Array.from({ length: total }, (_, i) => i + 1);
  });

  /** Pages currently within the render window. */
  readonly activePages = signal<Set<number>>(new Set([1, 2, 3]));

  private observer?: IntersectionObserver;
  private visible = new Set<number>();
  /**
   * Last page currentPage was set to *by scrolling*. The scroll->currentPage
   * and currentPage->scroll directions have to be told apart, and a simple
   * "am I mid-update" boolean cannot do it: it would be set and cleared
   * synchronously inside onScroll, while the effect only runs afterwards,
   * so by then the flag always reads false.
   */
  private lastScrollPage = 1;

  constructor() {
    // Header ‹ › navigation only moves currentPage; without this the view
    // never scrolled, so with windowed rendering the target page would not
    // even be painted.
    effect(() => {
      const page = this.state.currentPage();
      untracked(() => {
        if (page === this.lastScrollPage) return;   // scrolling drove this
        this.scrollToPage(page);
      });
    });

    // @for builds the page hosts only once the document reports its page
    // count, which happens after ngAfterViewInit — re-observe when it does.
    effect(() => {
      this.pages();
      untracked(() => queueMicrotask(() => this.observePages()));
    });
  }

  ngOnInit() {
    // Generate thumbnails in background after document loads
    const pdfDoc = this.state.pdfDoc();
    if (pdfDoc) {
      this.engine.generateThumbnails(pdfDoc).then(thumbs => {
        this.state.thumbnails.set(thumbs);
      });
    }
  }

  ngAfterViewInit() {
    // rootMargin gives the observer a screen of lookahead in both
    // directions so pages are painted slightly before they scroll in.
    this.observer = new IntersectionObserver(
      entries => this.onIntersect(entries),
      { root: this.scrollContainer.nativeElement, rootMargin: '100% 0px', threshold: 0 }
    );
    this.observePages();
  }

  ngOnDestroy() { this.observer?.disconnect(); }

  private observePages() {
    const root = this.scrollContainer?.nativeElement;
    if (!root || !this.observer) return;
    for (const el of Array.from(root.querySelectorAll('app-pdf-page'))) {
      this.observer.observe(el);
    }
  }

  private onIntersect(entries: IntersectionObserverEntry[]) {
    for (const entry of entries) {
      const page = Number(entry.target.id.replace('pdf-page-', ''));
      if (!page) continue;
      if (entry.isIntersecting) this.visible.add(page);
      else                      this.visible.delete(page);
    }
    this.updateActivePages();
  }

  // untracked throughout: this runs from inside an effect, and without it
  // the effect would take a dependency on the very signal it writes.
  private updateActivePages() {
    untracked(() => {
      const total = this.state.totalPages();
      const next  = new Set<number>();
      const add   = (p: number) => { if (p >= 1 && p <= total) next.add(p); };

      for (const page of this.visible) {
        for (let d = -RENDER_BUFFER_PAGES; d <= RENDER_BUFFER_PAGES; d++) add(page + d);
      }
      // Always keep the current page live, even if nothing is intersecting
      // yet (first paint, or a jump triggered from the sidebar).
      add(this.state.currentPage());

      const prev = this.activePages();
      if (prev.size === next.size && [...next].every(p => prev.has(p))) return;
      this.activePages.set(next);
    });
  }

  onScroll(e: Event) {
    // Update currentPage based on scroll position
    const container = e.target as HTMLElement;
    for (let p = 1; p <= this.state.totalPages(); p++) {
      const pageEl = document.getElementById('pdf-page-' + p);
      if (!pageEl) continue;
      const rect = pageEl.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      if (rect.top >= containerRect.top - 100) {
        this.lastScrollPage = p;
        this.state.currentPage.set(p);
        break;
      }
    }
  }

  scrollToPage(pageNum: number) {
    // Paint the destination before scrolling, so a jump into an unrendered
    // part of the document doesn't land on a placeholder.
    this.updateActivePages();
    const el = document.getElementById('pdf-page-' + pageNum);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
