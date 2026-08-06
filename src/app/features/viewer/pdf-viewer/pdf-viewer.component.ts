import {
  Component, inject, OnInit, OnDestroy, signal, computed,
  ViewChildren, QueryList, ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ViewerStateService } from '../../../core/services/viewer/viewer-state.service';
import { PdfEngineService } from '../../../core/services/viewer/pdf-engine.service';
import { AnnotationService } from '../../../core/services/viewer/annotation.service';
import { PdfPageComponent } from './pdf-page.component';

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
          [id]="'pdf-page-' + page"
          class="flex-shrink-0">
        </app-pdf-page>
      }
    </div>
  `
})
export class PdfViewerComponent implements OnInit {
  state   = inject(ViewerStateService);
  engine  = inject(PdfEngineService);
  annService = inject(AnnotationService);

  pages = computed(() => {
    const total = this.state.totalPages();
    return Array.from({ length: total }, (_, i) => i + 1);
  });

  ngOnInit() {
    // Generate thumbnails in background after document loads
    const pdfDoc = this.state.pdfDoc();
    if (pdfDoc) {
      this.engine.generateThumbnails(pdfDoc).then(thumbs => {
        this.state.thumbnails.set(thumbs);
      });
    }
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
        this.state.currentPage.set(p);
        break;
      }
    }
  }

  scrollToPage(pageNum: number) {
    const el = document.getElementById('pdf-page-' + pageNum);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
