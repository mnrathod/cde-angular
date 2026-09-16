import { Component, Input, ChangeDetectionStrategy } from '@angular/core';

import { IfcNode } from './ifc-tree.component';
import { iconForType } from './ifc-icons';

/**
 * What is known about the selected element.
 *
 * <p>Split out of `IfcTreeComponent`, which had grown past the §3.3 limits
 * once the tree gained its keyboard handling. The panel is a natural seam: it
 * reads one node and renders it, and shares nothing with the tree's navigation
 * but the node itself.
 *
 * <p>A description list rather than a grid of divs, so the pairing of a field
 * with its value is in the markup rather than only in the layout — §1A.4's
 * point about tables, applied to the smaller case.
 */
@Component({
  selector: 'app-ifc-properties',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (node) {
      <div class="border-t border-gray-200 p-3 flex-shrink-0"
           style="max-height:200px;overflow-y:auto">
        <h3 class="text-xs font-semibold text-gray-600 mb-2 flex items-center gap-1">
          <span aria-hidden="true">{{ icon(node.type) }}</span>
          {{ node.name || node.type }}
        </h3>

        <dl class="space-y-1">
          <div class="flex justify-between text-xs py-0.5 border-b border-gray-50">
            <dt class="text-gray-500">Type</dt>
            <dd class="text-gray-800 font-mono text-xs">{{ node.type }}</dd>
          </div>
          @for (property of properties(); track property.key) {
            <div class="flex justify-between text-xs py-0.5 border-b border-gray-50">
              <dt class="text-gray-500">{{ property.key }}</dt>
              <dd class="text-gray-800 truncate max-w-24"
                  [title]="property.value">{{ property.value }}</dd>
            </div>
          }
        </dl>
      </div>
    }
  `,
})
export class IfcPropertiesComponent {
  /** The selected element, or nothing when none is. */
  @Input() node: IfcNode | null = null;

  icon = iconForType;

  properties(): Array<{ key: string; value: string }> {
    if (!this.node?.properties) return [];
    return Object.entries(this.node.properties)
      .map(([key, value]) => ({ key, value }));
  }
}
