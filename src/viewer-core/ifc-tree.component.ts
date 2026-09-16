import {
  Component, signal, Input, OnChanges, SimpleChanges,
  Output, EventEmitter, ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

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

const IFC_ICONS: Record<string, string> = {
  IfcProject:        '🏢',
  IfcSite:           '🌍',
  IfcBuilding:       '🏛',
  IfcBuildingStorey: '🏢',
  IfcWall:           '🧱',
  IfcWallStandardCase: '🧱',
  IfcSlab:           '⬜',
  IfcRoof:           '🏠',
  IfcColumn:         '🏛',
  IfcBeam:           '━',
  IfcDoor:           '🚪',
  IfcWindow:         '🪟',
  IfcStair:          '🪜',
  IfcFurnishingElement: '🪑',
  IfcSpace:          '📐',
  IfcFlowTerminal:   '💡',
  IfcFlowSegment:    '〰',
  DEFAULT:           '🔷',
};

@Component({
  selector: 'app-ifc-tree',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col h-full bg-white border-l border-gray-200" style="min-width:240px;max-width:280px">

      <!-- Header -->
      <div class="p-3 border-b border-gray-200 flex-shrink-0">
        <div class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Model Tree</div>
        <!-- Search -->
        <input [(ngModel)]="searchQuery" (ngModelChange)="filterTree($event)"
          placeholder="Search elements..."
          class="w-full px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-accent" />
      </div>

      <!-- Tree -->
      <div class="flex-1 overflow-y-auto p-1">
        @for (node of filteredNodes(); track node.id) {
          <ng-container *ngTemplateOutlet="treeNode; context: { $implicit: node, depth: 0 }"></ng-container>
        }
        @if (filteredNodes().length === 0) {
          <div class="text-xs text-gray-400 text-center py-8">
            {{ searchQuery ? 'No matching elements' : 'No model data' }}
          </div>
        }
      </div>

      <!-- Properties panel -->
      @if (selectedNode()) {
        <div class="border-t border-gray-200 p-3 flex-shrink-0" style="max-height:200px;overflow-y:auto">
          <div class="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
            <span>{{ getIcon(selectedNode()!.type) }}</span>
            {{ selectedNode()!.name }}
          </div>
          <div class="space-y-1">
            <div class="flex justify-between text-xs py-0.5 border-b border-gray-50">
              <span class="text-gray-500">Type</span>
              <span class="text-gray-800 font-mono text-xs">{{ selectedNode()!.type }}</span>
            </div>
            @for (prop of getProperties(selectedNode()!); track prop.key) {
              <div class="flex justify-between text-xs py-0.5 border-b border-gray-50">
                <span class="text-gray-500">{{ prop.key }}</span>
                <span class="text-gray-800 truncate max-w-24" [title]="prop.value">{{ prop.value }}</span>
              </div>
            }
          </div>
        </div>
      }

      <!-- Node template -->
      <ng-template #treeNode let-node let-depth="depth">
        <div class="group">
          <div
            class="flex items-center gap-1 py-1 px-2 rounded cursor-pointer hover:bg-gray-50 transition-colors text-xs"
            [style.padding-left.px]="8 + depth * 12"
            [class.bg-blue-50]="node.selected"
            [class.text-accent]="node.selected"
            (click)="selectNode(node)"
            (dblclick)="toggleNode(node)">

            <!-- Expand toggle. See toggleNode() for why it is shaped this way. -->
            <button type="button"
              (click)="toggleNode(node); $event.stopPropagation()"
              class="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 flex-shrink-0"
              [class.invisible]="!node.children?.length"
              [attr.aria-expanded]="node.children?.length ? node.expanded : null"
              [attr.aria-label]="node.children?.length
                                   ? 'Contents of ' + (node.name || node.type)
                                   : null">
              <span aria-hidden="true">{{ node.expanded ? '▾' : '▸' }}</span>
            </button>

            <!-- Visibility toggle. See toggleVisibility() for why it is
                 shaped this way. -->
            <button type="button"
              (click)="toggleVisibility(node); $event.stopPropagation()"
              class="w-6 h-6 flex items-center justify-center flex-shrink-0 transition-opacity
                     opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              [class.opacity-100]="!node.visible"
              [attr.aria-pressed]="!node.visible"
              [attr.aria-label]="'Hide ' + (node.name || node.type)">
              <span aria-hidden="true">{{ node.visible ? '👁' : '🔲' }}</span>
            </button>

            <!-- Icon + Name -->
            <span class="flex-shrink-0">{{ getIcon(node.type) }}</span>
            <span class="truncate flex-1" [class.line-through]="!node.visible" [class.text-gray-400]="!node.visible">
              {{ node.name || node.type.replace('Ifc', '') }}
            </span>

            <!-- Count badge -->
            @if (node.count && node.count > 1) {
              <span class="text-xs text-gray-400 ml-auto flex-shrink-0">×{{ node.count }}</span>
            }
          </div>

          <!-- Children -->
          @if (node.expanded && node.children?.length) {
            @for (child of node.children; track child.id) {
              <ng-container *ngTemplateOutlet="treeNode; context: { $implicit: child, depth: depth + 1 }"></ng-container>
            }
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
    this.elementSelected.emit(node);
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
   *
   * <p>This is not the full `role="tree"` pattern — that puts `aria-expanded`
   * on the row and brings roving tabindex and arrow-key navigation with it.
   * Worth doing, considerably larger than making this button announce itself.
   */
  toggleNode(node: IfcNode) {
    node.expanded = !node.expanded;
    this.treeNodes.update(n => [...n]);  // trigger change detection
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
    this.treeNodes.update(n => [...n]);
    this.elementVisibilityChanged.emit({ node, visible: node.visible });
  }

  filterTree(query: string) {
    if (!query.trim()) {
      this.filteredNodes.set(this.treeNodes());
      return;
    }
    const q = query.toLowerCase();
    const filter = (nodes: IfcNode[]): IfcNode[] =>
      nodes.flatMap(n => {
        const match = n.name.toLowerCase().includes(q) || n.type.toLowerCase().includes(q);
        const filteredChildren = filter(n.children || []);
        if (match || filteredChildren.length) {
          return [{ ...n, expanded: true, children: filteredChildren }];
        }
        return [];
      });
    this.filteredNodes.set(filter(this.treeNodes()));
  }

  getIcon(type: string): string {
    // The fallback needs its own fallback: an index into a record is optional
    // under noUncheckedIndexedAccess even for a key the literal defines, and
    // an icon is decoration — returning an empty string is better than an
    // undefined reaching the template.
    return IFC_ICONS[type] ?? IFC_ICONS['DEFAULT'] ?? '';
  }

  getProperties(node: IfcNode): Array<{key: string; value: string}> {
    if (!node.properties) return [];
    return Object.entries(node.properties).map(([key, value]) => ({ key, value }));
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
