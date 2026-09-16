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

describe('the expand toggle', () => {

  /** The row's other button: the one that is not the visibility toggle. */
  function expandToggle(element: HTMLElement): HTMLButtonElement {
    const button = [...element.querySelectorAll('button')]
      .find((candidate) => !(candidate.getAttribute('aria-label') ?? '').startsWith('Hide '));
    expect(button, 'no expand toggle rendered').toBeDefined();
    return button!;
  }

  function branch(): IfcNode {
    return {
      id: 'storey', name: 'Level 00', type: 'IfcBuildingStorey',
      expanded: false, selected: false, visible: true,
      children: [{ id: 'walls', name: 'Walls', type: 'IfcWall',
                   expanded: false, selected: false, visible: true, children: [] }],
    };
  }

  it('is at least 24 CSS px square', () => {
    // Same defect and same cause as its neighbour: it was sized to the ▸
    // glyph rather than to SC 2.5.8's 24×24 floor, so it looked correct
    // while being too small to hit.
    const toggle = expandToggle(renderTree([branch()]).nativeElement);

    expect(toggle.classList.contains('w-6')).toBe(true);
    expect(toggle.classList.contains('h-6')).toBe(true);
  });

  it('is typed as a button, so it does not submit anything', () => {
    const toggle = expandToggle(renderTree([branch()]).nativeElement);

    expect(toggle.getAttribute('type')).toBe('button');
  });

  it('is named for what it discloses, not by its glyph', () => {
    // ▸ announces as nothing useful. The name says "Contents of …" rather
    // than the node's own name, which would be indistinguishable from the
    // row text sitting beside it.
    const toggle = expandToggle(renderTree([branch()]).nativeElement);

    expect(toggle.getAttribute('aria-label')).toBe('Contents of Level 00');
  });

  it('hides its glyph from assistive technology', () => {
    const toggle = expandToggle(renderTree([branch()]).nativeElement);

    expect(toggle.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('reports whether the children are showing', () => {
    const fixture = renderTree([branch()]);
    const toggle = expandToggle(fixture.nativeElement);

    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    toggle.click();
    fixture.detectChanges();

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('keeps its name fixed as it expands and collapses', () => {
    // aria-expanded carries the state. A name that flipped to "Collapse"
    // would rename the control underneath anyone who had learned it, and
    // would repeat what aria-expanded already says.
    const fixture = renderTree([branch()]);
    const toggle = expandToggle(fixture.nativeElement);
    const before = toggle.getAttribute('aria-label');

    toggle.click();
    fixture.detectChanges();

    expect(toggle.getAttribute('aria-label')).toBe(before);
  });

  it('claims no disclosure state on a node with nothing to disclose', () => {
    // §1A.2: bad ARIA is worse than none. A leaf's button is `invisible`,
    // so it is out of the accessibility tree anyway — announcing it as a
    // collapsed disclosure would be a promise of children that do not exist.
    const leaf: IfcNode = {
      id: 'walls', name: 'Walls', type: 'IfcWall',
      expanded: false, selected: false, visible: true, children: [],
    };

    const toggle = expandToggle(renderTree([leaf]).nativeElement);

    expect(toggle.getAttribute('aria-expanded')).toBeNull();
    expect(toggle.getAttribute('aria-label')).toBeNull();
  });

  it('still expands the node it belongs to', () => {
    // Growing the target must not break what it was already doing.
    const nodes = [branch()];
    const fixture = renderTree(nodes);

    expandToggle(fixture.nativeElement).click();

    expect(nodes[0]!.expanded).toBe(true);
  });
});
