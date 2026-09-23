/**
 * The row as a tree item.
 *
 * <p>An earlier pass put `aria-expanded` and an accessible name on the little
 * ▸ button, which announced correctly but was not the tree pattern — it made
 * every row two tab stops and gave a reader no way to move between rows except
 * Tab. This is the WAI-ARIA tree view instead, which is what a screen-reader
 * user already knows from every file explorer (§1.3: do not invent
 * interactions for solved problems), and the reason it matters here is §1A.4:
 * this panel is the equivalent accessible route to a WebGL canvas, and since
 * the fabricated fallback was deleted it is the only one.
 *
 * <p>So the state moved onto the row, and the ▸ became decorative.
 */
import { describe, expect, it } from 'vitest';

import { IfcNode } from './ifc-node';
import { renderTree, storey, visibilityToggles } from './ifc-tree.rendering';

describe('a row, as a tree item', () => {

  function branch(): IfcNode {
    return {
      id: 'storey', name: 'Level 00', type: 'IfcBuildingStorey',
      expanded: false, selected: false, visible: true,
      children: [{ id: 'walls', name: 'Walls', type: 'IfcWall',
                   expanded: false, selected: false, visible: true, children: [] }],
    };
  }

  function rows(element: HTMLElement): HTMLElement[] {
    return [...element.querySelectorAll<HTMLElement>('[role="treeitem"]')];
  }

  it('sits inside something that declares itself a tree', () => {
    const fixture = renderTree([branch()]);

    const tree = fixture.nativeElement.querySelector('[role="tree"]');

    expect(tree).not.toBeNull();
    expect(tree.getAttribute('aria-labelledby')).toBe('model-tree-heading');
  });

  it('is a tree item', () => {
    const fixture = renderTree([branch()]);

    expect(rows(fixture.nativeElement)).toHaveLength(1);
  });

  it('reports whether its children are showing', () => {
    const fixture = renderTree([branch()]);
    const [row] = rows(fixture.nativeElement);

    expect(row!.getAttribute('aria-expanded')).toBe('false');

    // ArrowDown enters the tree; ArrowRight then opens the focused branch.
    row!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    row!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();

    expect(rows(fixture.nativeElement)[0]!.getAttribute('aria-expanded')).toBe('true');
  });

  it('claims no disclosure state when it has nothing to disclose', () => {
    // §1A.2 — a collapsed disclosure that discloses nothing promises children
    // that do not exist.
    const fixture = renderTree([storey()]);

    expect(rows(fixture.nativeElement)[0]!.getAttribute('aria-expanded')).toBeNull();
  });

  it('announces itself as the element, not as "hide" then the element', () => {
    // Found in Chromium, not here: with the name left to be computed from the
    // row's contents, the visibility button's label folded into it and every
    // row read "Hide Level 00 Level 00". Nothing in the markup shows that —
    // only asking the browser what it computed does.
    const fixture = renderTree([branch()]);

    expect(rows(fixture.nativeElement)[0]!.getAttribute('aria-label')).toBe('Level 00');
  });

  it('spells the quantity out rather than leaving it as a symbol', () => {
    // "×42" is announced as a multiplication sign, which is not what it means.
    const counted: IfcNode = { ...storey(), count: 42 };

    const fixture = renderTree([counted]);

    expect(rows(fixture.nativeElement)[0]!.getAttribute('aria-label'))
      .toBe('Walls, 42 elements');
  });

  it('says how deep it is and where it sits among its siblings', () => {
    const fixture = renderTree([{ ...branch(), expanded: true }]);
    const [parent, child] = rows(fixture.nativeElement);

    expect(parent!.getAttribute('aria-level')).toBe('1');
    expect(parent!.getAttribute('aria-posinset')).toBe('1');
    expect(parent!.getAttribute('aria-setsize')).toBe('1');
    expect(child!.getAttribute('aria-level')).toBe('2');
  });

  it('numbers siblings from one, not from zero', () => {
    const fixture = renderTree([storey(), { ...storey(), id: 'slabs', name: 'Slabs' }]);
    const positions = rows(fixture.nativeElement)
      .map((row) => row.getAttribute('aria-posinset'));

    expect(positions).toEqual(['1', '2']);
  });

  it('reports whether it is the selected element', () => {
    const fixture = renderTree([storey()]);
    const [row] = rows(fixture.nativeElement);

    expect(row!.getAttribute('aria-selected')).toBe('false');

    row!.click();
    fixture.detectChanges();

    expect(rows(fixture.nativeElement)[0]!.getAttribute('aria-selected')).toBe('true');
  });

  it('hides collapsed children from the tree entirely', () => {
    // Not merely visually: a row a reader cannot see must not be a row they
    // can arrow onto.
    const fixture = renderTree([branch()]);

    expect(rows(fixture.nativeElement)).toHaveLength(1);
  });

  it('shows its glyph to the eye only, not as a control', () => {
    // The ▸ used to be a button carrying aria-expanded. The row carries it
    // now, so a second announcement of the same state would be noise.
    const fixture = renderTree([branch()]);
    const glyph = rows(fixture.nativeElement)[0]!
      .querySelector('[aria-hidden="true"]');

    expect(glyph).not.toBeNull();
    expect(glyph!.tagName).not.toBe('BUTTON');
  });

  it('still expands when the glyph is clicked', () => {
    // The mouse path the old button served has to survive it becoming a span.
    const nodes = [branch()];
    const fixture = renderTree(nodes);
    const glyph = rows(fixture.nativeElement)[0]!
      .querySelector<HTMLElement>('[aria-hidden="true"]');

    glyph!.click();

    expect(nodes[0]!.expanded).toBe(true);
  });
});
