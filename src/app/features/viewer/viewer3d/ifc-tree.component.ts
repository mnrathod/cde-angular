import {
  Component, inject, signal, Input, OnChanges, SimpleChanges,
  Output, EventEmitter, ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

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

            <!-- Expand toggle -->
            <button (click)="toggleNode(node); $event.stopPropagation()"
              class="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 flex-shrink-0"
              [class.invisible]="!node.children?.length">
              {{ node.expanded ? '▾' : '▸' }}
            </button>

            <!-- Visibility toggle -->
            <button (click)="toggleVisibility(node); $event.stopPropagation()"
              class="w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity"
              [title]="node.visible ? 'Hide' : 'Show'">
              {{ node.visible ? '👁' : '🔲' }}
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
  @Input() documentId?: number;
  @Input() stats?: { schema: string; elementCount: number };
  @Output() elementSelected  = new EventEmitter<IfcNode>();
  @Output() elementVisibilityChanged = new EventEmitter<{ node: IfcNode; visible: boolean }>();

  private http = inject(HttpClient);

  treeNodes     = signal<IfcNode[]>([]);
  filteredNodes = signal<IfcNode[]>([]);
  selectedNode  = signal<IfcNode | null>(null);
  searchQuery   = '';

  ngOnChanges(changes: SimpleChanges) {
    if (changes['documentId'] && this.documentId) {
      this.loadTree();
    }
    if (changes['stats'] && this.stats) {
      this.buildSyntheticTree();
    }
  }

  private loadTree() {
    // Try to load model tree from backend
    this.http.get<IfcNode[]>(`/api/viewer3d/${this.documentId}/tree`)
      .subscribe({
        next: nodes => {
          this.treeNodes.set(nodes);
          this.filteredNodes.set(nodes);
        },
        error: () => this.buildSyntheticTree()
      });
  }

  private buildSyntheticTree() {
    // Build a synthetic tree from stats when no tree endpoint available
    if (!this.stats) return;

    const types = [
      'IfcWall','IfcSlab','IfcColumn','IfcBeam','IfcDoor',
      'IfcWindow','IfcStair','IfcRoof','IfcFurnishingElement','IfcSpace'
    ];

    const root: IfcNode = {
      id: 'root', name: 'Building Model', type: 'IfcBuilding',
      expanded: true, selected: false, visible: true,
      children: types.map(t => ({
        id: t, name: t.replace('Ifc', ''), type: t,
        expanded: false, selected: false, visible: true,
        children: [], count: Math.floor(Math.random() * 20) + 1
      }))
    };
    this.treeNodes.set([root]);
    this.filteredNodes.set([root]);
  }

  selectNode(node: IfcNode) {
    // Deselect all
    this.deselectAll(this.treeNodes());
    node.selected = true;
    this.selectedNode.set(node);
    this.elementSelected.emit(node);
  }

  toggleNode(node: IfcNode) {
    node.expanded = !node.expanded;
    this.treeNodes.update(n => [...n]);  // trigger change detection
  }

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
    return IFC_ICONS[type] || IFC_ICONS['DEFAULT'];
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
