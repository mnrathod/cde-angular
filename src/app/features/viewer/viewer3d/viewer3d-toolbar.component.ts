/**
 * The 3D viewer's command bar, and what the model on screen actually is.
 *
 * <p>The counts and the schema were being computed, translated and then
 * thrown away — nothing rendered them. §1A.4 asks for the model's metadata
 * to be available as text beside the canvas, so they are shown here as a
 * description list rather than deleted.
 *
 * <p>Reset, Top, Front and Side called empty methods. Four buttons that
 * looked like controls, announced themselves as controls, and did nothing.
 * They now ask the scene to move the camera, which is what they always
 * claimed to do.
 */
import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, Output,
} from "@angular/core";

import { ModelGeometry } from "../../../../viewer-core/model-geometry";
import { ModelDirection } from "./model-scene";

/** One fact about the model, shown beside the canvas. */
export interface ModelFact {
  label: string;
  value: string;
}

@Component({
  selector: "app-viewer3d-toolbar",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="flex items-center h-11 px-3 gap-2 flex-shrink-0 text-white flex-wrap"
      style="background:var(--nav);box-shadow:0 2px 4px rgba(0,0,0,.15)"
    >
      <button (click)="backRequested.emit()" class="control">
        <span aria-hidden="true">←</span>
        <ng-container i18n="Leaves the 3D model view and returns to the document list@@viewer3d.back">Back</ng-container>
      </button>

      <span class="text-sm font-semibold flex-1 truncate">{{ title }}</span>

      @if (facts.length) {
        <dl class="flex items-center gap-3 text-xs text-white/70">
          @for (fact of facts; track fact.label) {
            <div class="flex gap-1">
              <dt>{{ fact.label }}:</dt>
              <dd class="font-medium text-white/90">{{ fact.value }}</dd>
            </div>
          }
        </dl>
      }

      <button (click)="viewReset.emit()" class="control">
        <span aria-hidden="true">⌂</span>
        <ng-container i18n="Returns the camera to its starting position. Very short — it sits in a crowded toolbar.@@viewer3d.resetCamera">Reset</ng-container>
      </button>
      <button
        (click)="wireframeToggled.emit()"
        class="control"
        [attr.aria-pressed]="wireframe"
        [class.bg-accent]="wireframe"
      >
        <span aria-hidden="true">⬡</span>
        <ng-container i18n="Toggles wireframe rendering, showing edges rather than solid faces. Very short — it sits in a crowded toolbar.@@viewer3d.wireframe">Wire</ng-container>
      </button>
      <button (click)="directionChosen.emit('top')" class="control">
        <span aria-hidden="true">⊤</span>
        <ng-container i18n="Snaps the camera to look straight down at the model. Very short — it sits in a crowded toolbar.@@viewer3d.viewTop">Top</ng-container>
      </button>
      <button (click)="directionChosen.emit('front')" class="control">
        <span aria-hidden="true">◫</span>
        <ng-container i18n="Snaps the camera to look at the model from the front. Very short — it sits in a crowded toolbar.@@viewer3d.viewFront">Front</ng-container>
      </button>
      <button (click)="directionChosen.emit('side')" class="control">
        <span aria-hidden="true">◧</span>
        <ng-container i18n="Snaps the camera to look at the model from the side. Very short — it sits in a crowded toolbar.@@viewer3d.viewSide">Side</ng-container>
      </button>
    </div>
  `,
  styles: [`
    /* min-height rather than padding alone: SC 2.5.8 puts the floor at
       24x24 CSS px, and these are the smallest controls in the product. */
    .control {
      font-size: .75rem;
      min-height: 24px;
      padding: .25rem .5rem;
      border-radius: .25rem;
      border: 1px solid rgb(255 255 255 / .3);
      background: rgb(255 255 255 / .1);
    }
    .control:hover { background: rgb(255 255 255 / .2); }
  `],
})
export class Viewer3dToolbarComponent {
  @Input() title = "";
  /** Element count, triangle count and schema, once the model is loaded. */
  @Input() facts: readonly ModelFact[] = [];
  @Input() wireframe = false;

  @Output() backRequested = new EventEmitter<void>();
  @Output() viewReset = new EventEmitter<void>();
  @Output() wireframeToggled = new EventEmitter<void>();
  @Output() directionChosen = new EventEmitter<ModelDirection>();
}

/** What the toolbar says the model is. */
export function factsAbout(data: ModelGeometry): ModelFact[] {
  return [
    {
      label: $localize`:How many building elements a model contains@@viewer3d.elementCount:Elements`,
      value: data.elementCount.toLocaleString(),
    },
    {
      label: $localize`:How many triangles the model's geometry is made of@@viewer3d.triangleCount:Triangles`,
      value: data.triangleCount.toLocaleString(),
    },
    {
      label: $localize`:Which version of the IFC data format the model uses. IFC and its schema names are identifiers, not words to translate.@@viewer3d.schema:Schema`,
      value: data.schema,
    },
  ];
}
