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
 */
import {
  AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, Input, OnChanges,
  SimpleChanges, ViewChild, effect, inject, output, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { PdfEngineService } from '../../../viewer-core/pdf-engine.service';
import { MarkupEngineService, SvgPrimitive } from '../../../viewer-core/markup-engine.service';
import { ViewerStateService, ShapeData } from '../../../viewer-core/viewer-state.service';

@Component({
  selector: 'app-embed-page',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page" [style.width.px]="widthPx()" [style.height.px]="heightPx()">
      <canvas #canvas [attr.aria-label]="'Page ' + pageNumber"></canvas>
      <svg #overlay
           [attr.viewBox]="'0 0 ' + widthPx() + ' ' + heightPx()"
           [class.drawing]="isDrawingTool()"
           (pointerdown)="beginStroke($event)"
           (pointermove)="extendStroke($event)"
           (pointerup)="endStroke()"
           (pointerleave)="endStroke()">
        <!--
          Bound elements, not [innerHTML].

          Markup reaches this overlay from the host, so a string of SVG built
          from it and injected would run whatever the host put in it, on the
          viewer's origin — which is what CLAUDE.md §5.12 bans the binding for.
          Angular escapes every attribute below, so there is nothing to
          sanitise and nothing to bypass.
        -->
        @for (primitive of primitives(); track $index) {
          @switch (primitive.kind) {
            @case ('rect') {
              <rect [attr.x]="primitive.x" [attr.y]="primitive.y"
                    [attr.width]="primitive.width" [attr.height]="primitive.height"
                    [attr.rx]="primitive.rx"
                    [attr.stroke]="primitive.stroke" [attr.fill]="primitive.fill"
                    [attr.stroke-width]="primitive.strokeWidth"/>
            }
            @case ('path') {
              <path [attr.d]="primitive.d"
                    [attr.stroke]="primitive.stroke" [attr.fill]="primitive.fill"
                    [attr.stroke-width]="primitive.strokeWidth"
                    [attr.stroke-dasharray]="primitive.dashArray"/>
            }
            @case ('line') {
              <line [attr.x1]="primitive.x1" [attr.y1]="primitive.y1"
                    [attr.x2]="primitive.x2" [attr.y2]="primitive.y2"
                    [attr.stroke]="primitive.stroke"
                    [attr.stroke-width]="primitive.strokeWidth"
                    stroke-linecap="round"/>
            }
            @case ('polygon') {
              <polygon [attr.points]="primitive.points"
                       [attr.stroke]="primitive.stroke" [attr.fill]="primitive.fill"
                       [attr.stroke-width]="primitive.strokeWidth"/>
            }
          }
        }
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
  private readonly markupEngine = inject(MarkupEngineService);
  private readonly viewerState = inject(ViewerStateService);

  readonly widthPx = signal(0);
  readonly heightPx = signal(0);
  /** Every primitive on this page, in paint order. */
  readonly primitives = signal<SvgPrimitive[]>([]);

  private inProgress: ShapeData | null = null;

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

  isDrawingTool(): boolean {
    const tool = this.viewerState.activeTool();
    return tool !== 'pan' && tool !== 'select';
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
    const all = this.inProgress ? [...shapes, this.inProgress] : shapes;
    this.primitives.set(all.flatMap((shape) => this.markupEngine.shapeToPrimitives(shape)));
  }

  beginStroke(event: PointerEvent): void {
    if (!this.isDrawingTool()) return;
    const overlay = this.overlayRef?.nativeElement;
    if (!overlay) return;

    overlay.setPointerCapture(event.pointerId);
    const point = this.markupEngine.getSvgPoint(event as unknown as MouseEvent, overlay);
    this.inProgress = this.markupEngine.startShape(
      this.viewerState.activeTool(),
      point,
      this.pageNumber,
      this.viewerState.strokeColor(),
      this.viewerState.strokeWidth(),
      this.viewerState.fillOpacity(),
      // No author. §6.2: the host stamps that from its own session, and a name
      // put here would be the browser's claim about its own user.
    );
    this.redrawOverlay();
  }

  extendStroke(event: PointerEvent): void {
    const overlay = this.overlayRef?.nativeElement;
    if (!this.inProgress || !overlay) return;
    const point = this.markupEngine.getSvgPoint(event as unknown as MouseEvent, overlay);
    this.inProgress = this.markupEngine.updateShape(this.inProgress, point);
    this.redrawOverlay();
  }

  endStroke(): void {
    const finished = this.inProgress;
    this.inProgress = null;
    if (!finished) return;

    // A click that never moved is not a shape. Emitting it would put an
    // invisible zero-size markup in the host's store for every stray tap.
    if (!this.markupEngine.hasMinimumSize(finished)) {
      this.redrawOverlay();
      return;
    }
    this.viewerState.addShape(finished);
    this.redrawOverlay();
    this.shapeDrawn.emit(finished);
  }
}
