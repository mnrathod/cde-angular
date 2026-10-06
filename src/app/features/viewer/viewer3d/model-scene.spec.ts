/**
 * Where the camera goes.
 *
 * <p>Reset, Top, Front and Side were four buttons calling empty methods —
 * they looked like controls, announced themselves as controls, and moved
 * nothing. These tests are what say they now do what they claim.
 *
 * <p>three.js is faked rather than loaded. The arithmetic under test is
 * entirely ours: where to put a camera given a model's bounds. Loading a
 * real renderer would test WebGL, which is not in question, and would need
 * a GPU in CI.
 */
import { buildModelScene } from "./model-scene";
import { ModelGeometry } from "../../../../viewer-core/model-geometry";
import { FAKE_MODEL_LARGEST_EXTENT, fakeThree } from "../../../../testing/fake-three";

const GEOMETRY: ModelGeometry = {
  positions: new Float32Array([0, 0, 0]),
  normals: new Float32Array([0, 1, 0]),
  indices: new Uint32Array([0]),
  groups: [
    { type: "IfcWall", start: 0, count: 1, elementCount: 1, color: [1, 1, 1], opacity: 1 },
  ],
  vertexCount: 1,
  triangleCount: 1,
  elementCount: 1,
  schema: "IFC4",
  bounds: { min: [-5, -2, -3], max: [5, 2, 3] },
};

function sceneFor() {
  const three = fakeThree();
  const viewport = buildModelScene(
    three as unknown as never,
    document.createElement("canvas"),
    GEOMETRY,
    { width: 800, height: 600 },
  );
  const camera = viewport.camera as { position: { x: number; y: number; z: number } };
  return { viewport, at: camera.position };
}

describe("moving the camera around a model", () => {
  it("frames the whole model when the scene is built", () => {
    const { at } = sceneFor();

    // Offsets are multiples of the model's longest side, so a door handle
    // and a terminal building are both framed rather than one of them.
    expect(at.x).toBeCloseTo(FAKE_MODEL_LARGEST_EXTENT * 1.2);
    expect(at.z).toBeCloseTo(FAKE_MODEL_LARGEST_EXTENT * 1.2);
  });

  it("puts the camera back after it has been moved", () => {
    const { viewport, at } = sceneFor();
    viewport.lookFrom("top");

    viewport.resetView();

    expect(at.x).toBeCloseTo(FAKE_MODEL_LARGEST_EXTENT * 1.2);
    expect(at.y).toBeCloseTo(FAKE_MODEL_LARGEST_EXTENT * 0.8);
  });

  it("looks straight down for the top view", () => {
    const { viewport, at } = sceneFor();

    viewport.lookFrom("top");

    expect(at.y).toBeCloseTo(FAKE_MODEL_LARGEST_EXTENT * 2);
    expect(at.x).toBe(0);
  });

  it("stays a hair off the vertical, so the top view is not blank", () => {
    // Looking exactly down the up vector makes the orientation undefined —
    // the cross product is zero and three.js renders nothing at all.
    const { viewport, at } = sceneFor();

    viewport.lookFrom("top");

    expect(at.z).not.toBe(0);
    expect(Math.abs(at.z)).toBeLessThan(0.01);
  });

  it("looks along z for the front view", () => {
    const { viewport, at } = sceneFor();

    viewport.lookFrom("front");

    expect(at.z).toBeCloseTo(FAKE_MODEL_LARGEST_EXTENT * 2);
    expect(at.x).toBe(0);
    expect(at.y).toBe(0);
  });

  it("looks along x for the side view", () => {
    const { viewport, at } = sceneFor();

    viewport.lookFrom("side");

    expect(at.x).toBeCloseTo(FAKE_MODEL_LARGEST_EXTENT * 2);
    expect(at.z).toBe(0);
  });

  it("keeps looking at the model from wherever it is sent", () => {
    const { viewport } = sceneFor();

    viewport.lookFrom("side");

    const controls = viewport.controls as unknown as { target: { x: number } };
    expect(controls.target.x).toBe(0);
  });

  it("derives the clipping planes from the model's own size", () => {
    // A fixed pair either clips a building in half or z-fights on a handle.
    const { viewport } = sceneFor();
    const camera = viewport.camera as { near: number; far: number };

    expect(camera.near).toBeCloseTo(FAKE_MODEL_LARGEST_EXTENT * 0.001);
    expect(camera.far).toBeCloseTo(FAKE_MODEL_LARGEST_EXTENT * 100);
  });

  it("stops drawing when it is disposed", () => {
    const { viewport } = sceneFor();
    const cancel = vi.spyOn(globalThis, "cancelAnimationFrame");

    viewport.dispose();

    expect(cancel).toHaveBeenCalled();
    cancel.mockRestore();
  });
});
