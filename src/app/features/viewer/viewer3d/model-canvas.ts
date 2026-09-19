/**
 * The three.js canvas: loading the renderer, building the scene, keeping it
 * the right size, and giving the GPU back.
 *
 * <p>Out of the component because a component that also owns a renderer, a
 * dynamic import and a window listener is a component with four jobs, and
 * the listener is the one that went wrong: it was registered inside the
 * scene build and removed nowhere, so opening a second model left the first
 * still listening, and resizing a renderer that had been disposed.
 */
import { Injectable } from "@angular/core";

import { ModelGeometry, ModelGeometryGroup } from "../../../../viewer-core/model-geometry";
import { ModelDirection, ModelViewport, buildModelScene } from "./model-scene";

/** Sidebar width, which the canvas has to make room for. */
const SIDEBAR_WIDTH_PX = 208;

/** The two elements the scene is drawn into. Absent until the view exists. */
export interface CanvasElements {
  canvas?: HTMLCanvasElement;
  /** The box the canvas fills, which is what a resize measures. */
  wrap?: HTMLElement;
}

@Injectable()
export class ModelCanvas {
  /** The group table of the model on screen, in material-slot order. */
  groups: readonly ModelGeometryGroup[] = [];

  private viewport: ModelViewport | null = null;
  private elements: () => CanvasElements = () => ({});
  private stopWatchingResize?: () => void;
  /** The three.js module namespace, loaded on first use. */
  private threeJs: any = null;

  /** Told once, by the component that owns this canvas. */
  bindTo(elements: () => CanvasElements): void {
    this.elements = elements;
  }

  /**
   * Loads the renderer from the bundle on first use.
   *
   * <p>Three.js is ~600 KB, far past the 100 KB route-chunk budget, so it is
   * split into its own chunk with a dynamic import and fetched only when
   * someone actually opens a model — most sessions never do.
   *
   * <p>It is imported rather than fetched from a CDN. A remote script runs
   * with full privileges on this origin, so a compromised or hijacked CDN
   * would own every session; there is no SRI to fall back on; the strict CSP
   * refuses the request anyway; and an air-gapped deployment has no route to
   * the CDN at all.
   */
  async prepare(): Promise<void> {
    if (this.threeJs) return;
    const [three, orbit] = await Promise.all([
      import("three"),
      import("three/examples/jsm/controls/OrbitControls.js"),
    ]);
    this.threeJs = { ...three, OrbitControls: orbit.OrbitControls };
  }

  /** Draws a model, and starts keeping the canvas the size of its box. */
  show(geometry: ModelGeometry): void {
    const canvas = this.elements().canvas;
    if (!this.threeJs || !canvas) return;

    // Kept in material-slot order: a group's position here is the
    // materialIndex the scene gave it, and a visibility change resolves an
    // element type to those same slots.
    this.groups = geometry.groups;
    this.viewport = buildModelScene(
      this.threeJs, canvas, geometry, this.sizeOfBox());
    this.watchForResize();
  }

  /** The materials drawing the model, one per element type. */
  private materials(): unknown[] | null {
    const materials = this.viewport?.mesh?.material;
    return Array.isArray(materials) ? materials : null;
  }

  /**
   * Shows or hides the runs of geometry in the given material slots.
   *
   * <p>Hiding a group's material is what stops three.js drawing that run —
   * the renderer skips any group whose material is not visible. Verified
   * against a real WebGL context before this was relied on: two groups drawn
   * side by side, one material hidden, and only that half of the canvas
   * cleared.
   */
  setSlotsVisible(slots: readonly number[], visible: boolean): void {
    const materials = this.materials();
    if (!materials) return;
    for (const slot of slots) {
      (materials[slot] as { visible: boolean }).visible = visible;
    }
  }

  /**
   * Draws edges rather than solid faces, or stops.
   *
   * <p>Every material, because there is one per element type now. It was a
   * single material while every vertex carried its own baked colour.
   */
  setWireframe(on: boolean): void {
    const mesh = this.viewport?.mesh;
    if (!mesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      (material as { wireframe: boolean }).wireframe = on;
    }
  }

  resetView(): void {
    this.viewport?.resetView();
  }

  lookFrom(direction: ModelDirection): void {
    this.viewport?.lookFrom(direction);
  }

  /** The space the canvas has, once the sidebar has taken its share. */
  private sizeOfBox(): { width: number; height: number } {
    const wrap = this.elements().wrap;
    return {
      width: (wrap?.clientWidth ?? 0) - SIDEBAR_WIDTH_PX,
      height: wrap?.clientHeight ?? 0,
    };
  }

  private watchForResize(): void {
    if (this.stopWatchingResize) return;
    const onResize = () => {
      const size = this.sizeOfBox();
      this.viewport?.resize(size.width, size.height);
    };
    window.addEventListener("resize", onResize);
    this.stopWatchingResize = () =>
      window.removeEventListener("resize", onResize);
  }

  dispose(): void {
    this.stopWatchingResize?.();
    this.stopWatchingResize = undefined;
    this.viewport?.dispose();
    this.viewport = null;
  }
}
