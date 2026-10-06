/**
 * The three.js canvas: loading the renderer, building the scene, keeping it the
 * right size, and giving the GPU back.
 *
 * <p>This exists as its own object because a component that also owns a
 * renderer, a dynamic import and a window listener is a component with four
 * jobs — and the listener is the one that went wrong. It was registered inside
 * the scene build and removed nowhere, so opening a second model left the first
 * still listening, and resizing a renderer that had already been disposed.
 *
 * <p>three.js is faked, and the real `buildModelScene` runs against the fake.
 * Two reasons: an ES module export cannot be replaced at runtime, and stubbing
 * the builder would step over the thing half of these assertions depend on — it
 * is the builder that decides which material slot each element type lands in,
 * and hiding an element type resolves to those slots.
 *
 * <p>Two of the behaviours asserted here are not about three.js at all.
 *
 * <p>**The renderer is imported, never fetched from a CDN.** A remote script
 * runs with full privileges on this origin, so a hijacked CDN would own every
 * session; there is no SRI to fall back on; the strict CSP (§5.4) refuses the
 * request; and an air-gapped deployment (§9.3) has no route to it. So loading is
 * asserted to be lazy and idempotent — the chunk is ~600KB against a 100KB
 * route budget (§7.1), and most sessions never open a model.
 *
 * <p>**Disposal has to be complete.** A WebGL context is not garbage: the
 * browser allows a small number of them, and a viewer that leaks one per model
 * stops rendering entirely after a handful of documents, with no error anywhere.
 */
import { TestBed } from "@angular/core/testing";

import { ModelGeometry, ModelGeometryGroup } from "../../../../viewer-core/model-geometry";
import { fakeThree } from "../../../../testing/fake-three";
import { ModelCanvas } from "./model-canvas";

function group(type: string, start: number, count: number): ModelGeometryGroup {
  return { type, start, count, elementCount: 1, color: [0.5, 0.5, 0.5], opacity: 1 };
}

function geometry(groups: ModelGeometryGroup[] = [group("IfcWall", 0, 3)]): ModelGeometry {
  return {
    positions: new Float32Array([0, 0, 0]),
    normals: new Float32Array([0, 1, 0]),
    indices: new Uint32Array([0]),
    groups,
    vertexCount: 1,
    triangleCount: 1,
    elementCount: groups.length,
    schema: "IFC4",
    bounds: { min: [-5, -2, -3], max: [5, 2, 3] },
  };
}

describe("ModelCanvas", () => {
  let model: ModelCanvas;
  let canvas: HTMLCanvasElement;
  let wrap: HTMLElement;

  /** Gives the canvas a loaded renderer without fetching three.js. */
  function pretendLoaded(): void {
    (model as unknown as { threeJs: unknown }).threeJs = fakeThree();
  }

  /** The viewport the last `show()` built, read through the private field. */
  function viewport(): {
    mesh: { material: unknown };
    renderer: { size: { width: number; height: number }; disposed: boolean };
    camera: { position: { x: number; y: number; z: number } };
  } | null {
    return (model as unknown as { viewport: never }).viewport;
  }

  function materials(): Array<{ visible: boolean; wireframe: boolean }> {
    const material = viewport()!.mesh.material;
    return (Array.isArray(material) ? material : [material]) as Array<{
      visible: boolean;
      wireframe: boolean;
    }>;
  }

  function cameraAt(): { x: number; y: number; z: number } {
    const { x, y, z } = viewport()!.camera.position;
    return { x, y, z };
  }

  function threeTypes(count: number): ModelGeometryGroup[] {
    return [group("IfcWall", 0, 1), group("IfcDoor", 1, 1), group("IfcSlab", 2, 1)].slice(
      0,
      count,
    );
  }

  function boxWidthIs(width: number): void {
    Object.defineProperty(wrap, "clientWidth", { value: width, configurable: true });
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ModelCanvas] });
    model = TestBed.inject(ModelCanvas);

    canvas = globalThis.document.createElement("canvas");
    wrap = globalThis.document.createElement("div");
    boxWidthIs(1200);
    Object.defineProperty(wrap, "clientHeight", { value: 800, configurable: true });
    model.bindTo(() => ({ canvas, wrap }));
  });

  describe("loading the renderer", () => {
    it("has not loaded it before anyone opens a model", () => {
      // §7.1: the chunk is ~600KB against a 100KB route budget, and most
      // sessions never open a model at all.
      expect((model as unknown as { threeJs: unknown }).threeJs).toBeNull();
    });

    it("does not load it twice", async () => {
      // prepare() is called on every open. A second import would be harmless for
      // correctness and visible on a slow connection.
      pretendLoaded();
      const first = (model as unknown as { threeJs: unknown }).threeJs;

      await model.prepare();

      expect((model as unknown as { threeJs: unknown }).threeJs).toBe(first);
    });
  });

  describe("drawing a model", () => {
    it("builds a scene", () => {
      pretendLoaded();

      model.show(geometry());

      expect(viewport()).not.toBeNull();
    });

    it("draws nothing before the renderer has loaded", () => {
      // show() is reachable before prepare() settles. Building a scene with no
      // three.js would throw inside a render loop, where nothing catches it.
      model.show(geometry());

      expect(viewport()).toBeNull();
    });

    it("draws nothing when the view does not exist yet", () => {
      // The canvas arrives with the view. Asking earlier used to no-op silently,
      // which is why models never painted.
      pretendLoaded();
      model.bindTo(() => ({}));

      model.show(geometry());

      expect(viewport()).toBeNull();
    });

    it("keeps the group table in material-slot order", () => {
      // A group's position in this list *is* the materialIndex the scene gave it,
      // and hiding an element type resolves to those same slots. Sorting or
      // filtering this list would hide the wrong geometry.
      pretendLoaded();
      const groups = threeTypes(3);

      model.show(geometry(groups));

      expect(model.groups).toEqual(groups);
    });

    it("gives each element type its own material", () => {
      // One material per type is what makes a type hideable at all — the
      // renderer skips a group whose material is not visible, and there is
      // nothing finer than a material to switch off.
      pretendLoaded();

      model.show(geometry(threeTypes(3)));

      expect(materials()).toHaveLength(3);
    });

    it("makes room for the sidebar rather than drawing under it", () => {
      // The canvas fills its box, and the box includes the sidebar's width. A
      // scene sized to the whole box puts its right-hand edge — and whatever the
      // reader was looking at there — behind the panel.
      pretendLoaded();

      model.show(geometry());

      expect(viewport()!.renderer.size).toEqual({ width: 1200 - 208, height: 800 });
    });

    it("copes with a box that has not been laid out yet", () => {
      // clientWidth is 0 before layout, so the width goes negative. Throwing
      // here would lose the model; the next resize corrects the size.
      pretendLoaded();
      boxWidthIs(0);
      Object.defineProperty(wrap, "clientHeight", { value: 0, configurable: true });

      expect(() => model.show(geometry())).not.toThrow();
    });

    it("frames the model when it opens, rather than starting inside it", () => {
      // A camera at the origin of a building is a camera inside a wall, which
      // renders as a blank canvas and reads as a model that failed to load.
      pretendLoaded();

      model.show(geometry());

      expect(cameraAt()).not.toEqual({ x: 0, y: 0, z: 0 });
    });
  });

  describe("hiding an element type", () => {
    beforeEach(() => {
      pretendLoaded();
      model.show(geometry(threeTypes(3)));
    });

    it("hides the slots it was given and no others", () => {
      model.setSlotsVisible([1], false);

      expect(materials().map((material) => material.visible)).toEqual([true, false, true]);
    });

    it("shows them again", () => {
      model.setSlotsVisible([1], false);

      model.setSlotsVisible([1], true);

      expect(materials()[1]!.visible).toBe(true);
    });

    it("hides several at once", () => {
      // An element type can span more than one slot once the model is federated.
      model.setSlotsVisible([0, 2], false);

      expect(materials().map((material) => material.visible)).toEqual([false, true, false]);
    });

    it("does nothing when asked for no slots", () => {
      model.setSlotsVisible([], false);

      expect(materials().every((material) => material.visible)).toBe(true);
    });

    it("does nothing when there is no model on screen", () => {
      // The visibility panel outlives the model: closing one document and
      // toggling a type before the next has loaded must not throw.
      model.dispose();

      expect(() => model.setSlotsVisible([0], false)).not.toThrow();
    });
  });

  describe("drawing edges instead of faces", () => {
    beforeEach(() => {
      pretendLoaded();
      model.show(geometry(threeTypes(3)));
    });

    it("turns wireframe on across every material", () => {
      // One material per element type now. Setting it on the first alone leaves
      // most of the model solid, which looks like a half-applied setting. It was
      // a single material while every vertex carried its own baked colour.
      model.setWireframe(true);

      expect(materials().every((material) => material.wireframe)).toBe(true);
    });

    it("turns it off again", () => {
      model.setWireframe(true);

      model.setWireframe(false);

      expect(materials().every((material) => !material.wireframe)).toBe(true);
    });

    it("does nothing when there is no model on screen", () => {
      model.dispose();

      expect(() => model.setWireframe(true)).not.toThrow();
    });
  });

  describe("moving the camera", () => {
    it("puts it back where it started", () => {
      // Reset, Top, Front and Side were once four buttons calling empty methods:
      // they looked like controls, announced themselves as controls, and moved
      // nothing.
      pretendLoaded();
      model.show(geometry());
      const opening = cameraAt();
      model.lookFrom("top");
      expect(cameraAt()).not.toEqual(opening);

      model.resetView();

      expect(cameraAt()).toEqual(opening);
    });

    it("looks straight down from the top", () => {
      pretendLoaded();
      model.show(geometry());

      model.lookFrom("top");

      expect(cameraAt().y).toBeGreaterThan(0);
      expect(cameraAt().x).toBe(0);
    });

    it("each direction is a different place", () => {
      // Three buttons that moved the camera to the same spot would look like
      // three working controls and be one.
      pretendLoaded();
      model.show(geometry());

      const seen = new Set<string>();
      for (const direction of ["top", "front", "side"] as const) {
        model.lookFrom(direction);
        seen.add(JSON.stringify(cameraAt()));
      }

      expect(seen.size).toBe(3);
    });

    it("does nothing before a model is on screen", () => {
      // The view controls render alongside the canvas, so they are reachable
      // while the model is still loading.
      expect(() => model.resetView()).not.toThrow();
      expect(() => model.lookFrom("top")).not.toThrow();
    });
  });

  describe("keeping the canvas the size of its box", () => {
    it("resizes the renderer when the window changes", () => {
      pretendLoaded();
      model.show(geometry());
      boxWidthIs(1000);

      window.dispatchEvent(new Event("resize"));

      expect(viewport()!.renderer.size).toEqual({ width: 1000 - 208, height: 800 });
    });

    it("watches once, not once per model", () => {
      // The defect this file was extracted for: the listener was registered
      // inside the scene build, so each model added another — and each of them
      // resized whichever renderer it had closed over, including disposed ones.
      pretendLoaded();
      model.show(geometry());
      const first = viewport()!;
      model.show(geometry());
      boxWidthIs(900);

      window.dispatchEvent(new Event("resize"));

      expect(first.renderer.size.width).not.toBe(900 - 208);
      expect(viewport()!.renderer.size.width).toBe(900 - 208);
    });

    it("stops watching once the canvas is gone", () => {
      // Resizing a disposed renderer is the other half of the same defect.
      pretendLoaded();
      model.show(geometry());
      const built = viewport()!;
      const sizeWhenDisposed = { ...built.renderer.size };

      model.dispose();
      boxWidthIs(700);
      window.dispatchEvent(new Event("resize"));

      expect(built.renderer.size).toEqual(sizeWhenDisposed);
    });
  });

  describe("giving the GPU back", () => {
    it("disposes the renderer", () => {
      // A WebGL context is not garbage: the browser allows a small number of
      // them, and leaking one per model means the viewer silently stops
      // rendering after a handful of documents.
      pretendLoaded();
      model.show(geometry());
      const built = viewport()!;

      model.dispose();

      expect(built.renderer.disposed).toBe(true);
    });

    it("forgets the viewport, so nothing can reach the disposed context", () => {
      pretendLoaded();
      model.show(geometry());

      model.dispose();

      expect(viewport()).toBeNull();
    });

    it("can be disposed twice without failing", () => {
      // Angular calls ngOnDestroy once, but a navigation that races a load can
      // reach this before a model was ever shown.
      pretendLoaded();
      model.show(geometry());
      model.dispose();

      expect(() => model.dispose()).not.toThrow();
    });

    it("can be disposed before anything was shown", () => {
      expect(() => model.dispose()).not.toThrow();
    });

    it("lets a later model be shown and watched again", () => {
      // Disposal clears the listener, so the next model has to re-register it —
      // otherwise the second document opens with a canvas that never resizes.
      pretendLoaded();
      model.show(geometry());
      model.dispose();

      model.show(geometry());
      boxWidthIs(600);
      window.dispatchEvent(new Event("resize"));

      expect(viewport()!.renderer.size.width).toBe(600 - 208);
    });
  });
});
