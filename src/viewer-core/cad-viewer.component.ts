/**
 * A converted CAD drawing, with its layers, its markup and its viewport.
 *
 * <p>What is left here after the three pieces below were separated out is
 * the arrangement itself: a scrolling box, the drawing inside it, the
 * overlay over it and the layer panel beside it. The drawing is published as
 * an isolated image by `DrawingImage`, moved by `DrawingViewport`, and drawn
 * on by `DrawingMarkupLayerComponent`.
 */
import {
  AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, Input,
  OnChanges, SimpleChanges, ViewChild, effect, inject,
} from '@angular/core';

import { DrawingSearchService } from './drawing-search.service';
import { ViewerStateService } from './viewer-state.service';
import { CadLayerPanelComponent } from './cad-layer-panel.component';
import { DrawingImage } from './drawing-image';
import { DrawingMarkupLayerComponent } from './drawing-markup-layer.component';
import { DrawingViewport } from './drawing-viewport';
import { readLayers, readViewBox } from './cad-layers';

export type { CadLayer } from './cad-layers';

@Component({
  selector: 'app-cad-viewer',
  standalone: true,
  imports: [CadLayerPanelComponent, DrawingMarkupLayerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DrawingImage, DrawingViewport],
  template: `
    <div class="flex flex-1 overflow-hidden min-h-0">

      <div #svgContainer
        class="flex-1 overflow-auto flex items-start justify-center p-4 relative"
        style="background:#1a1d27"
        [style.cursor]="viewport.containerCursor()"
        (wheel)="viewport.zoomWithWheel($event)"
        (mousedown)="viewport.startPan($event)"
        (mousemove)="viewport.continuePan($event)"
        (mouseup)="viewport.endPan()"
        (mouseleave)="viewport.endPan()">

        <div #svgWrap [style.transform]="viewport.transform()"
             style="transform-origin: top left; transition: transform .1s; position: relative; display: inline-block;">
          <!-- An <img>, not injected markup — see DrawingImage. -->
          @if (drawing.url(); as url) {
            <img [src]="url" [alt]="drawing.description()" class="cad-svg-host">
          }

          <app-drawing-markup-layer [viewBox]="viewport.viewBox()" />
        </div>
      </div>

      <app-cad-layer-panel
        [layers]="drawing.layers()"
        (toggled)="drawing.toggle($event)"
        (allShown)="drawing.showAll()"
        (allHidden)="drawing.hideAll()"
      />
    </div>
  `,
  styles: [`
    /* The drawing is an <img> of an SVG document, so no rule here reaches
       inside it — that isolation is what makes it safe to render. */
    .cad-svg-host { display: block; max-width: 100%; }
  `]
})
export class CadViewerComponent implements OnChanges, AfterViewInit {
  @Input({ required: true }) svgContent!: string;
  @Input() dxfVersion  = '';
  @Input() entityCount = 0;

  @ViewChild('svgContainer') svgContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('svgWrap') svgWrap!: ElementRef<HTMLDivElement>;

  state = inject(ViewerStateService);
  drawing = inject(DrawingImage);
  viewport = inject(DrawingViewport);
  private drawingSearch = inject(DrawingSearchService);

  constructor() {
    // "Fit to window" lives only in the command bar now, so this viewer has
    // to hear about it: zoom alone leaves a drawing that has been scrolled
    // away from still off screen.
    effect(() => {
      this.state.fitRequests();
      this.viewport.recentre();
    });

    // Bring a search hit into view. Marking it is not enough on a drawing
    // wider than the window — the mark can easily be off screen.
    effect(() => {
      const hit = this.state.searchFocus();
      if (hit) this.viewport.scrollTo(hit);
    });
  }

  ngAfterViewInit(): void {
    this.viewport.bindTo(() => ({
      container: this.svgContainer?.nativeElement,
      wrap: this.svgWrap?.nativeElement,
    }));
  }

  ngOnChanges(changes: SimpleChanges) {
    if (!changes['svgContent'] || !this.svgContent) return;

    this.drawing.source.set(this.svgContent);
    this.drawing.layers.set(readLayers(this.svgContent));
    this.viewport.viewBox.set(readViewBox(this.svgContent));
    // Index the drawing's own text so it can be searched. Without this the
    // search panel had nothing to look at for a drawing and answered every
    // query with "No matches found".
    this.state.drawingText.set(this.drawingSearch.extractText(this.svgContent));
    this.state.searchFocus.set(null);
  }
}
