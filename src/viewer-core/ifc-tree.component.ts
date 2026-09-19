import {
  Component, signal, computed, Input, OnChanges, SimpleChanges,
  Output, EventEmitter, ChangeDetectionStrategy
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { IfcNode, deselectAll, setBranchVisibility } from './ifc-node';
import { commandForKey, matchingNodes, visibleRows } from './tree-navigation';
import { TreeTabStop } from './tree-tab-stop';
import { IfcTreeRowComponent } from './ifc-tree-row.component';
import { IfcPropertiesComponent } from './ifc-properties.component';

@Component({
  selector: 'app-ifc-tree',
  standalone: true,
  imports: [FormsModule, IfcTreeRowComponent, IfcPropertiesComponent],
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

      <!-- Tree. One tab stop; the arrows move within it. The rows are
           flattened and carry their depth in aria-level, which is the
           documented alternative to nesting them in role="group" containers
           and keeps the arrow-key list the same list the DOM is in. See
           tree-navigation.ts, tree-tab-stop.ts and onKeydown(). -->
      <div class="flex-1 overflow-y-auto p-1"
           role="tree"
           aria-labelledby="model-tree-heading"
           (keydown)="onKeydown($event)">
        @for (row of rows(); track row.node.id) {
          <app-ifc-tree-row
            [row]="row"
            [tabbable]="tabStopId() === row.node.id"
            (focus)="tabStop.focusedId.set(row.node.id)"
            (selected)="selectNode($event)"
            (expandToggled)="toggleNode($event)"
            (visibilityToggled)="toggleVisibility($event)"/>
        }
        @if (rows().length === 0) {
          <div class="text-xs text-gray-400 text-center py-8">
            {{ searchQuery ? noMatchesLabel : noModelLabel }}
          </div>
        }
      </div>

      <app-ifc-properties [node]="selectedNode()"></app-ifc-properties>
    </div>
  `
})
export class IfcTreeComponent implements OnChanges {
  /**
   * The model hierarchy, supplied by the host.
   *
   * <p>Undefined means "not loaded yet" and shows the empty state; an empty
   * array means "loaded, and the model has no hierarchy". The two are
   * different and a caller that conflates them gets a spinner forever.
   *
   * <p>Nothing is invented here for the empty case. Deriving a fallback
   * needs the geometry, which only the host has, so `treeFromGeometryGroups`
   * builds one from the types the extractor actually found and the host
   * binds the result. `ifc-tree.component.spec.ts` states why that matters.
   */
  @Input() nodes?: IfcNode[];
  @Output() elementSelected  = new EventEmitter<IfcNode>();
  @Output() elementVisibilityChanged = new EventEmitter<{ node: IfcNode; visible: boolean }>();

  treeNodes     = signal<IfcNode[]>([]);
  filteredNodes = signal<IfcNode[]>([]);
  selectedNode  = signal<IfcNode | null>(null);
  searchQuery   = '';

  /** The tree's single tab stop. Constructed, never injected: this component
   *  has no injector, which `ifc-tree.component.spec.ts` asserts. */
  readonly tabStop = new TreeTabStop();

  /** The rows on screen, flattened, with their ARIA positions. */
  rows = computed(() => visibleRows(this.filteredNodes()));

  readonly tabStopId = computed(() => this.tabStop.currentIn(this.rows()));

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
    deselectAll(this.treeNodes());
    node.selected = true;
    this.selectedNode.set(node);
    this.tabStop.focusedId.set(node.id);
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
    const command = commandForKey(
      event.key, this.rows(), this.tabStop.focusedId());
    if (command.kind === 'none') return;

    event.preventDefault();

    switch (command.kind) {
      case 'focus':
        this.tabStop.moveTo(
          command.node.id, event.currentTarget as HTMLElement | null);
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

  /** Show or hide one node's children. The row states it; this does it. */
  toggleNode(node: IfcNode) {
    node.expanded = !node.expanded;
    this.republish();
  }

  /**
   * Show or hide one node and everything under it.
   *
   * <p>The event is emitted once, for the node that was clicked, while the
   * descendants are marked here. A listener wanting the full set expands it
   * itself — `elementTypesIn` in `model-visibility` is what does that.
   */
  toggleVisibility(node: IfcNode) {
    node.visible = !node.visible;
    setBranchVisibility(node, node.visible);
    this.republish();
    this.elementVisibilityChanged.emit({ node, visible: node.visible });
  }

  filterTree(query: string) {
    this.filteredNodes.set(matchingNodes(this.treeNodes(), query));
  }

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
}
