/**
 * Draws a list of markup shapes inside an SVG.
 *
 * Extracted on the third caller, not the second (§3.3): the PDF page, the CAD
 * canvas and the embedded viewer each drew the same shapes the same wrong way
 * — `<g [innerHTML]="renderShape(shape)">` over a string of SVG, which is
 * `bypassSecurityTrustHtml` in two of them and silently stripped by Angular's
 * sanitiser in the third.
 *
 * Neither outcome is acceptable and they are the same mistake. A shape carries
 * text a user typed, a colour from state, and — in an embed — every field
 * straight from the host application. Interpolating those into markup and
 * injecting it runs whatever was put in them, on the viewer's origin (§5.12
 * A03). Here each attribute is a binding, which Angular escapes, so there is
 * nothing to sanitise and nothing to bypass.
 *
 * Applied to a `<g>` so it keeps the SVG namespace it is drawn in:
 *
 * ```html
 * <svg …>
 *   <g markupShapes [shapes]="state.shapes()"></g>
 * </svg>
 * ```
 */
import {
  ChangeDetectionStrategy, Component, computed, inject, input,
} from '@angular/core';

import { MarkupEngineService } from './markup-engine.service';
import { ShapeData } from './viewer-state.service';

@Component({
  selector: 'g[markupShapes]',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (drawn of drawings(); track drawn.id) {
      <svg:g [attr.data-id]="drawn.id">
        @for (primitive of drawn.primitives; track $index) {
          @switch (primitive.kind) {
            @case ('rect') {
              <svg:rect [attr.x]="primitive.x" [attr.y]="primitive.y"
                        [attr.width]="primitive.width" [attr.height]="primitive.height"
                        [attr.rx]="primitive.rx"
                        [attr.stroke]="primitive.stroke" [attr.fill]="primitive.fill"
                        [attr.stroke-width]="primitive.strokeWidth"
                        [attr.stroke-dasharray]="primitive.dashArray"/>
            }
            @case ('circle') {
              <svg:circle [attr.cx]="primitive.cx" [attr.cy]="primitive.cy"
                          [attr.r]="primitive.r"
                          [attr.stroke]="primitive.stroke" [attr.fill]="primitive.fill"
                          [attr.stroke-width]="primitive.strokeWidth"
                          [attr.stroke-dasharray]="primitive.dashArray"/>
            }
            @case ('ellipse') {
              <svg:ellipse [attr.cx]="primitive.cx" [attr.cy]="primitive.cy"
                           [attr.rx]="primitive.rx" [attr.ry]="primitive.ry"
                           [attr.stroke]="primitive.stroke" [attr.fill]="primitive.fill"
                           [attr.stroke-width]="primitive.strokeWidth"/>
            }
            @case ('line') {
              <svg:line [attr.x1]="primitive.x1" [attr.y1]="primitive.y1"
                        [attr.x2]="primitive.x2" [attr.y2]="primitive.y2"
                        [attr.stroke]="primitive.stroke"
                        [attr.stroke-width]="primitive.strokeWidth"
                        [attr.stroke-linecap]="primitive.linecap"
                        [attr.stroke-dasharray]="primitive.dashArray"/>
            }
            @case ('path') {
              <svg:path [attr.d]="primitive.d"
                        [attr.stroke]="primitive.stroke" [attr.fill]="primitive.fill"
                        [attr.stroke-width]="primitive.strokeWidth"
                        [attr.stroke-linecap]="primitive.linecap"
                        [attr.stroke-linejoin]="primitive.linejoin"
                        [attr.stroke-dasharray]="primitive.dashArray"/>
            }
            @case ('polygon') {
              <svg:polygon [attr.points]="primitive.points"
                           [attr.stroke]="primitive.stroke" [attr.fill]="primitive.fill"
                           [attr.stroke-width]="primitive.strokeWidth"/>
            }
            @case ('text') {
              <!-- Interpolated, so the text is a text node and never markup. -->
              <svg:text [attr.x]="primitive.x" [attr.y]="primitive.y"
                        [attr.fill]="primitive.fill"
                        [attr.font-size]="primitive.fontSize"
                        [attr.font-family]="primitive.fontFamily"
                        [attr.font-weight]="primitive.fontWeight"
                        [attr.text-anchor]="primitive.textAnchor">{{ primitive.content }}</svg:text>
            }
            @case ('title') {
              <!-- The group's accessible name: a browser tooltip, and what a
                   screen reader announces for a shape whose meaning is text
                   that is not otherwise drawn on the page. -->
              <svg:title>{{ primitive.content }}</svg:title>
            }
          }
        }
      </svg:g>
    }
  `,
})
export class MarkupShapesComponent {

  /** The shapes to draw, in paint order. */
  readonly shapes = input.required<ShapeData[]>();

  private readonly markup = inject(MarkupEngineService);

  /**
   * Converted once per change rather than once per binding.
   *
   * A method called from the template would re-run on every change-detection
   * pass, for every shape, and a drawing can hold hundreds.
   */
  protected readonly drawings = computed(() => this.shapes().map((shape) => ({
    id: shape.id,
    primitives: this.markup.shapeToPrimitives(shape),
  })));
}
