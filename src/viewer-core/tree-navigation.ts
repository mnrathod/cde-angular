/**
 * Moving around a tree with the keyboard.
 *
 * <p>The model tree is §1A.4's equivalent accessible route to the 3D viewer,
 * and since the fabricated fallback was removed it is the only one. That makes
 * how it is navigated a functional requirement rather than a refinement: a
 * reader who cannot use the WebGL canvas has this and nothing else.
 *
 * <p>What it implements is the WAI-ARIA tree view pattern, which is what
 * screen-reader users already know from every file explorer they have met —
 * §1.3's rule about not inventing interactions for solved problems. The whole
 * tree is one tab stop; arrows move within it.
 *
 * <p>Pure, and separate from the component, because this is the part with
 * edges worth testing — the last visible row, a collapsed branch, a leaf at
 * depth three — and none of them need a DOM to state.
 */
import { IfcNode } from './ifc-tree.component';

/**
 * One rendered row, with what the ARIA attributes need.
 *
 * <p>`level`, `positionInSet` and `setSize` are 1-based because
 * `aria-level`, `aria-posinset` and `aria-setsize` are. Converting at the
 * boundary rather than in the template keeps the off-by-one in one place.
 */
export interface TreeRow {
  readonly node: IfcNode;
  readonly level: number;
  readonly positionInSet: number;
  readonly setSize: number;
}

/**
 * The rows a reader can currently see, in the order they appear.
 *
 * <p>Collapsed branches contribute their own row and nothing beneath it, which
 * is what makes this the right list to move through: arrow keys walk what is
 * on screen, not what exists.
 */
export function visibleRows(nodes: readonly IfcNode[], level = 1): TreeRow[] {
  return nodes.flatMap((node, index) => {
    const row: TreeRow = {
      node, level, positionInSet: index + 1, setSize: nodes.length,
    };
    const children = node.children ?? [];
    return node.expanded && children.length
      ? [row, ...visibleRows(children, level + 1)]
      : [row];
  });
}

/** Whether a node has anything to disclose. */
export function isBranch(node: IfcNode): boolean {
  return (node.children?.length ?? 0) > 0;
}

/**
 * The row holding the given one, or undefined at the top level.
 *
 * <p>Read off the flattened list rather than by searching the tree: the
 * nearest row above with a smaller level is the parent, by construction. That
 * avoids carrying parent links on the nodes, which the host supplies and which
 * would then have to survive the filter rebuilding them.
 */
export function parentRow(rows: readonly TreeRow[], index: number): TreeRow | undefined {
  const row = rows[index];
  if (!row || row.level === 1) return undefined;

  for (let above = index - 1; above >= 0; above--) {
    const candidate = rows[above];
    if (candidate && candidate.level < row.level) return candidate;
  }
  return undefined;
}

/** What a keystroke asks the tree to do. */
export type TreeCommand =
  | { readonly kind: 'focus'; readonly node: IfcNode }
  | { readonly kind: 'expand'; readonly node: IfcNode }
  | { readonly kind: 'collapse'; readonly node: IfcNode }
  | { readonly kind: 'select'; readonly node: IfcNode }
  | { readonly kind: 'none' };

const NOTHING: TreeCommand = { kind: 'none' };

/**
 * Reads a keystroke against the rows on screen.
 *
 * <p>Returns what to do rather than doing it, so the arrow-key behaviour can
 * be stated in tests without a rendered tree or a focus manager. `none` means
 * the key is not ours and the caller must not swallow it — taking Tab or a
 * typed character here would be a keyboard trap (§1A.2).
 *
 * <p>The two horizontal arrows each do two things, which is the pattern rather
 * than a shortcut: Right opens a closed branch and then steps into it, Left
 * closes an open one and then steps out. On a leaf, Right does nothing and
 * Left goes to the parent, which is how a reader climbs back out of a deep
 * branch without arrowing up through all of its siblings.
 */
export function commandForKey(
  key: string, rows: readonly TreeRow[], focusedId: string | null,
): TreeCommand {
  if (!rows.length) return NOTHING;

  const index = rows.findIndex((row) => row.node.id === focusedId);
  const current = index >= 0 ? rows[index] : undefined;
  if (!current) {
    // Entering the tree. Which end a reader lands on depends on the key they
    // used to get here: End and Up mean "the bottom of this list" whether or
    // not anything was focused first, and answering both with the top row
    // would put them somewhere they did not ask for.
    if (['ArrowDown', 'ArrowRight', 'Home'].includes(key)) {
      return { kind: 'focus', node: rows[0]!.node };
    }
    if (['ArrowUp', 'End'].includes(key)) {
      return { kind: 'focus', node: rows[rows.length - 1]!.node };
    }
    return NOTHING;
  }

  switch (key) {
    case 'ArrowDown':
      return step(rows, index + 1);
    case 'ArrowUp':
      return step(rows, index - 1);
    case 'Home':
      return { kind: 'focus', node: rows[0]!.node };
    case 'End':
      return { kind: 'focus', node: rows[rows.length - 1]!.node };
    case 'Enter':
    case ' ':
      return { kind: 'select', node: current.node };
    case 'ArrowRight':
      if (!isBranch(current.node)) return NOTHING;
      return current.node.expanded
        ? step(rows, index + 1)
        : { kind: 'expand', node: current.node };
    case 'ArrowLeft':
      if (isBranch(current.node) && current.node.expanded) {
        return { kind: 'collapse', node: current.node };
      }
      const parent = parentRow(rows, index);
      return parent ? { kind: 'focus', node: parent.node } : NOTHING;
    default:
      return NOTHING;
  }
}

/** Focus the row at `index`, or stay put at either end. */
function step(rows: readonly TreeRow[], index: number): TreeCommand {
  const row = rows[index];
  return row ? { kind: 'focus', node: row.node } : NOTHING;
}

/**
 * The nodes matching a search, with the branches that lead to them.
 *
 * <p>A match deep in the model is no use if its ancestors are filtered away,
 * so a branch survives when anything inside it matched — and arrives
 * expanded, because a reader who searched has already said what they want to
 * see.
 *
 * <p>The nodes are copied rather than mutated: these are the host's objects
 * (§3.1 — the viewer is embeddable), and a search must not leave a model
 * permanently expanded behind it.
 */
export function matchingNodes(
  nodes: readonly IfcNode[],
  query: string,
): IfcNode[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...nodes];

  return nodes.flatMap((node) => {
    const matches =
      node.name.toLowerCase().includes(needle) ||
      node.type.toLowerCase().includes(needle);
    const children = matchingNodes(node.children ?? [], needle);
    return matches || children.length
      ? [{ ...node, expanded: true, children }]
      : [];
  });
}
