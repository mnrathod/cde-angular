/**
 * Reading layers out of a converted drawing.
 *
 * <p>The behaviour that matters is that a layer the panel offers to hide can
 * actually be hidden. Layers were found three ways and hidden one way, so a
 * drawing from one converter had checkboxes that unticked and changed
 * nothing on screen.
 */
import {
  colourForLayerName,
  readLayers,
  readViewBox,
  sizeOfViewBox,
  withLayersHidden,
} from "./cad-layers";

/** A drawing wrapping the given body. */
function drawing(body: string, attributes = 'viewBox="0 0 400 300"'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" ${attributes}>${body}</svg>`;
}

describe("reading a drawing's layers", () => {
  it("finds a layer from a group's data-layer", () => {
    const layers = readLayers(
      drawing('<g data-layer="Walls"><line/><line/></g>'),
    );

    expect(layers.map((layer) => layer.name)).toEqual(["Walls"]);
    expect(layers[0]?.count).toBe(2);
  });

  it("finds a layer from an id of the layer: form", () => {
    const layers = readLayers(drawing('<g id="layer:Doors"><path/></g>'));

    expect(layers.map((layer) => layer.name)).toEqual(["Doors"]);
  });

  it("finds layers from the class names ezdxf writes", () => {
    const layers = readLayers(
      drawing('<line class="layer-Grid"/><line class="layer-Grid"/>'),
    );

    expect(layers.map((layer) => layer.name)).toEqual(["Grid"]);
    expect(layers[0]?.count).toBe(2);
  });

  it("falls back to group titles only when nothing else was found", () => {
    const layers = readLayers(
      drawing("<g><title>Levels</title><line/></g>"),
    );

    expect(layers.map((layer) => layer.name)).toEqual(["Levels"]);
  });

  it("does not mix titles in once a better convention has answered", () => {
    // A converter that writes both would otherwise list every layer twice,
    // once under each name it happens to use.
    const layers = readLayers(
      drawing(
        '<g data-layer="Walls"><line/></g><g><title>Something Else</title></g>',
      ),
    );

    expect(layers.map((layer) => layer.name)).toEqual(["Walls"]);
  });

  it("lists layers in a settled order rather than the file's", () => {
    const layers = readLayers(
      drawing(
        '<g data-layer="Walls"/><g data-layer="Doors"/><g data-layer="Grid"/>',
      ),
    );

    expect(layers.map((layer) => layer.name)).toEqual([
      "Doors",
      "Grid",
      "Walls",
    ]);
  });

  it("takes the colour the drawing gives an element", () => {
    const layers = readLayers(
      drawing('<g data-layer="Walls" stroke="#ff0000"/>'),
    );

    expect(layers[0]?.color).toBe("#ff0000");
  });

  it("ignores placeholder colours that say nothing", () => {
    // "none" and "currentColor" are not colours a swatch can show.
    const layers = readLayers(
      drawing('<g data-layer="Walls" stroke="none" fill="currentColor"/>'),
    );

    expect(layers[0]?.color).toBe(colourForLayerName("Walls"));
  });

  it("gives the same layer name the same colour every time", () => {
    // Otherwise a drawing's layer panel is a different set of colours on
    // every open, and nobody can say "the red one".
    expect(colourForLayerName("Walls")).toBe(colourForLayerName("Walls"));
    expect(colourForLayerName("Walls")).not.toBe(colourForLayerName("Doors"));
  });

  it("returns nothing for a drawing it cannot parse", () => {
    // A converted drawing comes from a file a user uploaded, so malformed is
    // expected. DOMParser reports failure as an element inside an otherwise
    // valid document, which is easy to mistake for a real drawing.
    expect(readLayers("<svg><g data-layer='Walls'></svg>")).toEqual([]);
    expect(readLayers("")).toEqual([]);
  });
});

describe("hiding layers", () => {
  it("hides a data-layer group by the attribute it was found under", () => {
    const layers = readLayers(drawing('<g data-layer="Walls"><line/></g>'));
    layers[0]!.visible = false;

    const hidden = withLayersHidden(drawing('<g data-layer="Walls"/>'), layers);

    expect(hidden).toContain('[data-layer="Walls"] { display: none !important; }');
  });

  it("hides a class-named layer by its class, not by data-layer", () => {
    // The bug this replaces: every layer was hidden with a [data-layer]
    // rule, so a drawing whose layers came from class names had checkboxes
    // that unticked and left the layer on screen.
    const source = drawing('<line class="layer-Grid"/>');
    const layers = readLayers(source);
    layers[0]!.visible = false;

    const hidden = withLayersHidden(source, layers);

    expect(hidden).toContain(".layer-Grid { display: none !important; }");
    expect(hidden).not.toContain("[data-layer=");
  });

  it("says a title-found layer cannot be hidden rather than pretending", () => {
    // CSS cannot match a group by the text of its <title> child. Recording
    // that honestly is what lets the panel disable the control and explain
    // itself, instead of offering one that does nothing.
    const layers = readLayers(drawing("<g><title>Levels</title></g>"));

    expect(layers[0]?.selector).toBeNull();
  });

  it("leaves the drawing untouched when every layer is showing", () => {
    const source = drawing('<g data-layer="Walls"/>');

    expect(withLayersHidden(source, readLayers(source))).toBe(source);
  });

  it("escapes a layer name that would otherwise break the rule", () => {
    // Layer names come from the uploaded file. One containing a quote or a
    // brace would end the selector early and disable the rules after it.
    const source = drawing('<g data-layer="A B"/>');
    const layers = readLayers(source);
    layers[0]!.visible = false;

    const hidden = withLayersHidden(source, layers);

    expect(hidden).not.toContain('[data-layer="A B"]');
    expect(hidden).toContain("display: none !important");
  });

  it("puts the rules inside the drawing, where they can reach it", () => {
    // A drawing rendered through <img> is its own document; a rule in this
    // page's stylesheet never reaches inside it.
    const source = drawing('<g data-layer="Walls"/>');
    const layers = readLayers(source);
    layers[0]!.visible = false;

    expect(withLayersHidden(source, layers)).toMatch(/<style>.*<\/style><\/svg>$/);
  });
});

describe("the drawing's coordinate space", () => {
  it("uses the viewBox the drawing declares", () => {
    expect(readViewBox(drawing("", 'viewBox="0 0 1200 900"'))).toBe("0 0 1200 900");
  });

  it("builds one from width and height when there is no viewBox", () => {
    expect(readViewBox(drawing("", 'width="500" height="250"'))).toBe("0 0 500 250");
  });

  it("falls back to a page size when the drawing declares neither", () => {
    // Rendering something a user can see beats rendering nothing.
    expect(readViewBox(drawing("", ""))).toBe("0 0 800 600");
  });

  it("reads the size back out of a viewBox", () => {
    expect(sizeOfViewBox("0 0 1200 900")).toEqual([1200, 900]);
  });

  it("falls back on a viewBox that does not parse", () => {
    expect(sizeOfViewBox("nonsense")).toEqual([800, 600]);
    expect(sizeOfViewBox("0 0 0 0")).toEqual([800, 600]);
  });
});
