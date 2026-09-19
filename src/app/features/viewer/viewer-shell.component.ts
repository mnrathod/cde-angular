import {
  Component, inject, OnInit, OnDestroy, effect, ChangeDetectionStrategy
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { ViewerStateService } from '../../../viewer-core/viewer-state.service';
import { DocumentOperationsService } from './toolbar/document-operations.service';
import { PdfEngineService } from '../../../viewer-core/pdf-engine.service';
import { DrawingSearchService } from '../../../viewer-core/drawing-search.service';
import { CollaborationService } from '../../core/services/collaboration.service';
import { RemoteDocumentChanges } from './remote-document-changes';
import { ViewerDocumentLoader } from './viewer-document-loader';

import { MarkupToolbarComponent } from './toolbar/markup-toolbar.component';
import { ToolRailComponent } from '../../../viewer-core/tool-rail.component';
import { ViewerSidebarComponent } from './sidebar/viewer-sidebar.component';
import { ViewerCanvasComponent } from './viewer-canvas.component';
import { ViewerTopBarComponent } from './viewer-top-bar.component';

@Component({
  selector: 'app-viewer-shell',
  standalone: true,
  // Scoped to this component, not singletons: leaving the document must tear
  // the socket down, not leave it announcing a presence that has gone.
  // Alongside the viewer state, because the in-flight flags on the
  // operations belong to one open document.
  providers: [
    ViewerStateService,
    CollaborationService,
    DocumentOperationsService,
    ViewerDocumentLoader,
    RemoteDocumentChanges,
  ],
  imports: [
    ViewerTopBarComponent,
    MarkupToolbarComponent,
    ToolRailComponent,
    ViewerSidebarComponent,
    ViewerCanvasComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 flex flex-col" style="z-index:500">

      <app-viewer-top-bar (backRequested)="goBack()" />

      @if (state.loading() || state.errorMsg()) {
        <app-viewer-canvas />
      } @else {
        <app-markup-toolbar
          (saveRequested)="loader.saveShapes()"
          (printRequested)="printDocument()">
        </app-markup-toolbar>

        <div class="flex flex-1 overflow-hidden min-h-0">

          <!--
            Tools sit beside the document rather than above it: horizontal
            chrome is charged against the page being read, vertical chrome
            is not.
          -->
          <app-tool-rail></app-tool-rail>

          <app-viewer-canvas />

          @if (state.sidebarOpen()) {
            <app-viewer-sidebar (pageSelected)="onPageSelected($event)" />
          }
        </div>
      }
    </div>
  `
})
export class ViewerShellComponent implements OnInit, OnDestroy {
  state = inject(ViewerStateService);
  loader = inject(ViewerDocumentLoader);

  private pdfEngine = inject(PdfEngineService);
  private drawingSearch = inject(DrawingSearchService);
  private remoteChanges = inject(RemoteDocumentChanges);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  constructor() {
    // Redact/OCR/flatten/form-fill rewrite the document server-side and
    // commit a new version. Re-fetch so the viewer shows the result and the
    // next operation runs against it rather than the copy already in memory.
    effect(() => {
      const token = this.state.reloadToken();
      if (token === 0) return;   // no commit yet — ngOnInit does the first load
      this.loader.load(this.state.documentId());
    });
  }

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id) { this.router.navigate(['/']); return; }
    this.state.documentId.set(id);
    this.loader.load(id);
    this.loader.loadAnnotations(id);
    this.remoteChanges.watch(id);
  }

  ngOnDestroy() { this.remoteChanges.stop(); }

  async printDocument() {
    const pdfDoc = this.state.pdfDoc();
    if (!pdfDoc) { window.print(); return; }

    // Imported here rather than at the top to keep the markup engine out of
    // the shell's own chunk; printing is rare and the engine is not small.
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
    if (page === SEARCH_REQUESTED) { this.runSearch(); return; }
    document.getElementById('pdf-page-' + page)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /**
   * Search whichever kind of document is open.
   *
   * <p>This used to read the PDF document and return the moment there wasn't
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

  goBack() { this.router.navigate(['/']); }
}

/**
 * What the sidebar sends instead of a page number when the reader pressed
 * Search. It was a bare -1 with a comment beside every use.
 */
const SEARCH_REQUESTED = -1;
