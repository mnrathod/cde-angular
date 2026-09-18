/**
 * Building the three.js scene a model is drawn into.
 *
 * <p>Out of the component because it is the longest thing in it and none of
 * it is Angular: a canvas, some geometry and a camera in, a viewport out.
 * The component keeps what happens to the scene afterwards — selection,
 * visibility, the controls a user presses.
 *
 * <p>three.js is loaded dynamically (§7.3) and typed as `any` here for the
 * same reason it is in the component: the library is fetched at runtime and
 * there is no import to take types from without pulling it into the initial
 * bundle, which §7.1 caps at 250 KB.
 */
import {
  ModelGeometry,
  ModelGeometryGroup,
} from "../../../../viewer-core/model-geometry";

/** Everything the component needs to keep hold of after the scene is built. */
export interface ModelViewport {
  renderer: { dispose(): void; render(scene: unknown, camera: unknown): void };
  scene: unknown;
  camera: unknown;
  controls: { update(): void };
  mesh: { material: unknown };
  wireframe: boolean;
  /** The size the canvas should be, recomputed on a resize. */
  resize(width: number, height: number): void;
  /** Stops the animation loop and releases the GPU resources. */
  dispose(): void;
}

/** Where the camera starts before a model has told it otherwise. */
const OPENING_CAMERA_POSITION = [20, 15, 20] as const;

/**
 * Builds the scene and starts drawing it.
 *
 * <p>The returned viewport owns its own animation loop and its own teardown:
 * the component previously added a `resize` listener per build and removed
 * none of them, so opening a second model left the first still listening and
 * resizing a renderer that had been disposed.
 */
export function buildModelScene(
  threeJs: any,
  canvas: HTMLCanvasElement,
  geometry: ModelGeometry,
  size: { width: number; height: number },
): ModelViewport {
  const three = threeJs;

  const renderer = new three.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(size.width, size.height);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x13151f);

  const scene = new three.Scene();
  const camera = new three.PerspectiveCamera(
    45,
    size.width / size.height,
    0.01,
    100000,
  );
  camera.position.set(...OPENING_CAMERA_POSITION);

  scene.add(new three.AmbientLight(0xffffff, 0.6));
  const sun = new three.DirectionalLight(0xffffff, 0.8);
  sun.position.set(50, 100, 50);
  scene.add(sun);

  const controls = new three.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  const grid = new three.GridHelper(100, 20, 0x333344, 0x222233);
  scene.add(grid);

  const mesh = new three.Mesh(
    bufferGeometryFrom(three, geometry),
    materialsFor(three, geometry.groups),
  );
  scene.add(mesh);

  frameModel(three, { camera, controls, grid, mesh });

  let frame: number | null = null;
  const draw = () => {
    frame = requestAnimationFrame(draw);
    controls.update();
    renderer.render(scene, camera);
  };
  draw();

  return {
    renderer,
    scene,
    camera,
    controls,
    mesh,
    wireframe: false,
    resize(width: number, height: number) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    },
    dispose() {
      if (frame !== null) cancelAnimationFrame(frame);
      controls.dispose?.();
      renderer.dispose();
    },
  };
}

/** The model's triangles, as three.js wants them. */
function bufferGeometryFrom(three: any, geometry: ModelGeometry) {
  const buffers = new three.BufferGeometry();
  buffers.setAttribute(
    "position",
    new three.BufferAttribute(geometry.positions, 3),
  );
  buffers.setAttribute("normal", new three.BufferAttribute(geometry.normals, 3));
  buffers.setIndex(new three.BufferAttribute(geometry.indices, 1));

  /*
   * One group and one material per element type, rather than one material
   * over a baked per-vertex colour.
   *
   * The colour is the same information either way, but it used to be tiled
   * across every vertex — twelve bytes each to say "this is a wall" — and
   * once baked in it could not be changed or hidden, which is why the layer
   * toggles in this viewer's own UI never did anything. The group offsets
   * are index offsets; three.js expects exactly that on indexed geometry,
   * and vertex offsets there would silently draw the wrong runs.
   */
  geometry.groups.forEach((group: ModelGeometryGroup, index: number) =>
    buffers.addGroup(group.start, group.count, index),
  );
  return buffers;
}

/**
 * One material per element type, in slot order.
 *
 * <p>A group's position here is the `materialIndex` its geometry group was
 * given, and the visibility handler resolves a tree node to those same slots.
 */
function materialsFor(three: any, groups: readonly ModelGeometryGroup[]) {
  return groups.map(
    (group) =>
      new three.MeshPhongMaterial({
        color: new three.Color(group.color[0], group.color[1], group.color[2]),
        side: three.DoubleSide,
        shininess: 30,
        transparent: group.opacity < 1,
        opacity: group.opacity,
      }),
  );
}

/** Points the camera at the model and sizes the grid under it. */
function frameModel(
  three: any,
  parts: { camera: any; controls: any; grid: any; mesh: any },
): void {
  const { camera, controls, grid, mesh } = parts;
  const box = new three.Box3().expandByObject(mesh);
  const centre = box.getCenter(new three.Vector3());
  const extent = box.getSize(new three.Vector3());
  const largest = Math.max(extent.x, extent.y, extent.z);

  camera.position.set(
    centre.x + largest * 1.2,
    centre.y + largest * 0.8,
    centre.z + largest * 1.2,
  );
  controls.target.copy(centre);
  // Near and far derived from the model's own size: a fixed pair either
  // clips a building in half or z-fights on a door handle.
  camera.near = largest * 0.001;
  camera.far = largest * 100;
  camera.updateProjectionMatrix();

  grid.scale.setScalar(largest / 10);
  grid.position.y = box.min.y;
}
