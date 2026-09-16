/**
 * What each key means in the model tree.
 *
 * <p>Stated here rather than only through the rendered component, because the
 * interesting cases are the edges — the last visible row, a leaf whose parent
 * is three levels up, a branch that is closed — and each of them needs a
 * specific tree standing in a specific state. Building those as data is both
 * quicker and clearer than arranging them in a fixture.
 *
 * <p>The component's own spec still drives the real thing from real key
 * events; this is the layer below it.
 */
import { describe, expect, it } from 'vitest';

import { IfcNode } from './ifc-tree.component';
import { commandForKey, parentRow, visibleRows } from './tree-navigation';

function node(id: string, children: IfcNode[] = [], expanded = false): IfcNode {
  return {
    id, name: id, type: 'IfcWall',
    expanded, selected: false, visible: true, children,
  };
}

/** A storey holding two walls, alongside a second storey and a roof. */
function model(expanded = false): IfcNode[] {
  return [
    node('level-0', [node('wall-a'), node('wall-b')], expanded),
    node('level-1'),
    node('roof'),
  ];
}

const idsOf = (nodes: IfcNode[]) => visibleRows(nodes).map((row) => row.node.id);

describe('the rows a reader can see', () => {

  it('leaves a closed branch\'s children out', () => {
    expect(idsOf(model(false))).toEqual(['level-0', 'level-1', 'roof']);
  });

  it('includes an open branch\'s children, in place', () => {
    expect(idsOf(model(true))).toEqual(['level-0', 'wall-a', 'wall-b', 'level-1', 'roof']);
  });

  it('numbers depth from one, because aria-level does', () => {
    const [root, child] = visibleRows(model(true));

    expect(root!.level).toBe(1);
    expect(child!.level).toBe(2);
  });

  it('sizes each set by its own siblings, not by the whole tree', () => {
    // The two walls are a set of two inside a set of three.
    const [, wall] = visibleRows(model(true));

    expect(wall!.setSize).toBe(2);
    expect(wall!.positionInSet).toBe(1);
  });

  it('treats a branch with no children as a leaf however it is flagged', () => {
    // `expanded: true` on a childless node should not produce a phantom level.
    expect(idsOf([node('lonely', [], true)])).toEqual(['lonely']);
  });
});

describe('finding the row above', () => {

  it('is the nearest row at a shallower level', () => {
    const rows = visibleRows(model(true));

    expect(parentRow(rows, 2)?.node.id).toBe('level-0');
  });

  it('is nothing at the top level', () => {
    const rows = visibleRows(model(true));

    expect(parentRow(rows, 0)).toBeUndefined();
  });
});

describe('what a key does', () => {

  const rows = visibleRows(model(true));
  const command = (key: string, focused: string | null) =>
    commandForKey(key, rows, focused);

  it('moves down through what is on screen, not through the tree', () => {
    // wall-a is level-0's child, so down from level-0 is into it.
    expect(command('ArrowDown', 'level-0')).toEqual({ kind: 'focus', node: rows[1]!.node });
  });

  it('stops at the last row rather than wrapping to the first', () => {
    // Wrapping is the behaviour a reader cannot tell from being stuck.
    expect(command('ArrowDown', 'roof')).toEqual({ kind: 'none' });
  });

  it('stops at the first row rather than wrapping to the last', () => {
    expect(command('ArrowUp', 'level-0')).toEqual({ kind: 'none' });
  });

  it('opens a closed branch with Right', () => {
    const closed = visibleRows(model(false));

    expect(commandForKey('ArrowRight', closed, 'level-0'))
      .toEqual({ kind: 'expand', node: closed[0]!.node });
  });

  it('steps into an already-open branch with Right', () => {
    expect(command('ArrowRight', 'level-0')).toEqual({ kind: 'focus', node: rows[1]!.node });
  });

  it('does nothing on Right at a leaf', () => {
    expect(command('ArrowRight', 'wall-a')).toEqual({ kind: 'none' });
  });

  it('closes an open branch with Left', () => {
    expect(command('ArrowLeft', 'level-0')).toEqual({ kind: 'collapse', node: rows[0]!.node });
  });

  it('climbs to the parent with Left from a leaf', () => {
    // How a reader gets out of a deep branch without arrowing up through
    // every one of its siblings.
    expect(command('ArrowLeft', 'wall-b')).toEqual({ kind: 'focus', node: rows[0]!.node });
  });

  it('does nothing on Left at a closed top-level row', () => {
    expect(command('ArrowLeft', 'roof')).toEqual({ kind: 'none' });
  });

  it('selects with Enter and with Space', () => {
    expect(command('Enter', 'roof')).toEqual({ kind: 'select', node: rows[4]!.node });
    expect(command(' ', 'roof')).toEqual({ kind: 'select', node: rows[4]!.node });
  });

  it('jumps to the ends with Home and End', () => {
    expect(command('Home', 'roof')).toEqual({ kind: 'focus', node: rows[0]!.node });
    expect(command('End', 'level-0')).toEqual({ kind: 'focus', node: rows[4]!.node });
  });

  it('claims no key it does not handle', () => {
    // The caller consumes the event only for a real command, so anything
    // answered `none` here is a key that still reaches the page. Tab in
    // particular: swallowing it would trap a reader in the panel (§1A.2).
    for (const key of ['Tab', 'Escape', 'a', 'F5', 'PageDown']) {
      expect(command(key, 'level-0'), key).toEqual({ kind: 'none' });
    }
  });

  it('enters at the top for a key that means "downwards"', () => {
    expect(command('ArrowDown', null)).toEqual({ kind: 'focus', node: rows[0]!.node });
    expect(command('Home', null)).toEqual({ kind: 'focus', node: rows[0]!.node });
  });

  it('enters at the bottom for a key that means "upwards"', () => {
    // End means the end of the list whether or not a row was focused first.
    expect(command('End', null)).toEqual({ kind: 'focus', node: rows[4]!.node });
    expect(command('ArrowUp', null)).toEqual({ kind: 'focus', node: rows[4]!.node });
  });

  it('does nothing at all in an empty tree', () => {
    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter']) {
      expect(commandForKey(key, [], null), key).toEqual({ kind: 'none' });
    }
  });

  it('recovers when the focused row is no longer on screen', () => {
    // A branch closing takes its children with it, and the focused id can
    // name one of them. Entering at the top beats answering nothing, which
    // would leave the arrows dead until the reader clicked something.
    expect(commandForKey('ArrowDown', visibleRows(model(false)), 'wall-a'))
      .toEqual({ kind: 'focus', node: visibleRows(model(false))[0]!.node });
  });
});
