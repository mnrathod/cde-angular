import {
  Component, inject, signal, OnInit, ViewChild, ElementRef,
  ChangeDetectionStrategy,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { PdfEngineService } from '../../../../viewer-core/pdf-engine.service';
import { CompareDocumentsLoader, ComparedDocument } from './compare-documents-loader';
import { CompareSliderComponent } from './compare-slider.component';
import {
  CompareMode, VisualCompareHeaderComponent,
} from './visual-compare-header.component';

export type { CompareMode } from './visual-compare-header.component';

/** Drawings are compared at 150%, which is legible without being enormous. */
const COMPARE_ZOOM = 1.5;

@Component({
  selector: 'app-visual-compare',
  standalone: true,
  imports: [VisualCompareHeaderComponent, CompareSliderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CompareDocumentsLoader],
  template: `
    <div class="fixed inset-0 flex flex-col" style="z-index:600;background:#1a1d27">

      <app-visual-compare-header
        [mode]="mode()"
        [original]="original()?.document ?? null"
        [revised]="revised()?.document ?? null"
        [currentPage]="currentPage()"
        [totalPages]="totalPages()"
        [overlayOpacity]="overlayOpacity()"
        (backRequested)="goBack()"
        (modeChosen)="chooseMode($event)"
        (pageChanged)="goToPage($event)"
        (overlayOpacityChanged)="overlayOpacity.set($event)"
      />

      @if (documents.loading()) {
        <div class="flex-1 flex flex-col items-center justify-center text-white/50">
          <div class="w-8 h-8 border-2 border-white/20 border-t-white/70 rounded-full animate-spin mb-3"></div>
          <div class="text-sm">{{ documents.progress() }}</div>
        </div>
      } @else if (documents.errorMsg()) {
        <div class="flex-1 flex items-center justify-center p-6" role="alert">
          <div class="max-w-md p-6 bg-red-900/30 rounded-lg border border-red-500/30 text-red-300 text-sm">
            {{ documents.errorMsg() }}
          </div>
        </div>
      } @else if (mode() === 'side-by-side') {
        <div class="flex flex-1 overflow-hidden gap-1">
          <div class="flex-1 overflow-auto flex flex-col items-center p-3 gap-3"
               style="background:#2a2d3a">
            <h2 i18n="Labels the earlier of the two drawings, side-by-side view@@visualCompare.originalPanel"
                class="text-xs text-blue-300 font-semibold mb-1 self-start px-1">ORIGINAL</h2>
            <canvas #canvas1 class="shadow-xl max-w-full"></canvas>
          </div>
          <div class="w-1 bg-white/10 flex-shrink-0" aria-hidden="true"></div>
          <div class="flex-1 overflow-auto flex flex-col items-center p-3 gap-3"
               style="background:#2a2d3a">
            <h2 i18n="Labels the later of the two drawings, side-by-side view@@visualCompare.revisedPanel"
                class="text-xs text-amber-300 font-semibold mb-1 self-start px-1">REVISED</h2>
            <canvas #canvas2 class="shadow-xl max-w-full"></canvas>
          </div>
        </div>
      } @else if (mode() === 'slider') {
        <app-compare-slider [resetToken]="currentPage()" class="flex flex-1 min-h-0" />
      } @else {
        <div class="flex-1 overflow-auto flex items-center justify-center p-4"
             style="background:#2a2d3a">
          <div class="relative inline-block shadow-2xl">
            <canvas #overlayCanvas2 class="block"></canvas>
            <canvas #overlayCanvas1 class="absolute top-0 left-0 block"
              [style.opacity]="overlayOpacity() / 100"
              style="mix-blend-mode:difference"></canvas>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`canvas { image-rendering: crisp-edges; }`]
})
export class VisualCompareComponent implements OnInit {
  @ViewChild('canvas1') canvas1!: ElementRef<HTMLCanvasElement>;
  @ViewChild('canvas2') canvas2!: ElementRef<HTMLCanvasElement>;
  @ViewChild('overlayCanvas1') overlayCanvas1!: ElementRef<HTMLCanvasElement>;
  @ViewChild('overlayCanvas2') overlayCanvas2!: ElementRef<HTMLCanvasElement>;
  @ViewChild(CompareSliderComponent) slider?: CompareSliderComponent;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private engine = inject(PdfEngineService);
  documents = inject(CompareDocumentsLoader);

  mode = signal<CompareMode>('side-by-side');
  original = signal<ComparedDocument | null>(null);
  revised = signal<ComparedDocument | null>(null);
  currentPage = signal(1);
  totalPages = signal(1);
  overlayOpacity = signal(50);

  async ngOnInit() {
    const first = this.route.snapshot.queryParamMap.get('doc1');
    const second = this.route.snapshot.queryParamMap.get('doc2');
    if (!first || !second) { this.router.navigate(['/']); return; }

    const pair = await this.documents.load(Number(first), Number(second));
    if (!pair) return;

    const [original, revised] = pair;
    this.original.set(original);
    this.revised.set(revised);
    this.totalPages.set(Math.max(
      original.pdfDoc?.numPages || 1, revised.pdfDoc?.numPages || 1));
    this.redraw();
  }

  chooseMode(mode: CompareMode) {
    this.mode.set(mode);
    this.redraw();
  }

  goToPage(page: number) {
    this.currentPage.set(
      Math.max(1, Math.min(this.totalPages(), page)));
    this.redraw();
  }

  /**
   * Draws both documents into whichever pair of canvases is on screen.
   *
   * <p>Deferred a frame because the mode's canvases are created by the
   * change detection this call is part of — drawing into the pair the
   * previous mode used would paint a canvas that is about to be discarded.
   */
  private redraw() {
    setTimeout(() => this.drawCurrentPage(), 0);
  }

  private async drawCurrentPage() {
    const pairs = this.canvasesForMode();
    await Promise.all([
      this.drawInto(this.original()?.pdfDoc, pairs?.original),
      this.drawInto(this.revised()?.pdfDoc, pairs?.revised),
    ]);
  }

  /** The two canvases the current mode renders into, once they exist. */
  private canvasesForMode() {
    if (this.mode() === 'side-by-side') {
      return { original: this.canvas1?.nativeElement, revised: this.canvas2?.nativeElement };
    }
    if (this.mode() === 'slider') {
      return {
        original: this.slider?.originalCanvas?.nativeElement,
        revised: this.slider?.revisedCanvas?.nativeElement,
      };
    }
    return {
      original: this.overlayCanvas1?.nativeElement,
      revised: this.overlayCanvas2?.nativeElement,
    };
  }

  /**
   * Draws the current page, or the last one this document has.
   *
   * <p>The two documents need not be the same length — a revision that adds
   * a page is the ordinary case — so the page is clamped per document
   * rather than refused.
   */
  private async drawInto(pdfDoc: any, canvas: HTMLCanvasElement | undefined) {
    if (!pdfDoc || !canvas) return;
    const page = Math.min(this.currentPage(), pdfDoc.numPages);
    await this.engine.renderPage(pdfDoc, page, canvas, COMPARE_ZOOM);
  }

  goBack() { this.router.navigate(['/compare']); }
}
