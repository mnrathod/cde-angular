/**
 * One PDF page, with a markup overlay over it.
 *
 * A second, smaller implementation of what `pdf-viewer/pdf-page.component.ts`
 * does. That is deliberate under the rule of three (§3.3): this is the second
 * caller, and the first one is wired to `CollaborationService` and
 * `AnnotationService` — an application session and an HTTP persistence path,
 * neither of which exists inside an embed. Generalising now would mean pulling
 * those dependencies apart to serve one new caller, and a wrong abstraction
 * costs more than the duplication.
 *
 * If a third page renderer appears, extract then, into `viewer-core`.
 *
 * The markup drawing is no longer part of that duplication: three components
 * drew the same shapes, so it left for `viewer-core/markup-shapes.component`.
 * What remains here is the canvas and the pointer handling.
 */
import {
  AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, Input, OnChanges,
  SimpleChanges, ViewChild, effect, inject, output, signal,
} from '@angular/core';
import { PdfEngineService } from '../../../viewer-core/pdf-engine.service';
import { MarkupShapesComponent } from '../../../viewer-core/markup-shapes.component';
import { ViewerStateService, ShapeData } from '../../../viewer-core/viewer-state.service';
import { pageLabel } from '../../../viewer-core/page-labels';
import { EmbedStrokeSession } from './embed-stroke-session';

@Component({
  selector: 'app-embed-page',
  standalone: true,
  imports: [MarkupShapesComponent],
  providers: [EmbedStrokeSession],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page" [style.width.px]="widthPx()" [style.height.px]="heightPx()">
      <!--
        The page image, named for what it is. The label was built by
        concatenating "Page " onto a number in the template: English text
        outside any message, which the markup sweep cannot see and a
        translator never receives.
      -->
      <canvas #canvas role="img" [attr.aria-label]="pageName()"></canvas>
      <svg #overlay
           [attr.viewBox]="'0 0 ' + widthPx() + ' ' + heightPx()"
           [class.drawing]="strokes.acceptsDrawing()"
           (pointerdown)="beginStroke($event)"
           (pointermove)="extendStroke($event)"
           (pointerup)="endStroke()"
           (pointerleave)="endStroke()">
        <!--
          Drawn by MarkupShapesComponent, not [innerHTML]. Markup reaches this
          overlay from the host, so a string of SVG built from it and injected
          would run whatever the host put in it, on the viewer's origin — which
          is what CLAUDE.md §5.12 bans the binding for.
        -->
        <svg:g markupShapes [shapes]="drawn()"></svg:g>
      </svg>
    </div>
  `,
  styles: [`
    .page { position: relative; margin: 0 auto 16px; background: #fff;
            box-shadow: 0 1px 4px rgba(0,0,0,.22); }
    canvas, svg { position: absolute; inset: 0; width: 100%; height: 100%; }
    svg { touch-action: none; }
    svg.drawing { cursor: crosshair; }
  `],
})
export class EmbedPageComponent implements AfterViewInit, OnChanges {

  @Input({ required: true }) pageNumber!: number;
  @Input({ required: true }) zoom!: number;

  /** Emitted once per completed stroke, so the host hears one message. */
  readonly shapeDrawn = output<ShapeData>();

  /**
   * Emitted when the canvas has actually been painted, with its final size.
   *
   * Fires on every render including zoom changes — deduplicating to one event
   * per page is the session's job, because this component only knows about its
   * own page and cannot tell a first view from a re-paint.
   */
  readonly pageRendered = output<{ page: number; widthPx: number; heightPx: number }>();

  @ViewChild('canvas') private canvasRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('overlay') private overlayRef?: ElementRef<SVGSVGElement>;

  private readonly pdfEngine = inject(PdfEngineService);
  private readonly viewerState = inject(ViewerStateService);
  readonly strokes = inject(EmbedStrokeSession);

  readonly widthPx = signal(0);
  readonly heightPx = signal(0);
  /** Everything to draw on this page, committed shapes plus the live stroke. */
  readonly drawn = signal<ShapeData[]>([]);

  constructor() {
    /*
     * Repaint when the shape list changes from outside this component.
     *
     * `host.loadMarkup` replaces the whole list — on reload, and whenever the
     * host hands back what it has stored. Without this the overlay only
     * repainted on render or on a stroke, so markup the host sent after the
     * document had loaded arrived in state and never appeared on the page.
     * That is the reload path, which is the demo's whole point.
     */
    effect(() => {
      this.viewerState.shapes();
      this.redrawOverlay();
    });
  }

  /** "Page 3", in the reader's language. */
  pageName(): string {
    return pageLabel(this.pageNumber);
  }

  /**
   * The first render, and it has to be here.
   *
   * `@ViewChild('canvas')` is not populated until the view is initialised, so
   * a render driven by the first `ngOnChanges` hits the `!canvas` guard below
   * and returns silently. Nothing retries — `pageNumber` and `zoom` do not
   * change again on their own — so every page stays blank at its default
   * 300×150, the `.page` box collapses to 0×0, and the markup overlay
   * collapses with it, which makes the document unopenable *and* unmarkable
   * while the protocol reports `viewer.loaded` quite happily.
   *
   * `PdfPageComponent` in the full viewer carries the same fix and the same
   * comment. This component was written without it.
   */
  ngAfterViewInit(): void {
    void this.render();
  }

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    // Skip the first call: the view is not up yet, and ngAfterViewInit above
    // does the initial render instead.
    if (Object.values(changes).some((change) => change.isFirstChange())) return;
    if (changes['pageNumber'] || changes['zoom']) await this.render();
  }

  private async render(): Promise<void> {
    const pdf = this.viewerState.pdfDoc();
    const canvas = this.canvasRef?.nativeElement;
    if (!pdf || !canvas) return;

    const { width, height } = await this.pdfEngine.renderPage(
      pdf, this.pageNumber, canvas, this.zoom,
    );
    this.widthPx.set(width);
    this.heightPx.set(height);
    this.redrawOverlay();
    this.pageRendered.emit({ page: this.pageNumber, widthPx: width, heightPx: height });
  }

  private redrawOverlay(): void {
    const shapes = this.viewerState.shapes()
      .filter((shape) => shape.pageNumber === this.pageNumber);
    const drawing = this.strokes.inProgress();
    const all = drawing ? [...shapes, drawing] : shapes;
    this.drawn.set(all);
  }

  beginStroke(event: PointerEvent): void {
    const surface = this.surface();
    if (!surface) return;
    this.strokes.begin(event, surface);
    this.redrawOverlay();
  }

  extendStroke(event: PointerEvent): void {
    const surface = this.surface();
    if (!surface) return;
    this.strokes.extend(event, surface);
    this.redrawOverlay();
  }

  endStroke(): void {
    const finished = this.strokes.end();
    this.redrawOverlay();
    if (finished) this.shapeDrawn.emit(finished);
  }

  private surface() {
    const overlay = this.overlayRef?.nativeElement;
    return overlay ? { overlay, pageNumber: this.pageNumber } : null;
  }
}
