/**
 * Where a tree's single tab stop sits, and how it moves.
 *
 * <p>Out of the tree component because it is the piece that was hardest to
 * get right and the piece a rendered-component test was least able to see.
 * The defect below was found by counting tab stops in Chromium; stated here
 * it can be asserted in a sentence.
 */
import { signal } from "@angular/core";

import { TreeRow } from "./tree-navigation";

export class TreeTabStop {
  /**
   * The row a reader's focus is on, or null before one has arrived.
   *
   * <p>The focused row carries `tabindex="0"` and every other row `-1`,
   * which is the roving tabindex the WAI-ARIA tree pattern specifies.
   */
  readonly focusedId = signal<string | null>(null);

  /**
   * Which row currently holds `tabindex="0"`.
   *
   * <p>A roving tabindex needs somewhere to rove *from*, and this is the
   * part that is easy to leave out: driven only by {@link focusedId}, a
   * freshly rendered tree has every row at `-1`, so Tab skips the whole
   * panel and no row can take focus — and nothing can set `focusedId`,
   * because setting it needs the focus that needs it. The tree looks
   * correct, announces correctly, and cannot be entered.
   *
   * <p>So the fallback is the selected row, and failing that the first: the
   * reader arrives where they last were, or at the top.
   */
  currentIn(rows: readonly TreeRow[]): string | null {
    if (!rows.length) return null;

    const focused = this.focusedId();
    if (focused && rows.some((row) => row.node.id === focused)) return focused;

    return (rows.find((row) => row.node.selected) ?? rows[0]!).node.id;
  }

  /**
   * Moves the tab stop, and the browser's focus with it.
   *
   * <p>Both halves are needed and they are not the same thing: the signal is
   * what makes the row tabbable, and `focus()` is what actually takes the
   * caret there so the next arrow key arrives at this row. Setting only the
   * signal leaves focus on the row the reader has just left, and every
   * subsequent key reads from the wrong place.
   *
   * <p>The row is found by querying the container the key arrived at rather
   * than by holding a `ViewChild` list, because the rows are rebuilt
   * whenever a branch opens and the row being moved to may not have existed
   * a moment ago. It also keeps the tree component constructible with `new`,
   * which `ifc-tree.component.spec.ts` asserts.
   */
  moveTo(nodeId: string, tree: HTMLElement | null): void {
    this.focusedId.set(nodeId);
    tree
      ?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(nodeId)}"]`)
      ?.focus();
  }
}
