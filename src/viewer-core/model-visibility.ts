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
/**
 * A model hierarchy derived from the geometry, for a model that has no tree.
 *
 * <p>This replaces a fabrication. When no hierarchy endpoint answered, the
 * tree component used to invent one: a fixed list of ten IFC types, each given
 * a quantity from `Math.floor(Math.random() * 20) + 1`. A reader was shown
 * types their model might not contain, with counts that were made up and
 * changed on reload. §1A.4 makes this tree the accessible equivalent of a
 * WebGL canvas someone may not be able to see at all, so it is the one place
 * invention is least excusable — the fallback route has to be true, or the
 * people relying on it are the only ones being misled.
 *
 * <p>The groups are a real answer to a narrower question. They name the types
 * the extractor actually found and how many elements of each it read, so this
 * is a flat and shallow hierarchy but an accurate one. It is not a substitute
 * for the spatial hierarchy — there are no storeys here — and it does not
 * pretend to be: one level of real types beats three levels of invented ones.
 *
 * @param groups the geometry's group table, in the order it draws them
 * @param schema the IFC schema, shown on the root so the reader knows what
 *               they are looking at
 */
export function treeFromGeometryGroups(
  groups: readonly ModelGeometryGroup[],
  schema?: string,
): IfcNode[] {
  if (!groups.length) return [];

  const byName = (left: IfcNode, right: IfcNode) => left.name.localeCompare(right.name);

  const children: IfcNode[] = groups.map((group) => ({
    id: group.type,
    name: group.type.replace(/^Ifc/, ''),
    type: group.type,
    expanded: false,
    selected: false,
    visible: true,
    children: [],
    // Omitted rather than zero when the container predates the count, so the
    // tree shows no quantity instead of claiming the model holds none.
    ...(group.elementCount > 0 ? { count: group.elementCount } : {}),
  })).sort(byName);

  return [{
    id: 'model',
    name: schema ? `Model (${schema})` : 'Model',
    type: 'IfcBuilding',
    expanded: true,
    selected: false,
    visible: true,
    children,
  }];
}

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
