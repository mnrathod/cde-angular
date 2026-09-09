import { SimpleChange, SimpleChanges } from '@angular/core';
import { IfcTreeComponent, IfcNode } from './ifc-tree.component';

/**
 * What the tree does with what it is given.
 *
 * <p>Constructed directly rather than through `TestBed`. The component has no
 * injected dependencies — it used to have exactly one, Angular's HTTP client,
 * and removing it is what this file exists to protect. A test that needs a
 * testing module to instantiate it would stop failing on the day someone
 * added a service back.
 *
 * <p>The distinction under test is between "no tree yet" and "a tree with
 * nothing in it". They look the same to a careless caller and mean opposite
 * things: the first is a load in flight, the second is a model whose
 * hierarchy could not be read, where §1A.4 requires the synthetic fallback
 * because the tree is the accessible route to a model that is otherwise a
 * WebGL canvas.
 */
describe('IfcTreeComponent', () => {

  const NODES: IfcNode[] = [
    { id: '1', name: 'Level 00', type: 'IfcBuildingStorey', children: [],
      expanded: false, selected: false, visible: true },
    { id: '2', name: 'Level 01', type: 'IfcBuildingStorey', children: [],
      expanded: false, selected: false, visible: true },
  ];

  function changed(props: Record<string, unknown>): SimpleChanges {
    return Object.fromEntries(
      Object.entries(props).map(([k, v]) => [k, new SimpleChange(undefined, v, true)]),
    ) as SimpleChanges;
  }

  it('renders the nodes it is handed', () => {
    const tree = new IfcTreeComponent();
    tree.nodes = NODES;

    tree.ngOnChanges(changed({ nodes: NODES }));

    expect(tree.treeNodes()).toEqual(NODES);
    expect(tree.filteredNodes()).toEqual(NODES);
  });

  it('shows nothing while no tree has arrived, rather than an empty model', () => {
    // Undefined is "still loading". Deriving a synthetic tree here would show
    // a plausible, wrong hierarchy for a moment and then replace it.
    const tree = new IfcTreeComponent();
    tree.stats = { schema: 'IFC4', elementCount: 120 };

    tree.ngOnChanges(changed({ nodes: undefined }));

    expect(tree.treeNodes()).toEqual([]);
  });

  it('falls back to the element counts when the tree arrives empty', () => {
    // An empty array is an answer: the model has no readable hierarchy. §1A.4
    // makes this the accessible route to the model, so an empty panel beside
    // the canvas is not a neutral outcome — it is the only route, missing.
    const tree = new IfcTreeComponent();
    tree.stats = { schema: 'IFC4', elementCount: 120 };
    tree.nodes = [];

    tree.ngOnChanges(changed({ nodes: [] }));

    expect(tree.treeNodes().length).toBeGreaterThan(0);
    expect(tree.treeNodes()[0]?.type).toBe('IfcBuilding');
  });

  it('needs no injector, because it fetches nothing', () => {
    // The regression this whole file guards. `new` throwing here would mean a
    // dependency came back; viewer-core.boundary.spec.ts asserts the same
    // property from the other side, by reading the source.
    expect(() => new IfcTreeComponent()).not.toThrow();
  });
});
