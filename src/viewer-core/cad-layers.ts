/**
 * Reading the layers out of a converted CAD drawing, and hiding them again.
 *
 * <p>Pure functions over the drawing's text, kept out of the component
 * because this is the part with the decisions in it: three different
 * conventions for what a layer looks like, depending on which converter
 * produced the file, and a hiding rule that has to match whichever one was
 * found.
 *
 * <p>That last part was where the bug was. Layers were discovered three ways
 * but hidden one way — `[data-layer="NAME"]` — so a drawing whose layers came
 * from `class="layer-NAME"` got a rule matching nothing: the checkbox
 * unticked and the layer stayed on screen. The selector is now recorded
 * alongside the layer by whichever rule found it.
 */

/** One layer of a drawing, as the panel shows it. */
export interface CadLayer {
  name: string;
  color: string;
  visible: boolean;
  count: number;
  /**
   * How to select this layer's elements inside the drawing, or null when the
   * convention it was found by gives nothing to select on. A layer with no
   * selector cannot be hidden, and the panel says so rather than offering a
   * control that does nothing.
   */
  selector: string | null;
}

/** A drawing with no usable viewBox still has to render at some size. */
const FALLBACK_VIEW_BOX = "0 0 800 600";

/**
 * The drawing's own coordinate space, so the markup overlay lines up with it
 * at any zoom or pan.
 */
export function readViewBox(svgText: string): string {
  const root = parseSvg(svgText);
  if (!root) return FALLBACK_VIEW_BOX;

  const viewBox = root.getAttribute("viewBox");
  if (viewBox?.trim()) return viewBox;

  const width = parseFloat(root.getAttribute("width") || "") || 800;
  const height = parseFloat(root.getAttribute("height") || "") || 600;
  return `0 0 ${width} ${height}`;
}

/** The width and height a viewBox describes, or a page-sized fallback. */
export function sizeOfViewBox(viewBox: string): [number, number] {
  const parts = viewBox.trim().split(/\s+/).map(Number);
  const [, , width, height] = parts;
  // The viewBox comes from a converted drawing, so a malformed one is an
  // input problem rather than an impossible state. Falling back to a sensible
  // page size renders something a user can see, which beats an exception.
  const usable =
    parts.length === 4 &&
    width !== undefined &&
    height !== undefined &&
    !isNaN(width) &&
    !isNaN(height) &&
    width > 0 &&
    height > 0;
  return usable ? [width, height] : [800, 600];
}

/**
 * Every layer in a drawing, by whichever convention its converter used.
 *
 * <p>Three are recognised, in order of how reliably they identify a layer:
 * a group marked `data-layer` or `id="layer:NAME"`, elements carrying
 * `class="layer-NAME"` as ezdxf writes them, and — only when neither found
 * anything — a group with a `<title>`, which is a common DXF convention but
 * gives nothing to write a CSS rule against.
 */
export function readLayers(svgText: string): CadLayer[] {
  const root = parseSvg(svgText);
  if (!root) return [];

  const found = new Map<string, { color: string; count: number; selector: string | null }>();

  for (const group of root.querySelectorAll('g[id^="layer:"], g[data-layer]')) {
    const name = group.getAttribute("data-layer") || group.id.replace("layer:", "");
    if (!name) continue;
    const entry = record(found, name, group, `[data-layer="${cssEscape(name)}"]`);
    entry.count += group.querySelectorAll("*").length;
  }

  for (const element of root.querySelectorAll('[class*="layer-"]')) {
    const name = (element as SVGElement).className?.baseVal?.match(
      /layer-([^\s]+)/,
    )?.[1];
    if (!name) continue;
    const entry = record(found, name, element, `.layer-${cssEscape(name)}`);
    entry.count += 1;
  }

  if (found.size === 0) {
    for (const group of root.querySelectorAll("g")) {
      const name = group.querySelector("title")?.textContent?.trim();
      if (!name) continue;
      // No id, no class, and CSS cannot match on a child's text — so this one
      // can be listed but not hidden.
      const entry = record(found, name, group, null);
      entry.count += group.children.length;
    }
  }

  return [...found.entries()]
    .map(([name, info]) => ({
      name,
      color: info.color,
      visible: true,
      count: info.count,
      selector: info.selector,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * The drawing with the given layers styled out.
 *
 * <p>The rules go inside the SVG rather than in the component's stylesheet,
 * because a drawing rendered through `<img>` is its own document and no CSS
 * from the page reaches into it. That isolation is the point (§5.12 A03);
 * this is what it costs.
 */
export function withLayersHidden(
  svgText: string,
  layers: readonly CadLayer[],
): string {
  if (!svgText) return "";

  const selectors = layers
    .filter((layer) => !layer.visible)
    .map((layer) => layer.selector)
    .filter((selector): selector is string => selector !== null);
  if (selectors.length === 0) return svgText;

  const rules = selectors
    .map((selector) => `${selector} { display: none !important; }`)
    .join(" ");
  return svgText.replace("</svg>", `<style>${rules}</style></svg>`);
}

/**
 * A colour for a layer the drawing did not give one, derived from its name so
 * the same layer is the same colour every time the drawing is opened.
 */
export function colourForLayerName(name: string): string {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash << 5) - hash + name.charCodeAt(index);
    hash |= 0;
  }
  return `hsl(${Math.abs(hash) % 360}, 65%, 55%)`;
}

function record(
  found: Map<string, { color: string; count: number; selector: string | null }>,
  name: string,
  element: Element,
  selector: string | null,
) {
  let entry = found.get(name);
  if (!entry) {
    entry = {
      color: colourOf(element) || colourForLayerName(name),
      count: 0,
      selector,
    };
    found.set(name, entry);
  }
  return entry;
}

/** The colour the drawing itself gives an element, if it gives one. */
function colourOf(element: Element): string {
  const stroke = element.getAttribute("stroke");
  if (stroke && stroke !== "none" && stroke !== "currentColor") return stroke;
  const fill = element.getAttribute("fill");
  if (fill && fill !== "none" && fill !== "currentColor") return fill;
  return "";
}

/**
 * The drawing's root element, or null if it could not be read.
 *
 * <p>A converted drawing is derived from a file a user uploaded, so a
 * malformed one is expected rather than exceptional. DOMParser reports its
 * failure as a `parsererror` element inside an otherwise valid document,
 * which is easy to mistake for a drawing with one odd node in it.
 */
function parseSvg(svgText: string): SVGSVGElement | null {
  if (!svgText?.trim()) return null;
  const parsed = new DOMParser().parseFromString(svgText, "image/svg+xml");
  if (parsed.querySelector("parsererror")) return null;
  return parsed.querySelector("svg");
}

/** CSS.escape, which jsdom and older engines do not always provide. */
function cssEscape(value: string): string {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(value)
    : value.replace(/[^\w-]/g, (char) => `\\${char}`);
}
