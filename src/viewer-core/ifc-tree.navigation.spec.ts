/**
 * The tree's single tab stop, and the arrows that move within it.
 *
 * <p>A tree is one stop in the page's tab order, not one per row. A model with
 * four hundred elements would otherwise put four hundred stops between a
 * reader and whatever follows the panel, which is the failure the roving
 * tabindex exists to prevent.
 */
import { describe, expect, it } from 'vitest';

import { IfcNode } from './ifc-node';
import { renderTree, storey, visibilityToggles } from './ifc-tree.rendering';

describe('moving around the tree', () => {

  function threeStoreys(): IfcNode[] {
    return [
      { id: 'a', name: 'Level 00', type: 'IfcBuildingStorey',
        expanded: false, selected: false, visible: true,
        children: [{ id: 'a-walls', name: 'Walls', type: 'IfcWall',
                     expanded: false, selected: false, visible: true, children: [] }] },
      { id: 'b', name: 'Level 01', type: 'IfcBuildingStorey',
        expanded: false, selected: false, visible: true, children: [] },
      { id: 'c', name: 'Roof', type: 'IfcRoof',
        expanded: false, selected: false, visible: true, children: [] },
    ];
  }

  function rows(element: HTMLElement): HTMLElement[] {
    return [...element.querySelectorAll<HTMLElement>('[role="treeitem"]')];
  }

  function press(fixture: ReturnType<typeof renderTree>, key: string) {
    fixture.nativeElement.querySelector('[role="tree"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    fixture.detectChanges();
  }

  /** The ids of rows that are in the page's tab order. */
  function tabbable(element: HTMLElement): string[] {
    return rows(element)
      .filter((row) => row.getAttribute('tabindex') === '0')
      .map((row) => row.getAttribute('data-node-id') ?? '');
  }

  it('offers a row to Tab before anyone has arrived', () => {
    // The bug this exists for, found by counting tab stops in Chromium and
    // invisible to a test that presses keys straight at the container. With
    // the tab stop driven only by what is focused, a freshly rendered tree has
    // every row at tabindex -1: Tab skips the panel entirely, no row can take
    // focus, and nothing can set the focus that would make one tabbable. The
    // tree announces perfectly and cannot be entered at all.
    const fixture = renderTree(threeStoreys());

    expect(tabbable(fixture.nativeElement)).toEqual(['a']);
  });

  it('offers exactly one row to Tab, wherever the reader is', () => {
    const fixture = renderTree(threeStoreys());

    press(fixture, 'ArrowDown');
    press(fixture, 'ArrowDown');

    expect(tabbable(fixture.nativeElement)).toHaveLength(1);
  });

  it('puts the tab stop on the selected row, so Tab returns a reader to it', () => {
    const fixture = renderTree(threeStoreys());
    const rowsNow = rows(fixture.nativeElement);

    rowsNow[2]!.click();
    fixture.detectChanges();

    expect(tabbable(fixture.nativeElement)).toEqual(['c']);
  });

  it('enters at the first row', () => {
    const fixture = renderTree(threeStoreys());

    press(fixture, 'ArrowDown');

    expect(tabbable(fixture.nativeElement)).toEqual(['a']);
  });

  it('walks down and back up', () => {
    const fixture = renderTree(threeStoreys());

    press(fixture, 'ArrowDown');
    press(fixture, 'ArrowDown');
    expect(tabbable(fixture.nativeElement)).toEqual(['b']);

    press(fixture, 'ArrowUp');
    expect(tabbable(fixture.nativeElement)).toEqual(['a']);
  });

  it('stays put at the bottom rather than wrapping', () => {
    const fixture = renderTree(threeStoreys());
    press(fixture, 'End');

    press(fixture, 'ArrowDown');

    expect(tabbable(fixture.nativeElement)).toEqual(['c']);
  });

  it('jumps to the first and last rows', () => {
    const fixture = renderTree(threeStoreys());

    press(fixture, 'End');
    expect(tabbable(fixture.nativeElement)).toEqual(['c']);

    press(fixture, 'Home');
    expect(tabbable(fixture.nativeElement)).toEqual(['a']);
  });

  it('opens a closed branch with Right, then steps into it', () => {
    const fixture = renderTree(threeStoreys());
    press(fixture, 'ArrowDown');

    press(fixture, 'ArrowRight');
    expect(rows(fixture.nativeElement)).toHaveLength(4);

    press(fixture, 'ArrowRight');
    expect(tabbable(fixture.nativeElement)).toEqual(['a-walls']);
  });

  it('closes an open branch with Left, then steps out of it', () => {
    const fixture = renderTree(threeStoreys());
    press(fixture, 'ArrowDown');
    press(fixture, 'ArrowRight');   // open
    press(fixture, 'ArrowRight');   // into the child

    press(fixture, 'ArrowLeft');    // a leaf: out to the parent
    expect(tabbable(fixture.nativeElement)).toEqual(['a']);

    press(fixture, 'ArrowLeft');    // an open branch: closed
    expect(rows(fixture.nativeElement)).toHaveLength(3);
  });

  it('selects the focused row with Enter', () => {
    const nodes = threeStoreys();
    const fixture = renderTree(nodes);
    const chosen: string[] = [];
    fixture.componentInstance.elementSelected.subscribe((node: IfcNode) => chosen.push(node.id));

    press(fixture, 'ArrowDown');
    press(fixture, 'Enter');

    expect(chosen).toEqual(['a']);
  });

  it('leaves Tab alone, so the panel is not a keyboard trap', () => {
    // §1A.2. This panel sits beside a canvas some readers cannot use at all;
    // one they could not leave would be the worse failure by far.
    const fixture = renderTree(threeStoreys());
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });

    fixture.nativeElement.querySelector('[role="tree"]')!.dispatchEvent(tab);

    expect(tab.defaultPrevented).toBe(false);
  });

  it('leaves typing alone, so search still receives it', () => {
    const fixture = renderTree(threeStoreys());
    const typed = new KeyboardEvent('keydown', { key: 'w', bubbles: true, cancelable: true });

    fixture.nativeElement.querySelector('[role="tree"]')!.dispatchEvent(typed);

    expect(typed.defaultPrevented).toBe(false);
  });
});
