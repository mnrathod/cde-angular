import {
  Component, inject, OnInit, OnDestroy, signal, effect,
  ViewChildren, QueryList, ChangeDetectionStrategy
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { ViewerStateService } from '../../../viewer-core/viewer-state.service';
import { PdfEngineService } from '../../../viewer-core/pdf-engine.service';
import { AnnotationService } from '../../core/services/viewer/annotation.service';
import { ViewerService } from '../../core/services/viewer.service';
import { DocumentService } from '../../core/services/document.service';
import { AuthService } from '../../core/services/auth.service';

import { MarkupToolbarComponent } from './toolbar/markup-toolbar.component';
import { ToolRailComponent } from './toolbar/tool-rail.component';
import { IconComponent } from '../../shared/components/icon.component';
import { ViewerSidebarComponent } from './sidebar/viewer-sidebar.component';
import { PdfViewerComponent } from './pdf-viewer/pdf-viewer.component';
import { CadViewerComponent } from './cad-viewer/cad-viewer.component';
import { PdfPageComponent } from './pdf-viewer/pdf-page.component';
import { ViewerData } from '../../core/models';
import { CollaborationService, CollaborationEvent } from '../../core/services/collaboration.service';
import { DrawingSearchService } from '../../../viewer-core/drawing-search.service';

@Component({
  selector: 'app-viewer-shell',
  standalone: true,
  // Scoped to this component, not singletons: leaving the document must tear
  // the socket down, not leave it announcing a presence that has gone.
  providers: [ViewerStateService, CollaborationService],
  imports: [
    CommonModule,
    MarkupToolbarComponent,
    ToolRailComponent,
    ViewerSidebarComponent,
    PdfViewerComponent,
    CadViewerComponent,
    IconComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 flex flex-col" style="z-index:500">

      <!-- ── Top bar ────────────────────────────────────────────── -->
      <div class="flex items-center h-11 px-3 gap-2 flex-shrink-0 text-white"
           style="background:var(--nav);box-shadow:0 2px 4px rgba(0,0,0,.15)">
        <button type="button" (click)="goBack()" title="Back to documents"
          class="h-7 px-2.5 inline-flex items-center gap-1.5 text-xs rounded-md
                 bg-white/10 hover:bg-white/20 transition-colors">
          <app-icon name="arrow-left" [size]="15" />
          <span>Back</span>
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

        <!-- Who else is viewing this document -->
        @if (collaboration.others().length) {
          <div class="flex items-center -space-x-1.5 mr-1"
               [title]="presenceTitle()">
            @for (participant of collaboration.others(); track participant.username) {
              <span class="w-6 h-6 rounded-full flex items-center justify-center
                           text-[10px] font-bold text-white border-2 border-white/70"
                    [style.background]="participant.colour">
                {{ initialsOf(participant.username) }}
              </span>
            }
          </div>
        }
        @if (collaboration.connected()) {
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1"
                title="Live — changes from others appear as they happen"></span>
        }

        <!-- Page navigation (PDF only) -->
        @if (state.totalPages() > 1) {
          <div class="flex items-center gap-1 text-xs">
            <button type="button" (click)="state.navigateTo(state.currentPage()-1)"
              [disabled]="state.currentPage() <= 1" title="Previous page" aria-label="Previous page"
              class="w-7 h-7 inline-flex items-center justify-center rounded-md
                     bg-white/10 hover:bg-white/20 disabled:opacity-30">
              <app-icon name="chevron-left" [size]="15" />
            </button>
            <span class="w-20 text-center tabular-nums">{{ state.currentPage() }} / {{ state.totalPages() }}</span>
            <button type="button" (click)="state.navigateTo(state.currentPage()+1)"
              [disabled]="state.currentPage() >= state.totalPages()" title="Next page" aria-label="Next page"
              class="w-7 h-7 inline-flex items-center justify-center rounded-md
                     bg-white/10 hover:bg-white/20 disabled:opacity-30">
              <app-icon name="chevron-right" [size]="15" />
            </button>
          </div>
        }

        <!-- Toggle sidebar -->
        <button type="button" (click)="state.sidebarOpen.update(v => !v)"
          [title]="state.sidebarOpen() ? 'Hide side panel' : 'Show side panel'"
          [attr.aria-pressed]="state.sidebarOpen()"
          class="w-7 h-7 inline-flex items-center justify-center rounded-md
                 bg-white/10 hover:bg-white/20">
          <app-icon name="panel" [size]="15" />
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
          <div class="max-w-md p-6 bg-red-900/30 rounded-lg border border-red-500/30
                      text-red-300 text-sm flex items-start gap-2.5">
            <app-icon name="warning" [size]="18" class="mt-px flex-shrink-0" />
            <span>{{ state.errorMsg() }}</span>
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

          <!--
            Tools sit beside the document rather than above it: horizontal
            chrome is charged against the page being read, vertical chrome
            is not.
          -->
          <app-tool-rail></app-tool-rail>

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
                <!-- The document's own name, because that is what this image
                     is. An empty alt would be right for decoration; this is
                     the content of the page. -->
                <img [src]="imageUrl" class="max-w-full max-h-full shadow-lg"
                     [alt]="state.viewerData()?.name || 'Document'" />
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
  private auth   = inject(AuthService);

  collaboration = inject(CollaborationService);
  private drawingSearch = inject(DrawingSearchService);

  imageUrl = '';
  entityCount = 0;

  /** Stops the cursor-expiry timer and the event subscription on teardown. */
  private cursorTimer?: ReturnType<typeof setInterval>;
  private unsubscribeCollaboration?: () => void;

  constructor() {
    // Redact/OCR/flatten/form-fill rewrite the document server-side and
    // commit a new version. Re-fetch so the viewer shows the result and the
    // next operation runs against it rather than the copy already in memory.
    effect(() => {
      const token = this.state.reloadToken();
      if (token === 0) return;   // no commit yet — ngOnInit does the first load
      this.loadDocument(this.state.documentId());
    });
  }

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id) { this.router.navigate(['/']); return; }
    this.state.documentId.set(id);
    this.loadDocument(id);
    this.loadAnnotations(id);
    this.startCollaboration(id);
  }

  ngOnDestroy() {
    this.unsubscribeCollaboration?.();
    if (this.cursorTimer) clearInterval(this.cursorTimer);
    this.collaboration.disconnect();
  }

  // ── Collaboration ────────────────────────────────────────────

  private startCollaboration(documentId: number) {
    this.collaboration.connect(documentId);
    this.unsubscribeCollaboration = this.collaboration.onEvent(
      event => this.applyRemoteChange(event));
    // Cursors expire rather than being cleared: someone who stops moving has
    // not left, but a pointer frozen where they last were is misleading.
    this.cursorTimer = setInterval(() => this.collaboration.pruneStaleCursors(), 2000);
  }

  /**
   * Applies a change someone else made.
   *
   * <p>Annotation events reload the document's annotations rather than
   * patching the local list from the payload: the list is small, and
   * re-reading it cannot drift out of step with the server the way a
   * sequence of incremental patches can.
   */
  private applyRemoteChange(event: CollaborationEvent) {
    if (event.actor && event.actor === this.auth.username()) return;

    switch (event.type) {
      case 'ANNOTATION_CREATED':
      case 'ANNOTATION_UPDATED':
      case 'ANNOTATION_DELETED':
      case 'ANNOTATION_RESOLVED':
      case 'REPLY_ADDED':
        this.loadAnnotations(this.state.documentId());
        break;

      case 'VERSION_COMMITTED':
        // The bytes this viewer is showing have been replaced. Reload, and
        // say who did it — the page changing underneath you with no
        // explanation is alarming.
        this.state.processingMessage.set(
          `v${event.version} by ${event.actor} — ${event.summary ?? 'document updated'}`);
        this.state.applyVersionCommit(event.version ?? this.state.currentVersion());
        break;
    }
  }

  presenceTitle(): string {
    return this.collaboration.others()
      .map(participant => participant.username)
      .join(', ') + ' also viewing';
  }

  initialsOf(username: string): string {
    return username.slice(0, 2).toUpperCase();
  }

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
          // Release the previous document before swapping it out — reloading
          // after a version commit would otherwise leak a pdf.js worker and
          // its page buffers on every operation.
          this.state.pdfDoc()?.destroy?.();
          this.state.pdfDoc.set(pdfDoc);
          this.state.totalPages.set(pdfDoc.numPages);
          this.state.currentVersion.set(data.version ?? 1);
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
    const { MarkupEngineService } = await import('../../../viewer-core/markup-engine.service');
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

  /**
   * Search whichever kind of document is open.
   *
   * This used to read the PDF document and return the moment there wasn't
   * one, so a converted CAD drawing — which has plenty of text, in its title
   * block alone — answered every query with "No matches found" whether the
   * words were on the drawing or not.
   */
  private async runSearch() {
    const query = this.state.searchQuery().trim();
    if (!query) {
      this.state.searchResults.set([]);
      this.state.searchFocus.set(null);
      return;
    }

    const pdfDoc = this.state.pdfDoc();
    if (pdfDoc) {
      const results = await this.pdfEngine.searchDocument(pdfDoc, query);
      this.state.searchResults.set(results);
      const firstHit = results[0];
      if (firstHit) this.state.navigateTo(firstHit.pageIndex);
      return;
    }

    const matches = this.drawingSearch.search(this.state.drawingText(), query);
    this.state.searchResults.set(matches);
    this.state.searchFocus.set(matches[0]?.item ?? null);
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
