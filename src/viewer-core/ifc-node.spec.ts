/**
 * Walking a whole branch of a model hierarchy.
 *
 * <p>Both operations reach into collapsed branches on purpose, which is the
 * part worth stating: what a reader cannot currently see is still in the
 * model, and leaving it alone shows one thing in the tree and another in the
 * view.
 */
import { IfcNode, deselectAll, setBranchVisibility } from "./ifc-node";

function node(id: string, children: IfcNode[] = []): IfcNode {
  return {
    id,
    name: `Element ${id}`,
    type: "IfcWall",
    children,
    expanded: false,
    selected: false,
    visible: true,
  };
}

describe("selecting across a hierarchy", () => {
  it("clears a selection inside a collapsed branch", () => {
    // Left selected, opening the branch again shows a tree with two
    // selected rows and no way to tell which one the panel is describing.
    const buried = node("deep");
    buried.selected = true;
    const storey = node("storey", [node("mid", [buried])]);
    storey.expanded = false;

    deselectAll([storey]);

    expect(buried.selected).toBe(false);
  });

  it("clears every root, not only the first", () => {
    const roots = [node("a"), node("b")];
    roots.forEach((each) => (each.selected = true));

    deselectAll(roots);

    expect(roots.map((each) => each.selected)).toEqual([false, false]);
  });

  it("copes with a node whose children were never set", () => {
    // The hierarchy comes from the extractor, which has been known to omit
    // an empty array rather than send one.
    const childless = { ...node("a"), children: undefined as never };

    expect(() => deselectAll([childless])).not.toThrow();
  });
});

describe("hiding a branch of a hierarchy", () => {
  it("hides the walls when the storey is hidden", () => {
    const wall = node("wall");
    const storey = node("storey", [wall]);

    setBranchVisibility(storey, false);

    expect(storey.visible).toBe(false);
    expect(wall.visible).toBe(false);
  });

  it("reaches all the way down, not one level", () => {
    const fixture = node("fixture");
    const storey = node("storey", [node("room", [fixture])]);

    setBranchVisibility(storey, false);

    expect(fixture.visible).toBe(false);
  });

  it("brings the whole branch back together", () => {
    const wall = node("wall");
    const storey = node("storey", [wall]);
    setBranchVisibility(storey, false);

    setBranchVisibility(storey, true);

    expect(wall.visible).toBe(true);
  });

  it("leaves a sibling branch alone", () => {
    const kept = node("kept");
    setBranchVisibility(node("hidden"), false);

    expect(kept.visible).toBe(true);
  });
});
