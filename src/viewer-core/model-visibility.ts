/**
 * Which parts of a model a hierarchy node controls.
 *
 * The model tree is the accessible route to the model (§1A.4) and the thing a
 * user actually clicks; the geometry is a flat set of buffers cut into one
 * contiguous run per element type. This maps between them, so hiding "Walls"
 * in the tree hides the run that draws walls.
 *
 * Kept pure and separate from the component for two reasons. It is the part
 * worth testing — a wrong slot silently hides the wrong elements rather than
 * failing — and testing it inside the component would need a WebGL context,
 * which is exactly the kind of thing that ends up untested.
 */
import { IfcNode } from './ifc-tree.component';
import { ModelGeometryGroup } from './model-geometry';

/**
 * Every element type a node stands for, including its descendants'.
 *
 * A branch node carries no geometry of its own — the root is `IfcBuilding`,
 * which nothing draws — so hiding it has to mean hiding everything beneath
 * it. The tree component already marks the descendants hidden but emits a
 * single event for the node that was clicked, so the expansion happens here.
 *
 * Types are deduplicated: the same type can legitimately appear at several
 * places in a hierarchy, and toggling a material twice is wasted work.
 */
export function elementTypesIn(node: IfcNode): string[] {
  const types = new Set<string>();

  const visit = (current: IfcNode) => {
    if (current.type) types.add(current.type);
    for (const child of current.children ?? []) visit(child);
  };
  visit(node);

  return [...types];
}

/**
 * The material slots that draw those types.
 *
 * A slot is a group's index in the group table, which is also its index in
 * the material array — `addGroup(start, count, materialIndex)` is called with
 * exactly that when the scene is built, so the two stay in step by
 * construction rather than by a lookup that could drift.
 *
 * A type with no geometry yields nothing. That is normal, not an error: the
 * hierarchy lists what the model contains, the groups list what could be
 * extracted and rendered, and those are not the same set — a synthetic tree
 * in particular names types this model may not have at all.
 */
export function materialSlotsForTypes(
  groups: readonly ModelGeometryGroup[],
  types: readonly string[],
): number[] {
  const wanted = new Set(types);

  return groups.reduce<number[]>((slots, group, slot) => {
    if (wanted.has(group.type)) slots.push(slot);
    return slots;
  }, []);
}
