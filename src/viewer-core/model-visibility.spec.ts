/**
 * Resolving a hierarchy node to the material slots it controls.
 *
 * This is the arithmetic behind the visibility toggles, and its failure mode
 * is silent: a wrong slot hides the wrong elements and nothing raises. So the
 * assertions are on which slots come back, not on whether the call succeeded.
 */
import { describe, expect, it } from 'vitest';

import { IfcNode } from './ifc-tree.component';
import { ModelGeometryGroup } from './model-geometry';
import { elementTypesIn, materialSlotsForTypes } from './model-visibility';

function group(type: string): ModelGeometryGroup {
  return { type, start: 0, count: 3, color: [1, 1, 1], opacity: 1 };
}

function node(type: string, children: IfcNode[] = []): IfcNode {
  return {
    id: type, name: type.replace('Ifc', ''), type,
    expanded: false, selected: false, visible: true, children,
  };
}

describe('the element types a node stands for', () => {

  it('is its own type, for a leaf', () => {
    expect(elementTypesIn(node('IfcWall'))).toEqual(['IfcWall']);
  });

  it('includes every descendant, so hiding a branch hides what is under it', () => {
    // The root is IfcBuilding, which nothing draws. Without the descendants
    // the root toggle would resolve to no slots and appear to do nothing.
    const tree = node('IfcBuilding', [node('IfcWall'), node('IfcSlab')]);

    expect(elementTypesIn(tree).sort()).toEqual(['IfcBuilding', 'IfcSlab', 'IfcWall']);
  });

  it('reaches types nested more than one level down', () => {
    const tree = node('IfcBuilding', [node('IfcBuildingStorey', [node('IfcWall')])]);

    expect(elementTypesIn(tree)).toContain('IfcWall');
  });

  it('lists a repeated type once', () => {
    // The same type appears under several storeys in a real hierarchy.
    const tree = node('IfcBuilding', [
      node('IfcBuildingStorey', [node('IfcWall')]),
      node('IfcBuildingStorey', [node('IfcWall')]),
    ]);

    expect(elementTypesIn(tree).filter((type) => type === 'IfcWall')).toHaveLength(1);
  });

  it('copes with a node that has no children array at all', () => {
    const childless = { id: 'x', name: 'x', type: 'IfcWall',
                        expanded: false, selected: false, visible: true } as IfcNode;

    expect(() => elementTypesIn(childless)).not.toThrow();
  });
});

describe('the material slots those types are drawn by', () => {

  const groups = [group('IfcWall'), group('IfcSlab'), group('IfcWindow')];

  it('is the group position, because that is the material index', () => {
    // addGroup(start, count, materialIndex) is called with the group's index
    // in this same array, so position is the whole mapping.
    expect(materialSlotsForTypes(groups, ['IfcSlab'])).toEqual([1]);
  });

  it('returns every matching slot for a branch covering several types', () => {
    expect(materialSlotsForTypes(groups, ['IfcWall', 'IfcWindow'])).toEqual([0, 2]);
  });

  it('returns nothing for a type this model has no geometry for', () => {
    // A synthetic hierarchy names types the model need not contain. Toggling
    // one is a no-op, not an error.
    expect(materialSlotsForTypes(groups, ['IfcSpace'])).toEqual([]);
  });

  it('ignores the types it was not asked about', () => {
    // The guard against "hide walls" quietly hiding the whole building.
    expect(materialSlotsForTypes(groups, ['IfcWall'])).toEqual([0]);
  });

  it('returns nothing when the model has no groups yet', () => {
    expect(materialSlotsForTypes([], ['IfcWall'])).toEqual([]);
  });

  it('resolves a whole tree end to end', () => {
    const tree = node('IfcBuilding', [node('IfcWall'), node('IfcWindow')]);

    expect(materialSlotsForTypes(groups, elementTypesIn(tree))).toEqual([0, 2]);
  });
});
