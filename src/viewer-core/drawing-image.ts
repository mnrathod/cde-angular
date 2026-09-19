/**
 * Publishing an uploaded drawing as something the browser can safely render.
 *
 * <p>The drawing is our conversion service's rendering of a file someone
 * uploaded, so its text and its layer names come from that file. Putting it
 * on the page as markup means trusting every one of those — which is what
 * §5.12 bans `bypassSecurityTrustHtml` for, and what this viewer used to do.
 *
 * <p>An SVG loaded through `<img>` is rendered by the browser in a
 * restricted mode: no scripts, no event handlers, no external references, no
 * reach into this document. That is a guarantee the browser enforces rather
 * than a sanitiser we would have to keep correct, and it adds no dependency.
 * Verified against Chromium; held to by `cad-viewer.isolation.spec.ts`.
 *
 * <p>The cost is that no CSS on this page reaches inside the drawing, so
 * hiding a layer puts its rule into the SVG itself — which is why the
 * published bytes are recomputed whenever a layer is toggled, and why the
 * previous object URL has to be revoked when they are. Without that, every
 * toggle and every document open would leave a copy of the drawing alive for
 * the life of the tab, which on CAD files is megabytes at a time.
 */
import { Injectable, computed, effect, signal } from "@angular/core";

import { CadLayer, withLayersHidden } from "./cad-layers";

/**
 * How many layer names the drawing's alternative text lists.
 *
 * <p>A drawing can carry hundreds. Reading all of them aloud is not a
 * description, it is an obstacle — the point is to say what the drawing is.
 */
const MAX_LAYERS_DESCRIBED = 8;

@Injectable()
export class DrawingImage {
  /** The drawing's source, as the converter produced it. */
  readonly source = signal("");
  /** The layers found in it, and whether each is shown. */
  readonly layers = signal<CadLayer[]>([]);

  /** The drawing as an object URL, revoked when it is replaced. */
  readonly url = signal<string | null>(null);

  /** The drawing with hidden layers styled out, as a string. */
  private readonly published = computed(() =>
    withLayersHidden(this.source(), this.layers()),
  );

  constructor() {
    effect((onCleanup) => {
      const svg = this.published();
      if (!svg) {
        this.url.set(null);
        return;
      }
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      this.url.set(url);
      onCleanup(() => URL.revokeObjectURL(url));
    });
  }

  /** What a screen reader is told the image is (§1A.4). */
  readonly description = computed(() => {
    const named = this.layers().map((layer) => layer.name).filter(Boolean);
    if (!named.length) {
      return $localize`:Alternative text for a drawing whose layers could not be read, so there is nothing to name@@cadViewer.drawingAlone:Drawing`;
    }
    // A whole sentence with the count and the names as placeholders, rather
    // than three fragments joined with commas: the word order, the plural
    // agreement and the list separator are all different in other languages,
    // and none of them survives concatenation.
    const shown = named.slice(0, MAX_LAYERS_DESCRIBED).join(", ");
    return $localize`:Alternative text for a drawing, naming its layers. The first placeholder is how many layers there are in total, the second is the names of the first few@@cadViewer.drawingWithLayers:Drawing with ${named.length}:count: layers: ${shown}:names:`;
  });

  /** How many layers are currently shown. */
  readonly visibleCount = computed(
    () => this.layers().filter((layer) => layer.visible).length,
  );

  showOnly(layer: CadLayer, visible: boolean): void {
    this.layers.update((all) =>
      all.map((each) => (each.name === layer.name ? { ...each, visible } : each)),
    );
  }

  toggle(layer: CadLayer): void {
    this.showOnly(layer, !layer.visible);
  }

  showAll(): void {
    this.setAllVisible(true);
  }

  hideAll(): void {
    this.setAllVisible(false);
  }

  private setAllVisible(visible: boolean): void {
    this.layers.update((all) => all.map((each) => ({ ...each, visible })));
  }
}
