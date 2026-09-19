import {
  Component, Input, computed, inject,
  AfterViewInit, OnDestroy, OnChanges, SimpleChanges,
  ElementRef, ViewChild, ChangeDetectionStrategy
} from '@angular/core';
import { PdfEngineService } from '../../../../viewer-core/pdf-engine.service';
import { ViewerStateService } from '../../../../viewer-core/viewer-state.service';
import { CollaborationService } from '../../../core/services/collaboration.service';
import { RemoteCursorsComponent } from '../markup/remote-cursors.component';
import { PageLinksComponent } from '../../../../viewer-core/page-links.component';
import { PdfMarkupLayerComponent } from './pdf-markup-layer.component';
import { PageRequest, PdfPagePainting } from './pdf-page-painting';
import { rotatedFootprint } from './pdf-page-geometry';
import { pageLabel } from '../../../../viewer-core/page-labels';

@Component({
  selector: 'app-pdf-page',
  standalone: true,
  imports: [RemoteCursorsComponent, PageLinksComponent, PdfMarkupLayerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The stylesheet is a derived subset of pdfjs-dist/web/pdf_viewer.css and
  // is kept in its own file so its provenance stays visible (§17.2).
  styleUrls: ['./pdf-text-layer.css'],
  template: `
    <!-- Outer box takes the rotated footprint so the scroll container
         reserves the right space; the inner box is what actually turns. -->
    <div class="relative select-none"
         [style.width.px]="outerWidth()"
         [style.height.px]="outerHeight()">
    <div class="relative select-none pdf-page-wrap"
         (mousemove)="reportCursor($event)"
         [style.width.px]="painting.width()"
         [style.height.px]="painting.height()"
         [style.transform]="rotationTransform()"
         style="transform-origin: center center">

      <!-- Placeholder shown while this page is outside the render window -->
      @if (!painting.painted()) {
        <div class="absolute inset-0 bg-white shadow-lg flex items-center justify-center">
          <span class="text-xs text-gray-400 select-none">{{ pageLabel(pageNumber) }}</span>
        </div>
      }

      <!-- PDF canvas -->
      <canvas #pageCanvas
        class="block shadow-lg"
        [style.width.px]="painting.width()"
        [style.height.px]="painting.height()">
      </canvas>

      <!-- Text layer (for text selection + search highlight).
           Populated by pdf.js's TextLayer — see PdfEngineService. -->
      <div #textLayer
        class="textLayer"
        [style.--total-scale-factor]="zoom"
        [style.width.px]="painting.width()"
        [style.height.px]="painting.height()">
      </div>

      <!-- What people draw on top, bound to this page's coordinate system -->
      <app-pdf-markup-layer
        [pageNumber]="pageNumber" [zoom]="zoom"
        [pageWidth]="painting.width()" [pageHeight]="painting.height()">
      </app-pdf-markup-layer>

      <!-- Link annotations, below the cursors so a remote pointer is never
           swallowed by a link's hit area -->
      <app-page-links [pageNumber]="pageNumber" [zoom]="zoom"
                      [pageHeight]="painting.height() / zoom"></app-page-links>

      <!-- Other people's pointers -->
      <app-remote-cursors [pageNumber]="pageNumber" [zoom]="zoom"></app-remote-cursors>

      <!-- Page number label -->
      <div class="absolute bottom-1 right-2 text-xs text-white/50 select-none pointer-events-none">
        {{ pageNumber }}
      </div>
    </div>
    </div>
  `
})
export class PdfPageComponent implements AfterViewInit, OnChanges, OnDestroy {
  pageLabel = pageLabel;

  @Input({ required: true }) pdfDoc!:    any;
  @Input({ required: true }) pageNumber!: number;
  @Input()                   zoom        = 1.0;
  @Input()                   searchQuery = '';
  /**
   * Whether this page is close enough to the viewport to be worth painting.
   * When false the page keeps its correct size (so scroll height and page
   * anchors stay right) but releases its canvas backing store.
   */
  @Input()                   active      = true;

  @ViewChild('pageCanvas')  canvas!:    ElementRef<HTMLCanvasElement>;
  @ViewChild('textLayer')   textLayer!: ElementRef<HTMLDivElement>;

  state = inject(ViewerStateService);
  private collaboration = inject(CollaborationService);

  readonly painting = new PdfPagePainting(inject(PdfEngineService), () => ({
    canvas: this.canvas?.nativeElement,
    textLayer: this.textLayer?.nativeElement,
  }));

  // @ViewChild('pageCanvas') isn't populated until after the view is
  // initialized, so the *first* paint has to happen here rather than in an
  // ngOnInit — asking earlier silently no-ops on the missing canvas, which
  // is why pages never painted.
  ngAfterViewInit() { this.painting.repaint(this.request); }

  ngOnChanges(changes: SimpleChanges) {
    // Skip the very first call — the view (and @ViewChild canvas) isn't
    // ready yet; ngAfterViewInit handles the initial paint instead.
    const isFirstChange = Object.values(changes).some(c => c.isFirstChange());
    if (isFirstChange) return;

    if (changes['zoom'] || changes['pdfDoc'] || changes['pageNumber'] || changes['active']) {
      this.painting.repaint(this.request);
      return;   // repaint() re-applies the search highlight itself
    }
    if (changes['searchQuery']) {
      this.painting.markSearchMatches(this.request);
    }
  }

  ngOnDestroy() { this.painting.release(); }

  /** What this page is currently being asked to show. */
  private get request(): PageRequest {
    return {
      pdfDoc: this.pdfDoc,
      pageNumber: this.pageNumber,
      zoom: this.zoom,
      searchQuery: this.searchQuery,
      active: this.active,
    };
  }

  // ── View rotation ────────────────────────────────────────────
  rotationTransform = computed(() => {
    const degrees = this.state.rotation();
    return degrees ? `rotate(${degrees}deg)` : '';
  });

  /** The space this page needs once the view rotation is applied. */
  private footprint = computed(() => rotatedFootprint(
    this.state.isQuarterTurned(), this.painting.width(), this.painting.height()));

  outerWidth  = computed(() => this.footprint().width);
  outerHeight = computed(() => this.footprint().height);

  /**
   * Tells other viewers where this pointer is.
   *
   * <p>Bound to the page wrapper rather than the markup overlay, which turns
   * off pointer events unless a drawing tool is active — a pointer that only
   * broadcast while drawing would be no use for following along.
   *
   * <p>Coordinates are divided by the zoom so they describe a place on the
   * page rather than a place on this screen; the service throttles the rate.
   */
  reportCursor(e: MouseEvent) {
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const scale = this.zoom || 1;
    this.collaboration.reportCursor({
      page: this.pageNumber,
      x: (e.clientX - box.left) / scale,
      y: (e.clientY - box.top) / scale
    });
  }
}
