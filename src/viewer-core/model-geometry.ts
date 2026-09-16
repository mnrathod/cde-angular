/**
 * Reads the binary geometry container the conversion service produces.
 *
 * The payload used to be JSON with four base64 strings in it. Two of those
 * bytes in three were transfer spent re-encoding numbers that were already
 * bytes, and one of the four — a float32x3 colour repeated for every vertex —
 * encoded a property of the element type rather than of the vertex. On a
 * million-vertex model that combination cost tens of megabytes.
 *
 * Now the arrays arrive as bytes and the colour arrives once per type, in a
 * group table. A group names a contiguous run of the index buffer, which is
 * what a renderer needs to draw that type with its own material — and what
 * makes hiding one possible at all, since a single baked-in vertex colour
 * cannot be un-drawn.
 *
 * No rendering here and no I/O: this turns bytes into plain arrays, so it can
 * be tested without a WebGL context and used by any caller. The layout is
 * defined by `encode_geometry_container` in the conversion service.
 */

/** `CDEG`, as the first four bytes of every container. */
const MAGIC = 'CDEG';

/** The only layout this reader understands. */
const SUPPORTED_VERSION = 1;

const HEADER_OFFSET = 12;

/** One element type's run of the index buffer, and how to paint it. */
export interface ModelGeometryGroup {
  /** The IFC type, e.g. `IfcWall`. Shown in the UI and used to toggle it. */
  readonly type: string;
  /** Offset into the index buffer — **indices, not vertices**. */
  readonly start: number;
  /** Length of the run, again in indices. */
  readonly count: number;
  /**
   * How many elements of this type the model holds.
   *
   * <p>Not to be confused with {@link count}, which is an index count — a
   * single wall is hundreds of indices. This is what the model tree shows as
   * a quantity, and it is counted by the extractor rather than derived here.
   *
   * <p>Zero for a container written before the extractor carried it, which is
   * why the tree treats zero as "unknown" and shows no badge rather than
   * claiming there are none.
   */
  readonly elementCount: number;
  /** Linear RGB, each channel 0–1. */
  readonly color: readonly [number, number, number];
  /** 1 is opaque. Carried per type because e.g. glazing is not. */
  readonly opacity: number;
}

export interface ModelGeometry {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly indices: Uint32Array;
  readonly groups: readonly ModelGeometryGroup[];
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly elementCount: number;
  readonly schema: string;
  readonly bounds: { readonly min: readonly number[]; readonly max: readonly number[] };
}

/** Thrown for anything that is not a container this reader can read. */
export class ModelGeometryFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelGeometryFormatError';
  }
}

/**
 * Decode one container.
 *
 * Throws `ModelGeometryFormatError` rather than returning a half-built model.
 * A truncated buffer that still parsed would put a partial building on screen
 * with no indication anything was missing, which is worse than an error the
 * caller can show.
 */
export function decodeGeometryContainer(buffer: ArrayBuffer): ModelGeometry {
  if (buffer.byteLength < HEADER_OFFSET) {
    throw new ModelGeometryFormatError(
      `Model data is too short to be geometry (${buffer.byteLength} bytes).`);
  }

  const magic = new TextDecoder().decode(new Uint8Array(buffer, 0, 4));
  if (magic !== MAGIC) {
    throw new ModelGeometryFormatError(
      `Model data is not geometry — expected ${MAGIC}, got "${magic}".`);
  }

  const framing = new DataView(buffer);
  const version = framing.getUint32(4, true);
  if (version !== SUPPORTED_VERSION) {
    throw new ModelGeometryFormatError(
      `Model geometry is version ${version}; this viewer reads version ${SUPPORTED_VERSION}.`);
  }

  const headerLength = framing.getUint32(8, true);
  if (HEADER_OFFSET + headerLength > buffer.byteLength) {
    throw new ModelGeometryFormatError('Model geometry header is truncated.');
  }

  const header = JSON.parse(
    new TextDecoder().decode(new Uint8Array(buffer, HEADER_OFFSET, headerLength)),
  ) as Omit<ModelGeometry, 'positions' | 'normals' | 'indices'>;

  // Mirrors the writer's padding. Both `Float32Array` and `Uint32Array` throw
  // on a byteOffset that is not a multiple of four, so this is load-bearing
  // rather than tidiness.
  let offset = HEADER_OFFSET + headerLength + ((-headerLength) % 4 + 4) % 4;

  const vertexFloats = header.vertexCount * 3;
  const indexCount = header.triangleCount * 3;
  const expected = (vertexFloats * 2 + indexCount) * 4;
  if (buffer.byteLength - offset < expected) {
    throw new ModelGeometryFormatError(
      `Model geometry is truncated — the header declares ${header.vertexCount} vertices `
      + `and ${header.triangleCount} triangles, which needs ${expected} bytes of buffers `
      + `but only ${buffer.byteLength - offset} arrived.`);
  }

  const positions = new Float32Array(buffer, offset, vertexFloats);
  offset += vertexFloats * 4;
  const normals = new Float32Array(buffer, offset, vertexFloats);
  offset += vertexFloats * 4;
  const indices = new Uint32Array(buffer, offset, indexCount);

  return { ...header, groups: header.groups.map(withElementCount),
           positions, normals, indices };
}

/**
 * Fills in a group's element count when the writer did not send one.
 *
 * <p>The header is otherwise spread straight into the result, which would
 * leave `elementCount` undefined for a container written before the extractor
 * counted elements — while the declared type says `number`. A type that lies
 * is worse than a missing field, because the reader of it stops checking. Zero
 * is the honest value: the tree reads it as "not known" and shows no quantity,
 * rather than claiming the model contains none.
 */
function withElementCount(group: ModelGeometryGroup): ModelGeometryGroup {
  return { ...group, elementCount: group.elementCount ?? 0 };
}
