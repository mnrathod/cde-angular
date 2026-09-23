/**
 * Rendering an IFC tree for a test, and finding its controls the way a
 * reader would.
 *
 * <p>Shared because three suites render the same component — the visibility
 * control, the row as a tree item, and moving between rows — and a second
 * copy of `renderTree` is how two of them would come to be rendering
 * subtly different components while appearing to agree.
 *
 * <p>Queries are by role and accessible name rather than by CSS class (§14).
 * The point being asserted is that assistive technology can find and operate
 * these controls, and a class selector would not demonstrate it — it would
 * pass just as happily on a `<div>` nobody can reach.
 *
 * <p>`ifc-tree.component.spec.ts` builds the component with `new` on purpose,
 * to prove it needs no injector. That guarantee is untouched by rendering it
 * here: a standalone component with no providers allows both.
 */
import { TestBed } from '@angular/core/testing';

import { IfcTreeComponent } from './ifc-tree.component';
import { IfcNode } from './ifc-node';

/** One visible leaf, which is the starting point every suite needs. */
export function storey(): IfcNode {
  return {
    id: 'walls', name: 'Walls', type: 'IfcWall',
    expanded: false, selected: false, visible: true, children: [],
  };
}

export function renderTree(nodes: IfcNode[]) {
  TestBed.configureTestingModule({ imports: [IfcTreeComponent] });
  const fixture = TestBed.createComponent(IfcTreeComponent);
  fixture.componentInstance.nodes = nodes;
  fixture.componentInstance.ngOnChanges({
    nodes: { currentValue: nodes, previousValue: undefined,
             firstChange: true, isFirstChange: () => true },
  });
  fixture.detectChanges();
  return fixture;
}

/** Every button whose accessible name mentions hiding. */
export function visibilityToggles(element: HTMLElement): HTMLButtonElement[] {
  return [...element.querySelectorAll('button')]
    .filter((button) => (button.getAttribute('aria-label') ?? '').startsWith('Hide '));
}
