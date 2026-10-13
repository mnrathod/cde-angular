import { SimpleChange, SimpleChanges } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { IfcTreeComponent } from './ifc-tree.component';
import { IfcNode } from './ifc-node';

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

  describe('the tree region', () => {
    // The rest of this suite builds the component directly and tests its
    // logic. This one needs the rendered markup, so it mounts it.
    it('heads the tree at level two, and goes on naming it', () => {
      // "Model Tree" was a div whose own translator note called it a heading,
      // and the properties panel below uses h3 — so the 3D route went from the
      // toolbar's h1 straight to that h3 (SC 2.4.6). It has to keep naming the
      // tree through aria-labelledby as well, which is the whole reason the
      // element carries an id.
      TestBed.configureTestingModule({ imports: [IfcTreeComponent] });
      const fixture = TestBed.createComponent(IfcTreeComponent);
      fixture.componentInstance.nodes = NODES;
      fixture.componentInstance.ngOnChanges(changed({ nodes: NODES }));
      fixture.detectChanges();

      const host = fixture.nativeElement as HTMLElement;
      const heading = host.querySelector('h2#model-tree-heading');
      const tree = host.querySelector('[role="tree"]');

      expect(heading?.textContent).toContain('Model Tree');
      expect(tree?.getAttribute('aria-labelledby')).toBe('model-tree-heading');
    });
  });

  it('renders the nodes it is handed', () => {
    const tree = new IfcTreeComponent();
    tree.nodes = NODES;

    tree.ngOnChanges(changed({ nodes: NODES }));

    expect(tree.treeNodes()).toEqual(NODES);
    expect(tree.filteredNodes()).toEqual(NODES);
  });

  it('shows nothing while no tree has arrived, rather than an empty model', () => {
    // Undefined is "still loading". Filling it with a guess here would show a
    // plausible, wrong hierarchy for a moment and then replace it.
    const tree = new IfcTreeComponent();

    tree.ngOnChanges(changed({ nodes: undefined }));

    expect(tree.treeNodes()).toEqual([]);
  });

  it('invents nothing when the tree arrives empty', () => {
    // It used to answer this case itself, with ten fixed IFC types and a
    // Math.random() quantity each. §1A.4 makes this tree the accessible
    // equivalent of a canvas some readers cannot see, which makes it the worst
    // place in the product to show made-up data.
    //
    // The fallback now lives in treeFromGeometryGroups, which needs the
    // geometry — something only the host has — so an empty array stays empty
    // here and the host binds a derived tree when it has one.
    const tree = new IfcTreeComponent();
    tree.nodes = [];

    tree.ngOnChanges(changed({ nodes: [] }));

    expect(tree.treeNodes()).toEqual([]);
  });

  it('needs no injector, because it fetches nothing', () => {
    // The regression this whole file guards. `new` throwing here would mean a
    // dependency came back; viewer-core.boundary.spec.ts asserts the same
    // property from the other side, by reading the source.
    expect(() => new IfcTreeComponent()).not.toThrow();
  });
});
