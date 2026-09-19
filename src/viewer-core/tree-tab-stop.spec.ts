/**
 * Where a tree's single tab stop sits.
 *
 * <p>The case that matters is the first one below. A tree whose tab stop is
 * driven only by the row a reader has focused has no tab stop at all until
 * someone focuses a row, and nobody can, because focusing a row needs the
 * tab stop. The panel then announces correctly, looks correct, and cannot be
 * entered from the keyboard — which for the accessible equivalent of a WebGL
 * canvas (§1A.4) means the model has no accessible route at all.
 *
 * <p>That was found by counting tab stops in Chromium. It is stated here so
 * it does not have to be found that way twice.
 */
import { IfcNode } from "./ifc-node";
import { TreeRow } from "./tree-navigation";
import { TreeTabStop } from "./tree-tab-stop";

function node(id: string, selected = false): IfcNode {
  return {
    id,
    name: `Level ${id}`,
    type: "IfcBuildingStorey",
    children: [],
    expanded: false,
    selected,
    visible: true,
  };
}

function rowsFor(...nodes: IfcNode[]): TreeRow[] {
  return nodes.map((item, index) => ({
    node: item,
    level: 1,
    positionInSet: index + 1,
    setSize: nodes.length,
  }));
}

describe("a tree's tab stop", () => {
  it("sits on the first row before anyone has focused one", () => {
    const stop = new TreeTabStop();

    expect(stop.currentIn(rowsFor(node("a"), node("b")))).toBe("a");
  });

  it("sits on the selected row, so a reader returns where they were", () => {
    const stop = new TreeTabStop();

    expect(stop.currentIn(rowsFor(node("a"), node("b", true)))).toBe("b");
  });

  it("follows the focused row once there is one", () => {
    const stop = new TreeTabStop();
    stop.focusedId.set("b");

    expect(stop.currentIn(rowsFor(node("a"), node("b")))).toBe("b");
  });

  it("falls back when the focused row is filtered away", () => {
    // Typing in the search box can remove the row under the caret. Left
    // pointing at it, every remaining row is tabindex=-1 and the panel
    // becomes unreachable again.
    const stop = new TreeTabStop();
    stop.focusedId.set("gone");

    expect(stop.currentIn(rowsFor(node("a"), node("b")))).toBe("a");
  });

  it("has nowhere to sit in an empty tree", () => {
    expect(new TreeTabStop().currentIn([])).toBe(null);
  });

  it("takes the browser's focus with it, not just the tabindex", () => {
    // Moving only the signal leaves the caret on the row just left, and
    // every subsequent arrow key reads from the wrong place.
    const tree = document.createElement("div");
    for (const id of ["a", "b"]) {
      const row = document.createElement("div");
      row.setAttribute("data-node-id", id);
      row.tabIndex = -1;
      tree.appendChild(row);
    }
    document.body.appendChild(tree);
    const stop = new TreeTabStop();

    stop.moveTo("b", tree);

    expect(stop.focusedId()).toBe("b");
    expect(document.activeElement?.getAttribute("data-node-id")).toBe("b");
    tree.remove();
  });

  it("survives an id that would otherwise break the selector", () => {
    // IFC ids are supplied by the extractor, not by us.
    const tree = document.createElement("div");
    const row = document.createElement("div");
    row.setAttribute("data-node-id", "2O2Fr$t4X7Zf8NOew3FL#1");
    row.tabIndex = -1;
    tree.appendChild(row);
    document.body.appendChild(tree);

    expect(() =>
      new TreeTabStop().moveTo("2O2Fr$t4X7Zf8NOew3FL#1", tree),
    ).not.toThrow();
    expect(document.activeElement).toBe(row);
    tree.remove();
  });

  it("does not fail when the tree is not on screen", () => {
    const stop = new TreeTabStop();

    expect(() => stop.moveTo("a", null)).not.toThrow();
    expect(stop.focusedId()).toBe("a");
  });
});
