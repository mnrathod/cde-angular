import {
  Component, inject, OnInit, OnDestroy, signal,
  ViewChildren, QueryList, ChangeDetectionStrategy
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { ViewerStateService } from '../../core/services/viewer/viewer-state.service';
import { PdfEngineService } from '../../core/services/viewer/pdf-engine.service';
import { AnnotationService } from '../../core/services/viewer/annotation.service';
import { ViewerService } from '../../core/services/viewer.service';
import { DocumentService } from '../../core/services/document.service';

import { MarkupToolbarComponent } from './toolbar/markup-toolbar.component';
import { ViewerSidebarComponent } from './sidebar/viewer-sidebar.component';
import { PdfViewerComponent } from './pdf-viewer/pdf-viewer.component';
import { CadViewerComponent } from './cad-viewer/cad-viewer.component';
import { PdfPageComponent } from './pdf-viewer/pdf-page.component';
import { ViewerData } from '../../core/models';

@Component({
  selector: 'app-viewer-shell',
  standalone: true,
  // Provide ViewerStateService at THIS component level — scoped, not singleton
  providers: [ViewerStateService],
  imports: [
    CommonModule,
    MarkupToolbarComponent,
    ViewerSidebarComponent,
    PdfViewerComponent,
    CadViewerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 flex flex-col" style="z-index:500">

      <!-- ── Top bar ────────────────────────────────────────────── -->
      <div class="flex items-center h-11 px-3 gap-2 flex-shrink-0 text-white"
           style="background:var(--nav);box-shadow:0 2px 4px rgba(0,0,0,.15)">
        <button (click)="goBack()"
          class="text-xs px-3 py-1 rounded border border-white/30 bg-white/10 hover:bg-white/20 transition-colors">
          ← Back
        </button>

        <div class="flex items-center gap-2 flex-1 min-w-0">
          <span class="font-semibold text-sm truncate">{{ state.viewerData()?.name || 'Loading...' }}</span>
          @if (state.viewerData()?.revision) {
            <span class="text-xs px-2 py-0.5 rounded bg-white/20">Rev {{ state.viewerData()?.revision }}</span>
          }
          @if (state.viewerData()?.drawingNumber) {
            <span class="text-xs text-white/70">{{ state.viewerData()?.drawingNumber }}</span>
          }
        </div>

        <!-- Page navigation (PDF only) -->
        @if (state.totalPages() > 1) {
          <div class="flex items-center gap-1 text-xs">
            <button (click)="state.navigateTo(state.currentPage()-1)"
              [disabled]="state.currentPage() <= 1"
              class="px-2 py-1 rounded border border-white/30 bg-white/10 hover:bg-white/20 disabled:opacity-30">‹</button>
            <span class="w-20 text-center">{{ state.currentPage() }} / {{ state.totalPages() }}</span>
            <button (click)="state.navigateTo(state.currentPage()+1)"
              [disabled]="state.currentPage() >= state.totalPages()"
              class="px-2 py-1 rounded border border-white/30 bg-white/10 hover:bg-white/20 disabled:opacity-30">›</button>
          </div>
        }

        <!-- Toggle sidebar -->
        <button (click)="state.sidebarOpen.update(v => !v)"
          class="text-xs px-2 py-1 rounded border border-white/30 bg-white/10 hover:bg-white/20">
          ⊞
        </button>
      </div>

      <!-- ── Loading / Error ─────────────────────────────────────── -->
      @if (state.loading()) {
        <div class="flex-1 flex flex-col items-center justify-center bg-gray-800 text-white/60">
          <div class="w-8 h-8 border-2 border-white/20 border-t-white/70 rounded-full animate-spin mb-3"></div>
          <div class="text-sm">{{ state.loadingMsg() }}</div>
        </div>
      }

      @if (!state.loading() && state.errorMsg()) {
        <div class="flex-1 flex items-center justify-center" style="background:#0a0c14">
          <div class="max-w-md p-6 bg-red-900/30 rounded-lg border border-red-500/30 text-red-300 text-sm">
            ⚠️ {{ state.errorMsg() }}
          </div>
        </div>
      }

      <!-- ── Main viewer area ───────────────────────────────────── -->
      @if (!state.loading() && !state.errorMsg()) {

        <!-- Markup toolbar -->
        <app-markup-toolbar
          (saveRequested)="saveMarkup()"
          (printRequested)="printDocument()">
        </app-markup-toolbar>

        <div class="flex flex-1 overflow-hidden min-h-0">

          <!-- Content area -->
          <div class="flex-1 overflow-hidden flex flex-col min-w-0">

            <!-- PDF viewer -->
            @if (isPdf()) {
              <app-pdf-viewer class="flex-1 overflow-hidden flex flex-col"></app-pdf-viewer>
            }

            <!-- CAD viewer (DXF/DWG) with layer toggle -->
            @if (isSvg()) {
              <app-cad-viewer
                class="flex-1 flex overflow-hidden min-h-0"
                [svgContent]="state.viewerData()?.content || ''"
                [dxfVersion]="state.viewerData()?.dwgVersion || ''"
                [entityCount]="entityCount">
              </app-cad-viewer>
            }

            <!-- Image viewer -->
            @if (isImage()) {
              <div class="flex-1 overflow-auto flex items-center justify-center p-4" style="background:#0a0c14">
                <img [src]="imageUrl" class="max-w-full max-h-full shadow-lg" />
              </div>
            }

            <!-- Unsupported file type -->
            @if (isUnsupported()) {
              <div class="flex-1 flex items-center justify-center text-gray-400">
                <div class="text-center">
                  <div class="text-5xl mb-3">📄</div>
                  <div>Preview not available for this file type</div>
                  <div class="text-sm mt-1 text-gray-500">{{ state.viewerData()?.fileName }}</div>
                </div>
              </div>
            }
          </div>

          <!-- Sidebar -->
          @if (state.sidebarOpen()) {
            <app-viewer-sidebar
              (pageSelected)="onPageSelected($event)">
            </app-viewer-sidebar>
          }
        </div>
      }
    </div>
  `
})
export class ViewerShellComponent implements OnInit, OnDestroy {
  state      = inject(ViewerStateService);
  pdfEngine  = inject(PdfEngineService);
  annService = inject(AnnotationService);
  viewerSvc  = inject(ViewerService);
  docService = inject(DocumentService);
  http       = inject(HttpClient);
  private route  = inject(ActivatedRoute);
  private router = inject(Router);

  imageUrl = '';
  entityCount = 0;

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id) { this.router.navigate(['/']); return; }
    this.state.documentId.set(id);
    this.loadDocument(id);
    this.loadAnnotations(id);
  }

  ngOnDestroy() { /* cleanup any subscriptions */ }

  private async loadDocument(id: number) {
    this.state.loading.set(true);
    this.state.loadingMsg.set('Loading document...');

    this.http.get<any>(`/api/viewer/${id}`).subscribe({
      next: async (data: any) => {
        if (data.type === 'svg') {
          this.state.viewerData.set(data);
        } else if (data.type === 'pdf' || data.pdfUrl) {
          this.state.loadingMsg.set('Rendering PDF...');
          const url = data.pdfUrl || `/api/viewer/${id}/pdf`;
          // Fetch via HttpClient (authInterceptor attaches the JWT) rather than
          // handing pdf.js a URL to fetch itself — pdf.js's internal fetch is a
          // plain browser fetch() that bypasses Angular's interceptors entirely,
          // which the backend correctly rejects as unauthenticated (403).
          const bytes  = await firstValueFrom(this.http.get(url, { responseType: 'arraybuffer' }));
          const pdfDoc = await this.pdfEngine.openDocument(bytes);
          this.state.pdfDoc.set(pdfDoc);
          this.state.totalPages.set(pdfDoc.numPages);
          this.state.viewerData.set({ ...data, type: 'pdf' });
        } else {
          this.state.viewerData.set(data);
        }
        this.state.loading.set(false);
      },
      error: err => {
        this.state.errorMsg.set('Failed to load document: ' + err.message);
        this.state.loading.set(false);
      }
    });
  }

  private loadAnnotations(docId: number) {
    this.annService.loadAnnotations(docId).subscribe(anns => {
      this.state.setAnnotationsSaved(anns);
      // Restore shapes from saved annotations
      const shapes = this.annService.annotationsToShapes(anns);
      if (shapes.length > 0) {
        this.state.shapes.set(shapes);
        this.state.dirty.set(false);  // already saved
      }
    });
  }

  saveMarkup() {
    const shapes = this.state.shapes();
    const docId  = this.state.documentId();
    if (!shapes.length) return;

    this.annService.saveShapes(docId, shapes).subscribe(saved => {
      // Update shapes with saved IDs
      saved.forEach(ann => {
        try {
          const data = JSON.parse(ann.shapeData);
          if (data.id) {
            this.state.updateShape(data.id, { savedId: ann.id });
          }
        } catch { /* ignore */ }
      });
      this.state.setAnnotationsSaved(saved);
    });
  }

  async printDocument() {
    const pdfDoc = this.state.pdfDoc();
    if (!pdfDoc) { window.print(); return; }

    // Import markup engine dynamically to avoid circular dep
    const { MarkupEngineService } = await import('../../core/services/viewer/markup-engine.service');
    const markupEngine = new MarkupEngineService();

    await this.pdfEngine.printWithAnnotations(
      pdfDoc,
      (page) => markupEngine.shapesToSvgContent(
        this.state.shapes().filter(s => s.pageNumber === page),
        800, 1100
      )
    );
  }

  onPageSelected(page: number) {
    if (page === -1) {
      // Search requested
      this.runSearch();
      return;
    }
    // Scroll to page
    document.getElementById('pdf-page-' + page)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  private async runSearch() {
    const pdfDoc = this.state.pdfDoc();
    const query  = this.state.searchQuery();
    if (!pdfDoc || !query) return;
    const results = await this.pdfEngine.searchDocument(pdfDoc, query);
    this.state.searchResults.set(results);
    // Navigate to first result
    if (results.length > 0) {
      this.state.navigateTo(results[0].pageIndex);
    }
  }



  // ── View type helpers ────────────────────────────────────────
  isPdf()         { return this.state.pdfDoc() !== null; }
  isSvg()         { return this.state.viewerData()?.type === 'svg'; }
  isImage()       { return this.state.viewerData()?.type === 'image'; }
  isUnsupported() {
    const t = this.state.viewerData()?.type;
    return t && !['pdf','svg','image'].includes(t);
  }

  goBack() { this.router.navigate(['/']); }
}
