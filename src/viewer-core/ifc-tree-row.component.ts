/**
 * One row of the model tree.
 *
 * <p>Separate from the tree because the tree's job is which rows exist and
 * which one has focus, and this one's is what a single row says about itself
 * — which, for the accessible equivalent of a WebGL canvas (§1A.4), is most
 * of the work. Nearly every decision here was made by asking a browser what
 * it had computed rather than by reading the markup, and the reasons are
 * recorded beside the attributes they explain.
 *
 * <p>The `treeitem` role sits on the host element rather than on a div
 * inside it, so that a row is still a direct child of the `role="tree"`
 * container. Wrapping a treeitem in an element of its own would put a
 * generic box between a tree and the items it owns.
 */
import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, Output,
} from "@angular/core";

import { IfcNode } from "./ifc-node";
import { TreeRow, isBranch } from "./tree-navigation";
import { iconForType } from "./ifc-icons";

@Component({
  selector: "app-ifc-tree-row",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: "treeitem",
    class: `group flex items-center gap-1 py-1 px-2 rounded cursor-pointer
            hover:bg-gray-50 transition-colors text-xs
            focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent`,
    "[attr.data-node-id]": "row.node.id",
    "[attr.tabindex]": "tabbable ? 0 : -1",
    "[attr.aria-level]": "row.level",
    "[attr.aria-posinset]": "row.positionInSet",
    "[attr.aria-setsize]": "row.setSize",
    "[attr.aria-label]": "rowLabel()",
    "[attr.aria-selected]": "row.node.selected",
    "[attr.aria-expanded]": "hasChildren() ? row.node.expanded : null",
    "[style.padding-inline-start.px]": "8 + (row.level - 1) * 12",
    "[class.bg-blue-50]": "row.node.selected",
    "[class.text-accent]": "row.node.selected",
    "(click)": "selected.emit(row.node)",
  },
  template: `
    <!-- Expand toggle. Decorative to assistive technology: the host row
         carries aria-expanded and the arrows drive it, so the accessible
         name stays put. A name flipping between "Expand" and "Collapse"
         would rename the control underneath anyone who had learned it, and
         would say what aria-expanded already says. The attribute is dropped
         entirely on a node with no children — a disclosure state for a
         disclosure that does not exist is worse than none (§1A.2). -->
    <span aria-hidden="true"
      (click)="expandToggled.emit(row.node); $event.stopPropagation()"
      class="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 flex-shrink-0"
      [class.invisible]="!hasChildren()">
      {{ row.node.expanded ? '▾' : '▸' }}
    </span>

    <button type="button"
      (click)="visibilityToggled.emit(row.node); $event.stopPropagation()"
      [attr.tabindex]="tabbable ? 0 : -1"
      class="w-6 h-6 flex items-center justify-center flex-shrink-0 transition-opacity
             opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
      [class.opacity-100]="!row.node.visible"
      [attr.aria-pressed]="!row.node.visible"
      [attr.aria-label]="hideLabel()">
      <span aria-hidden="true">{{ row.node.visible ? '👁' : '🔲' }}</span>
    </button>

    <span class="flex-shrink-0" aria-hidden="true">{{ icon() }}</span>
    <span class="truncate flex-1"
          [class.line-through]="!row.node.visible"
          [class.text-gray-400]="!row.node.visible">
      {{ displayName() }}
    </span>

    @if (row.node.count && row.node.count > 1) {
      <span class="text-xs text-gray-400 ml-auto flex-shrink-0">×{{ row.node.count }}</span>
    }
  `,
})
export class IfcTreeRowComponent {
  @Input({ required: true }) row!: TreeRow;
  /**
   * Whether this row holds the tree's single tab stop.
   *
   * <p>A tree is one stop in the page's tab order, not one per row — a model
   * with four hundred elements would otherwise put four hundred stops
   * between a reader and whatever follows the panel.
   */
  @Input() tabbable = false;

  @Output() selected = new EventEmitter<IfcNode>();
  @Output() expandToggled = new EventEmitter<IfcNode>();
  @Output() visibilityToggled = new EventEmitter<IfcNode>();

  /** Whether this row has anything to disclose. */
  hasChildren(): boolean {
    return isBranch(this.row.node);
  }

  /** The glyph for the type. Decoration; its use is aria-hidden. */
  icon(): string {
    return iconForType(this.row.node.type);
  }

  displayName(): string {
    return this.row.node.name || this.row.node.type.replace("Ifc", "");
  }

  /**
   * What this row announces itself as.
   *
   * <p>Named explicitly rather than left to be computed from the row's
   * contents, because the row contains the visibility button and a computed
   * name folds that button's label in: Chromium reported every row as
   * "Hide Level 00 Level 00", so each one said "hide" before it said what it
   * was. Nothing in the markup suggests that — it only shows up if you ask
   * the browser what it computed.
   *
   * <p>The count is spelled out for the same reason. As the visible "×42" it
   * is announced as a multiplication sign, which is not what it means.
   */
  rowLabel(): string {
    const name = this.displayName();
    const count = this.row.node.count;
    if (!count || count <= 1) return name;
    return $localize`:Accessible name of a model-tree row that stands for several elements, e.g. "Walls, 42 elements"@@ifcTree.rowWithCount:${name}:name:, ${count}:count: elements`;
  }

  /**
   * Accessible name of the control that hides this row's geometry.
   *
   * <p>Text rather than the emoji: a screen reader announcing "eye" says
   * nothing about what pressing it does or what it acts on. `aria-pressed`
   * carries the on/off state, and the emoji and the strikethrough are the
   * visual half of the same information — §1A.2 forbids colour as the only
   * cue.
   */
  hideLabel(): string {
    const name = this.row.node.name || this.row.node.type;
    return $localize`:Button that hides one element or group in the 3D view@@ifcTree.hide:Hide ${name}:name:`;
  }
}
