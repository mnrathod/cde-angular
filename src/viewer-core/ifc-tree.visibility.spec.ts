/**
 * The tree row's controls, as a user meets them.
 *
 * Rendered rather than constructed, because what is under test here is the
 * markup: the visibility control does something now, and a control that works
 * only for a mouse is half a feature. §1A treats that as a functional defect
 * at the same severity, so it is asserted here alongside the behaviour.
 *
 * Queried by role and accessible name, never by CSS class (§14) — the point
 * is that assistive technology can find and operate it, which a class
 * selector would not demonstrate.
 *
 * `ifc-tree.component.spec.ts` builds the component with `new` deliberately,
 * to prove it needs no injector. That guarantee is untouched: this file
 * renders it, which a standalone component with no providers allows.
 */
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { IfcNode, IfcTreeComponent } from './ifc-tree.component';

function storey(): IfcNode {
  return {
    id: 'walls', name: 'Walls', type: 'IfcWall',
    expanded: false, selected: false, visible: true, children: [],
  };
}

function renderTree(nodes: IfcNode[]) {
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
function visibilityToggles(element: HTMLElement): HTMLButtonElement[] {
  return [...element.querySelectorAll('button')]
    .filter((button) => (button.getAttribute('aria-label') ?? '').startsWith('Hide '));
}

describe('the visibility toggle', () => {

  it('is a button a screen reader can name', () => {
    // It used to be labelled by an emoji alone. "eye" does not tell anyone
    // what pressing it does, or what it would act on.
    const fixture = renderTree([storey()]);

    const [toggle] = visibilityToggles(fixture.nativeElement);

    expect(toggle).toBeDefined();
    expect(toggle!.getAttribute('aria-label')).toBe('Hide Walls');
  });

  it('reports whether the element is currently hidden', () => {
    const fixture = renderTree([storey()]);
    const [toggle] = visibilityToggles(fixture.nativeElement);

    expect(toggle!.getAttribute('aria-pressed')).toBe('false');

    toggle!.click();
    fixture.detectChanges();

    expect(toggle!.getAttribute('aria-pressed')).toBe('true');
  });

  it('hides its emoji from assistive technology, so the name is not doubled', () => {
    const fixture = renderTree([storey()]);
    const [toggle] = visibilityToggles(fixture.nativeElement);

    expect(toggle!.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('stays on screen once the element is hidden', () => {
    // The control is transparent until its row is hovered. That is tolerable
    // for an action you are reaching for, and not for state you need to find
    // again — a hidden branch with no visible marker is unfindable by mouse
    // and by keyboard alike.
    //
    // Asserted on classList, which matches whole tokens. A substring check
    // passes on `group-hover:opacity-100`, which is always present and means
    // the opposite — it is the rule that hides the control until hover.
    const fixture = renderTree([storey()]);
    const [toggle] = visibilityToggles(fixture.nativeElement);

    expect(toggle!.classList.contains('opacity-100')).toBe(false);

    toggle!.click();
    fixture.detectChanges();

    expect(toggle!.classList.contains('opacity-100')).toBe(true);
  });

  it('announces the node it acts on, not just "hide"', () => {
    // Several rows carry this control, so the name has to distinguish them.
    const fixture = renderTree([
      storey(),
      { ...storey(), id: 'slabs', name: 'Slabs', type: 'IfcSlab' },
    ]);

    const names = visibilityToggles(fixture.nativeElement)
      .map((button) => button.getAttribute('aria-label'));

    expect(names).toEqual(['Hide Walls', 'Hide Slabs']);
  });

  it('is at least 24 CSS px square', () => {
    // SC 2.5.8's floor. It was 16×16 — sized to the emoji inside it, which
    // made the control look right while the target was too small to hit.
    // jsdom does no layout, so this asserts the sizing classes; the measured
    // box was checked in a browser, which is what found the defect.
    const fixture = renderTree([storey()]);
    const [toggle] = visibilityToggles(fixture.nativeElement);

    expect(toggle!.classList.contains('w-6')).toBe(true);
    expect(toggle!.classList.contains('h-6')).toBe(true);
  });

  it('is typed as a button, so it does not submit anything', () => {
    const fixture = renderTree([storey()]);
    const [toggle] = visibilityToggles(fixture.nativeElement);

    expect(toggle!.getAttribute('type')).toBe('button');
  });

  it('tells the viewer which node changed and what it became', () => {
    const fixture = renderTree([storey()]);
    const seen: { type: string; visible: boolean }[] = [];
    fixture.componentInstance.elementVisibilityChanged.subscribe(
      (event: { node: IfcNode; visible: boolean }) =>
        seen.push({ type: event.node.type, visible: event.visible }));

    visibilityToggles(fixture.nativeElement)[0]!.click();

    expect(seen).toEqual([{ type: 'IfcWall', visible: false }]);
  });
});


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

/**
 * The tree's single tab stop, and the arrows that move within it.
 *
 * <p>A tree is one stop in the page's tab order, not one per row. A model with
 * four hundred elements would otherwise put four hundred stops between a
 * reader and whatever follows the panel, which is the failure the roving
 * tabindex exists to prevent.
 */
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
