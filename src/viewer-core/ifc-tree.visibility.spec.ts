/**
 * The visibility control on a tree row, as a user meets it.
 *
 * <p>Rendered rather than constructed, because the markup is what is under
 * test: the control does something now, and one that works only for a mouse
 * is half a feature. §1A treats that as a functional defect at the same
 * severity as any other, so it is asserted here alongside the behaviour.
 */
import { describe, expect, it } from 'vitest';

import { IfcNode } from './ifc-node';
import { renderTree, storey, visibilityToggles } from './ifc-tree.rendering';

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
