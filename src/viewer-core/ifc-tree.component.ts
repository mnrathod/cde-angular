import {
  Component, signal, computed, Input, OnChanges, SimpleChanges,
  Output, EventEmitter, ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import {
  commandForKey, isBranch, matchingNodes, visibleRows,
} from './tree-navigation';
import { iconForType } from './ifc-icons';
import { IfcPropertiesComponent } from './ifc-properties.component';

export interface IfcNode {
  id:         string;
  name:       string;
  type:       string;
  children:   IfcNode[];
  expanded:   boolean;
  selected:   boolean;
  visible:    boolean;
  count?:     number;
  properties?: Record<string, string>;
}


@Component({
  selector: 'app-ifc-tree',
  standalone: true,
  imports: [CommonModule, FormsModule, IfcPropertiesComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col h-full bg-white border-s border-gray-200" style="min-width:240px;max-width:280px">

      <!-- Header -->
      <div class="p-3 border-b border-gray-200 flex-shrink-0">
        <div id="model-tree-heading"
             i18n="Heading of the accessible, navigable equivalent of the 3D model view@@ifcTree.heading"
             class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Model Tree</div>
        <!-- Search -->
        <input [(ngModel)]="searchQuery" (ngModelChange)="filterTree($event)"
          i18n-placeholder="@@ifcTree.searchPlaceholder"
          placeholder="Search elements..."
          class="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-accent" />
      </div>

      <!-- Tree. One tab stop; the arrows move within it. See
           tree-navigation.ts and onKeydown(). -->
      <div class="flex-1 overflow-y-auto p-1"
           role="tree"
           aria-labelledby="model-tree-heading"
           (keydown)="onKeydown($event)">
        @for (row of rows(); track row.node.id) {
          <ng-container *ngTemplateOutlet="treeRow; context: { $implicit: row }"></ng-container>
        }
        @if (rows().length === 0) {
          <div class="text-xs text-gray-400 text-center py-8">
            {{ searchQuery ? noMatchesLabel : noModelLabel }}
          </div>
        }
      </div>

      <app-ifc-properties [node]="selectedNode()"></app-ifc-properties>

      <!-- One row. The rows are flattened and carry their depth in
           aria-level, which is the documented alternative to nesting them in
           role="group" containers and keeps the arrow-key list the same list
           the DOM is in. See rows() and onKeydown(). -->
      <ng-template #treeRow let-row>
        <div class="group flex items-center gap-1 py-1 px-2 rounded cursor-pointer
                    hover:bg-gray-50 transition-colors text-xs
                    focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          role="treeitem"
          [attr.data-node-id]="row.node.id"
          [attr.tabindex]="tabStopId() === row.node.id ? 0 : -1"
          [attr.aria-level]="row.level"
          [attr.aria-posinset]="row.positionInSet"
          [attr.aria-setsize]="row.setSize"
          [attr.aria-label]="rowLabel(row.node)"
          [attr.aria-selected]="row.node.selected"
          [attr.aria-expanded]="hasChildren(row.node) ? row.node.expanded : null"
          [style.padding-inline-start.px]="8 + (row.level - 1) * 12"
          [class.bg-blue-50]="row.node.selected"
          [class.text-accent]="row.node.selected"
          (focus)="focusedId.set(row.node.id)"
          (click)="selectNode(row.node)">

          <!-- Expand toggle. Decorative to assistive technology: the row
               carries aria-expanded and the arrows drive it. See toggleNode(). -->
          <span aria-hidden="true"
            (click)="toggleNode(row.node); $event.stopPropagation()"
            class="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 flex-shrink-0"
            [class.invisible]="!hasChildren(row.node)">
            {{ row.node.expanded ? '▾' : '▸' }}
          </span>

          <!-- Visibility toggle. See toggleVisibility() for why it is
               shaped this way, including why it is tabbable only on the
               focused row. -->
          <button type="button"
            (click)="toggleVisibility(row.node); $event.stopPropagation()"
            [attr.tabindex]="tabStopId() === row.node.id ? 0 : -1"
            class="w-6 h-6 flex items-center justify-center flex-shrink-0 transition-opacity
                   opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            [class.opacity-100]="!row.node.visible"
            [attr.aria-pressed]="!row.node.visible"
            [attr.aria-label]="hideLabel(row.node)">
            <span aria-hidden="true">{{ row.node.visible ? '👁' : '🔲' }}</span>
          </button>

          <!-- Icon + Name -->
          <span class="flex-shrink-0" aria-hidden="true">{{ getIcon(row.node.type) }}</span>
          <span class="truncate flex-1"
                [class.line-through]="!row.node.visible"
                [class.text-gray-400]="!row.node.visible">
            {{ row.node.name || row.node.type.replace('Ifc', '') }}
          </span>

          <!-- Count badge -->
          @if (row.node.count && row.node.count > 1) {
            <span class="text-xs text-gray-400 ml-auto flex-shrink-0">×{{ row.node.count }}</span>
          }
        </div>
      </ng-template>
    </div>
  `
})
export class IfcTreeComponent implements OnChanges {
  /**
   * The model hierarchy, supplied by the host.
   *
   * <p>This component used to fetch the model tree itself, over HTTP, inside
   * the package whose README says it knows no backend exists. The boundary
   * test did not catch it: it forbids imports from the *application*, and the
   * Angular HTTP client is a framework import. The spec now asserts the
   * absence of network access directly, which is the property that was
   * actually being claimed.
   *
   * <p>Undefined means "not loaded yet" and shows the empty state; an empty
   * array means "loaded, and the model has no hierarchy". The two are
   * different and a caller that conflates them gets a spinner forever.
   *
   * <p>This component used to answer the empty case itself, by inventing a
   * tree: ten fixed IFC types, each given a quantity from `Math.random()`. It
   * no longer invents anything. Deriving a fallback needs the geometry, which
   * only the host has, so `treeFromGeometryGroups` builds one from the types
   * the extractor actually found and the host binds the result here.
   */
  @Input() nodes?: IfcNode[];
  @Output() elementSelected  = new EventEmitter<IfcNode>();
  @Output() elementVisibilityChanged = new EventEmitter<{ node: IfcNode; visible: boolean }>();

  treeNodes     = signal<IfcNode[]>([]);
  filteredNodes = signal<IfcNode[]>([]);
  selectedNode  = signal<IfcNode | null>(null);
  searchQuery   = '';

  /**
   * The row that holds the tree's single tab stop.
   *
   * <p>A tree is one stop in the page's tab order, not one per row — a model
   * with four hundred elements would otherwise put four hundred stops between
   * a reader and whatever follows the panel. The focused row carries
   * `tabindex="0"` and every other row `-1`, which is the roving tabindex the
   * WAI-ARIA tree pattern specifies. Null until a reader arrives; see
   * {@link tabStopId} for where the stop sits until then.
   */
  focusedId = signal<string | null>(null);

  /** The rows on screen, flattened, with their ARIA positions. */
  rows = computed(() => visibleRows(this.filteredNodes()));

  /**
   * Which row currently holds `tabindex="0"`.
   *
   * <p>A roving tabindex needs somewhere to rove *from*, and this is the part
   * that is easy to leave out: with the tab stop driven only by
   * {@link focusedId}, a freshly rendered tree has every row at `-1`, so Tab
   * skips the whole panel and no row can take focus — and nothing can set
   * `focusedId`, because setting it needs the focus that needs it. The tree
   * looks correct, announces correctly, and cannot be entered.
   *
   * <p>Found by counting tab stops in Chromium, not in the unit tests, which
   * pressed keys straight at the container and so never had to get in.
   *
   * <p>So the fallback is the selected row, and failing that the first: the
   * reader arrives where they last were, or at the top.
   */
  tabStopId = computed(() => {
    const rows = this.rows();
    if (!rows.length) return null;

    const focused = this.focusedId();
    if (focused && rows.some((row) => row.node.id === focused)) return focused;

    return (rows.find((row) => row.node.selected) ?? rows[0]!).node.id;
  });

  /** Whether a node has anything to disclose. Named for the template. */
  hasChildren = isBranch;

  /**
   * What a row announces itself as.
   *
   * <p>Named explicitly rather than left to be computed from the row's
   * contents, because the row contains the visibility button and a computed
   * name folds that button's label in: Chromium reported every row as
   * "Hide Level 00 Level 00", so each one said "hide" before it said what it
   * was. Nothing in the markup suggests that — it only shows up if you ask the
   * browser what it computed.
   *
   * <p>The count is spelled out for the same reason. As the visible "×42" it
   * is announced as a multiplication sign, which is not what it means.
   */
  rowLabel(node: IfcNode): string {
    const name = node.name || node.type.replace('Ifc', '');
    if (!node.count || node.count <= 1) return name;
    const count = node.count;
    return $localize`:Accessible name of a model-tree row that stands for several elements, e.g. "Walls, 42 elements"@@ifcTree.rowWithCount:${name}:name:, ${count}:count: elements`;
  }

  /** Accessible name of the control that hides a row's geometry. */
  hideLabel(node: IfcNode): string {
    const name = node.name || node.type;
    return $localize`:Button that hides one element or group in the 3D view@@ifcTree.hide:Hide ${name}:name:`;
  }

  /** Empty states, which live in an expression and so need `$localize`. */
  readonly noMatchesLabel = $localize`:Shown when a model-tree search matches nothing@@ifcTree.noMatches:No matching elements`;
  readonly noModelLabel = $localize`:Shown when no model has been loaded into the tree@@ifcTree.noModelData:No model data`;

  ngOnChanges(changes: SimpleChanges) {
    if (!changes['nodes']) return;

    // Undefined is a load in flight, and renders the empty state. Filling it
    // with a guess here would show a plausible, wrong hierarchy and then
    // replace it — worse than an empty panel, because the reader cannot tell
    // it changed.
    const nodes = this.nodes ?? [];
    this.treeNodes.set(nodes);
    this.filteredNodes.set(nodes);
  }

  selectNode(node: IfcNode) {
    // Deselect all
    this.deselectAll(this.treeNodes());
    node.selected = true;
    this.selectedNode.set(node);
    this.focusedId.set(node.id);
    this.elementSelected.emit(node);
  }

  /**
   * Drives the tree from the keyboard.
   *
   * <p>The decision of what a key means is in `tree-navigation.ts`, which is
   * pure and has the edge cases in it; this applies the answer and moves
   * focus. That split is what lets "Left on an open branch closes it, Left on
   * a leaf goes to its parent" be stated in a test without a rendered tree.
   *
   * <p>Only a key that produced a command is consumed. Swallowing the rest
   * would take Tab with it, which is a keyboard trap (§1A.2) — and this panel
   * sits beside a canvas, so a reader unable to leave it would be stuck
   * against the one part of the page they may not be able to use.
   */
  onKeydown(event: KeyboardEvent) {
    const command = commandForKey(event.key, this.rows(), this.focusedId());
    if (command.kind === 'none') return;

    event.preventDefault();

    switch (command.kind) {
      case 'focus':
        this.moveFocusTo(command.node, event.currentTarget as HTMLElement | null);
        break;
      case 'expand':
      case 'collapse':
        this.toggleNode(command.node);
        break;
      case 'select':
        this.selectNode(command.node);
        break;
    }
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
   * <p>The row is found from the element the key arrived at rather than from
   * an injected `ElementRef`: this component is constructible with `new` and
   * has no injector, which `ifc-tree.component.spec.ts` asserts and which is
   * what lets a host embed it without an Angular application around it.
   * Querying also beats holding a `ViewChild` list, because the rows are
   * rebuilt whenever a branch opens and the row being moved to may not have
   * existed a moment ago.
   */
  private moveFocusTo(node: IfcNode, tree: HTMLElement | null) {
    this.focusedId.set(node.id);
    tree?.querySelector<HTMLElement>(
      `[data-node-id="${CSS.escape(node.id)}"]`)?.focus();
  }

  /**
   * Show or hide one node's children.
   *
   * <p>The control is a disclosure button, so `aria-expanded` carries the
   * state and the accessible name stays put. A name that flipped between
   * "Expand" and "Collapse" would rename the control underneath anyone who
   * had learned it, and would say the same thing `aria-expanded` already
   * says. The name is "Contents of …" rather than the node's own name, which
   * would be indistinguishable from the row's text beside it.
   *
   * <p>Both attributes are dropped entirely on a node with no children: that
   * button is `invisible`, which takes it out of the accessibility tree and
   * out of the tab order, and a disclosure state for a disclosure that does
   * not exist is worse than none (§1A.2 — bad ARIA is worse than no ARIA).
   *
   * <p>The ▸ glyph is `aria-hidden`; it is the visual half of what
   * `aria-expanded` states, not a second name.
   */
  toggleNode(node: IfcNode) {
    node.expanded = !node.expanded;
    this.republish();
  }

  /**
   * Show or hide one node and everything under it.
   *
   * <p>The control this drives is transparent until its row is hovered, which
   * is tolerable for an action you are reaching for and not for state you
   * need to find again — so `focus-visible:opacity-100` keeps it visible
   * under keyboard focus (SC 2.4.7, 2.4.11), and a hidden node pins it
   * visible regardless, because an unmarked hidden branch cannot be found by
   * mouse or keyboard.
   *
   * <p>Its accessible name is text rather than the emoji: a screen reader
   * announcing "eye" says nothing about what pressing it does or what it acts
   * on. `aria-pressed` carries the on/off state, and the emoji and the
   * strikethrough are the visual half of the same information — §1A.2 forbids
   * colour as the only cue.
   *
   * <p>The box is 24×24 rather than the 16×16 it was, which is SC 2.5.8's
   * floor. Measured in a browser rather than reasoned about: the emoji inside
   * it is still 16px, so the control looked the right size while the target
   * was not. The expand toggle beside it had the same defect and the same
   * cause, and was corrected with it.
   *
   * <p>The event is emitted once, for the node that was clicked, while the
   * descendants are marked here. A listener wanting the full set expands it
   * itself — `elementTypesIn` in `model-visibility` is what does that.
   */
  toggleVisibility(node: IfcNode) {
    node.visible = !node.visible;
    this.propagateVisibility(node, node.visible);
    this.republish();
    this.elementVisibilityChanged.emit({ node, visible: node.visible });
  }

  filterTree(query: string) {
    this.filteredNodes.set(matchingNodes(this.treeNodes(), query));
  }

  /** The glyph for a type. Decoration; every use is aria-hidden. */
  getIcon = iconForType;

  /**
   * Re-emits both node signals after a node was mutated in place.
   *
   * <p>The nodes are the host's objects and are edited where they lie, so
   * neither signal's value changes identity on its own and nothing downstream
   * recomputes. Both have to be bumped, not just `treeNodes`: `rows()` — which
   * is what the template renders and what the arrow keys walk — is computed
   * from `filteredNodes`, so bumping only the other one left the tree visibly
   * unchanged when a branch was opened from the keyboard.
   */
  private republish() {
    this.treeNodes.update(nodes => [...nodes]);
    this.filteredNodes.update(nodes => [...nodes]);
  }

  private deselectAll(nodes: IfcNode[]) {
    nodes.forEach(n => {
      n.selected = false;
      if (n.children) this.deselectAll(n.children);
    });
  }

  private propagateVisibility(node: IfcNode, visible: boolean) {
    node.visible = visible;
    node.children?.forEach(c => this.propagateVisibility(c, visible));
  }
}
