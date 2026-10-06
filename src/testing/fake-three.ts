/**
 * A stand-in for the three.js module namespace.
 *
 * <p>three.js is faked rather than loaded wherever the thing under test is our
 * own arithmetic or our own bookkeeping — where to put a camera given a model's
 * bounds, which material slot an element type occupies, whether a renderer was
 * disposed. Loading the real library would test WebGL, which is not in question,
 * and would need a GPU in CI.
 *
 * <p>It lives here rather than in one spec because two of them need it now, and
 * two private copies is how two suites come to be testing two slightly
 * different things while appearing to agree. The shapes it provides are only
 * those `buildModelScene` actually touches; anything it reaches for that is
 * missing will fail loudly, which is the behaviour wanted — a silent `undefined`
 * would let a scene build that never drew anything.
 */

/** The bounding-box extent the fake reports, in the model's own units. */
export const FAKE_MODEL_EXTENT = { x: 10, y: 4, z: 6 };

/** The largest of those dimensions, which is what camera framing works from. */
export const FAKE_MODEL_LARGEST_EXTENT = 10;

// `any` throughout: this stands in for an untyped module namespace, and giving
// the fake stricter types than the thing it replaces would mean maintaining a
// second declaration of three.js.
/* eslint-disable @typescript-eslint/no-explicit-any */
export function fakeThree() {
  const vector = () => ({
    x: 0,
    y: 0,
    z: 0,
    copy(other: any) {
      Object.assign(this, other);
    },
  });

  class Box3 {
    expandByObject() {
      return this;
    }
    getCenter(target: any) {
      return Object.assign(target, { x: 0, y: 0, z: 0 });
    }
    getSize(target: any) {
      return Object.assign(target, FAKE_MODEL_EXTENT);
    }
    min = { y: -2 };
  }

  return {
    WebGLRenderer: class {
      domElement = document.createElement("canvas");
      /** Recorded, because a canvas sized wrong is the sidebar drawn over. */
      size: { width: number; height: number } = { width: 0, height: 0 };
      disposed = false;
      setSize(width: number, height: number) {
        this.size = { width, height };
      }
      setPixelRatio() {}
      setClearColor() {}
      render() {}
      dispose() {
        this.disposed = true;
      }
    },
    Scene: class {
      add() {}
    },
    PerspectiveCamera: class {
      // Coordinates land on camera.position, exactly as three.js does it.
      position = {
        x: 0,
        y: 0,
        z: 0,
        set(x: number, y: number, z: number) {
          Object.assign(this, { x, y, z });
        },
      };
      aspect = 1;
      near = 0;
      far = 0;
      updateProjectionMatrix() {}
    },
    AmbientLight: class {},
    DirectionalLight: class {
      position = { set() {} };
    },
    OrbitControls: class {
      enableDamping = false;
      target = vector();
      update() {}
      dispose() {}
    },
    GridHelper: class {
      scale = { setScalar() {} };
      position = { y: 0 };
    },
    Mesh: class {
      constructor(
        public geometry: unknown,
        public material: unknown,
      ) {}
    },
    BufferGeometry: class {
      setAttribute() {}
      setIndex() {}
      addGroup() {}
    },
    BufferAttribute: class {},
    MeshPhongMaterial: class {
      wireframe = false;
      visible = true;
    },
    Color: class {},
    DoubleSide: 2,
    Box3,
    Vector3: function () {
      return vector();
    } as unknown as new () => unknown,
  };
}
