/**
 * The list of a drawing's layers, with what is showing and what is not.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from "@angular/core";

import { CadLayer } from "./cad-layers";

@Component({
  selector: "app-cad-layer-panel",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="w-56 bg-white border-s border-gray-200 flex flex-col flex-shrink-0">
      <div class="p-3 border-b border-gray-200 flex items-center justify-between">
        <h2
          i18n="Heading of the CAD drawing's layer panel@@cadViewer.layersHeading"
          class="text-xs font-semibold text-gray-600 uppercase tracking-wide"
        >
          Layers
        </h2>
        <div class="flex gap-1">
          <button
            (click)="allShown.emit()"
            i18n="Shows every layer. Very short — it shares a row with another control.@@cadViewer.showAllLayers"
            class="text-xs text-blue-600 hover:underline"
          >
            All
          </button>
          <span class="text-gray-300" aria-hidden="true">|</span>
          <button
            (click)="allHidden.emit()"
            i18n="Hides every layer. Very short — it shares a row with another control.@@cadViewer.hideAllLayers"
            class="text-xs text-gray-500 hover:underline"
          >
            None
          </button>
        </div>
      </div>
      <div class="flex-1 overflow-y-auto p-2">
        @for (layer of layers(); track layer.name) {
          <!-- A real checkbox, so its state is announced and it is reachable
               by tab. The div it replaces carried the tick as decoration
               only, which left a screen reader nothing to read. -->
          <label
            class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50"
            [class.cursor-pointer]="layer.selector !== null"
            [class.opacity-60]="layer.selector === null"
            [attr.title]="layer.selector === null ? cannotHideHint : null"
          >
            <input
              type="checkbox"
              class="w-4 h-4 flex-shrink-0 accent-current"
              [style.color]="layer.color"
              [checked]="layer.visible"
              [disabled]="layer.selector === null"
              (change)="toggled.emit(layer)"
            />
            <span
              class="w-3 h-3 rounded-sm flex-shrink-0"
              aria-hidden="true"
              [style.background]="layer.color"
            ></span>
            <span
              class="text-xs truncate flex-1"
              [class.text-gray-400]="!layer.visible"
              [class.text-gray-700]="layer.visible"
              >{{ layer.name }}</span
            >
            <span class="text-xs text-gray-400 flex-shrink-0">{{
              layer.count
            }}</span>
          </label>
        }

        @if (layers().length === 0) {
          <p
            i18n="Empty state for the layer panel of a drawing with no layers@@cadViewer.noLayers"
            class="text-xs text-gray-400 text-center py-6"
          >
            No layer data
          </p>
        }
      </div>
    </div>
  `,
})
export class CadLayerPanelComponent {
  layers = input.required<readonly CadLayer[]>();

  toggled = output<CadLayer>();
  allShown = output<void>();
  allHidden = output<void>();

  /**
   * Why a layer's control is disabled (§1.1 — a disabled state that teaches
   * beats a hidden control).
   *
   * <p>Some converters mark a layer only with a `<title>`, which gives
   * nothing to write a rule against. The layer can be listed but not hidden,
   * and saying so is better than a checkbox that unticks and changes nothing
   * on screen — which is what this used to do.
   */
  readonly cannotHideHint = $localize`:Tooltip on a layer whose visibility cannot be changed, because the drawing does not identify its parts in a way that can be selected@@cadViewer.layerNotHideable:This drawing does not label this layer in a way that lets it be hidden.`;

  /** How many layers are showing, for callers that want to report it. */
  visibleCount = computed(
    () => this.layers().filter((layer) => layer.visible).length,
  );
}
