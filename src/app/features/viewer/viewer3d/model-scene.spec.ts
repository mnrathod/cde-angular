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

/** A 10 x 4 x 6 box centred on the origin, in the model's own units. */
const EXTENT = { x: 10, y: 4, z: 6 };
const LARGEST = 10;

function fakeThree() {
  const vector = () => ({ x: 0, y: 0, z: 0, copy(other: any) { Object.assign(this, other); } });
  class Box3 {
    expandByObject() { return this; }
    getCenter(target: any) { return Object.assign(target, { x: 0, y: 0, z: 0 }); }
    getSize(target: any) { return Object.assign(target, EXTENT); }
    min = { y: -2 };
  }
  return {
    WebGLRenderer: class {
      domElement = document.createElement("canvas");
      setSize() {} setPixelRatio() {} setClearColor() {} render() {} dispose() {}
    },
    Scene: class { add() {} },
    PerspectiveCamera: class {
      // Coordinates land on camera.position, exactly as three.js does it.
      position = {
        x: 0, y: 0, z: 0,
        set(x: number, y: number, z: number) { Object.assign(this, { x, y, z }); },
      };
      aspect = 1; near = 0; far = 0;
      updateProjectionMatrix() {}
    },
    AmbientLight: class {},
    DirectionalLight: class { position = { set() {} }; },
    OrbitControls: class {
      enableDamping = false;
      target = vector();
      update() {} dispose() {}
    },
    GridHelper: class { scale = { setScalar() {} }; position = { y: 0 }; },
    Mesh: class { constructor(public geometry: unknown, public material: unknown) {} },
    BufferGeometry: class { setAttribute() {} setIndex() {} addGroup() {} },
    BufferAttribute: class {},
    MeshPhongMaterial: class { wireframe = false; visible = true; },
    Color: class {},
    DoubleSide: 2,
    Box3,
    Vector3: function () { return vector(); } as unknown as new () => unknown,
  };
}

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
    expect(at.x).toBeCloseTo(LARGEST * 1.2);
    expect(at.z).toBeCloseTo(LARGEST * 1.2);
  });

  it("puts the camera back after it has been moved", () => {
    const { viewport, at } = sceneFor();
    viewport.lookFrom("top");

    viewport.resetView();

    expect(at.x).toBeCloseTo(LARGEST * 1.2);
    expect(at.y).toBeCloseTo(LARGEST * 0.8);
  });

  it("looks straight down for the top view", () => {
    const { viewport, at } = sceneFor();

    viewport.lookFrom("top");

    expect(at.y).toBeCloseTo(LARGEST * 2);
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

    expect(at.z).toBeCloseTo(LARGEST * 2);
    expect(at.x).toBe(0);
    expect(at.y).toBe(0);
  });

  it("looks along x for the side view", () => {
    const { viewport, at } = sceneFor();

    viewport.lookFrom("side");

    expect(at.x).toBeCloseTo(LARGEST * 2);
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

    expect(camera.near).toBeCloseTo(LARGEST * 0.001);
    expect(camera.far).toBeCloseTo(LARGEST * 100);
  });

  it("stops drawing when it is disposed", () => {
    const { viewport } = sceneFor();
    const cancel = vi.spyOn(globalThis, "cancelAnimationFrame");

    viewport.dispose();

    expect(cancel).toHaveBeenCalled();
    cancel.mockRestore();
  });
});
