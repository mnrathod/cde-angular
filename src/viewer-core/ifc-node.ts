/**
 * A node of a model hierarchy, and what can be done to a whole branch of
 * them at once.
 *
 * <p>In a file of its own rather than inside the tree component, because
 * everything else here that reasons about a model — navigation, visibility,
 * the row, the properties panel — needed the type and was reaching through a
 * component to get it. A pure module importing a component to borrow an
 * interface is the dependency pointing the wrong way (§3.1), and it is the
 * kind that compiles perfectly well.
 */
export interface IfcNode {
  id: string;
  name: string;
  type: string;
  children: IfcNode[];
  expanded: boolean;
  selected: boolean;
  visible: boolean;
  count?: number;
  properties?: Record<string, string>;
}

/**
 * Clears the selection across a whole hierarchy.
 *
 * <p>Every node, not just the visible ones: a selected node inside a
 * collapsed branch is still selected, and leaving it so means a tree with
 * two selected rows as soon as the branch is opened again.
 */
export function deselectAll(nodes: readonly IfcNode[]): void {
  for (const node of nodes) {
    node.selected = false;
    deselectAll(node.children ?? []);
  }
}

/**
 * Shows or hides a node and everything under it.
 *
 * <p>Hiding a storey has to hide its walls: a branch that reported itself
 * hidden while its children were still drawn would say one thing in the
 * tree and show another in the model.
 */
export function setBranchVisibility(node: IfcNode, visible: boolean): void {
  node.visible = visible;
  for (const child of node.children ?? []) setBranchVisibility(child, visible);
}
