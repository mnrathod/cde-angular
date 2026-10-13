/**
 * Tests for the accessible-name gate.
 *
 * <p>Half of these exist because the first version of the gate reported them
 * as defects and a human checked and found them correctly labelled. Each such
 * case is written out as a test rather than fixed quietly, because a gate that
 * cries wolf gets switched off, and the exclusions that stop it are the part
 * most likely to be removed by someone tidying up.
 */
import { describe, it, expect } from 'vitest';
import { parseTemplate } from '@angular/compiler';

import { findUnnamedControls } from './check-labels.mjs';

/** The findings for a fragment of template. */
function check(template) {
  const parsed = parseTemplate(template, 'test.ts');
  expect(parsed.errors ?? []).toEqual([]);
  return findUnnamedControls(parsed.nodes);
}

describe('controls that have no name', () => {
  it('reports an input with nothing but a placeholder', () => {
    const found = check('<input placeholder="Search document..." />');

    expect(found).toHaveLength(1);
    expect(found[0].reason).toContain('placeholder');
  });

  it('reports an input with no label and no placeholder', () => {
    expect(check('<input type="text" />')).toHaveLength(1);
  });

  it('reports a select with no label', () => {
    expect(check('<select><option>One</option></select>')).toHaveLength(1);
  });

  it('reports a textarea with no label', () => {
    expect(check('<textarea></textarea>')).toHaveLength(1);
  });

  it('reports a button whose only content is an aria-hidden glyph', () => {
    // The failure the architecture document describes: it looks labelled on
    // screen and announces as "button".
    const found = check('<button title="Undo"><span aria-hidden="true">↺</span></button>');

    expect(found).toHaveLength(1);
    expect(found[0].element).toBe('button');
  });

  it('does not accept a title as a name', () => {
    // title is the weakest source in the accessible-name algorithm and the
    // codebase settled on aria-label for icon-only controls.
    expect(check('<button title="Toggle the panel"></button>')).toHaveLength(1);
  });

  it('reports an empty link, which is what a box over page text is', () => {
    expect(check('<a href="https://example.test"></a>')).toHaveLength(1);
  });

  it('reports every unnamed control rather than stopping at the first', () => {
    const found = check('<input /><select></select><textarea></textarea>');

    expect(found).toHaveLength(3);
  });
});

describe('controls that are named, and were once reported as though they were not', () => {
  it('accepts a label whose for matches the control id', () => {
    expect(
      check('<label for="term">Word to find</label><input id="term" />'),
    ).toEqual([]);
  });

  it('accepts a label written after the control it names', () => {
    // Markup order is not part of the association, and a gate that thought
    // otherwise would push people into rearranging templates to satisfy it.
    expect(
      check('<input id="term" /><label for="term">Word to find</label>'),
    ).toEqual([]);
  });

  it('accepts a bound for paired with a bound id', () => {
    // Two components label their field this way, and both were reported.
    expect(
      check('<label [attr.for]="fieldId">Name</label><input [id]="fieldId" />'),
    ).toEqual([]);
  });

  it('accepts a bound for and a bound id that do not match textually', () => {
    // labelTarget() returns controlId, so this is correct code that no static
    // reader can pair up. Five controls in the form a reader fills in were
    // reported on exactly this shape.
    expect(
      check('<label [attr.for]="labelTarget()">Name</label><input [id]="controlId" />'),
    ).toEqual([]);
  });

  it('is honest that the relaxation lets a real mismatch through', () => {
    // The cost of the rule above, written down so nobody mistakes a pass here
    // for proof of association. Catching this needs the rendered page, which
    // is what the manual pass and the screen-reader matrix are for.
    const found = check('<label [attr.for]="headerId">Name</label><input [id]="unrelatedId" />');

    expect(found).toEqual([]);
  });

  it('accepts a control wrapped in its label', () => {
    expect(check('<label>Required <input type="checkbox" /></label>')).toEqual([]);
  });

  it('accepts a control inside a component that labels its content', () => {
    // app-labelled-field renders the label around what it wraps, so no label
    // appears in the template being read. Four controls in one dialog were
    // reported before this was understood.
    expect(
      check('<app-labelled-field for="a" label="Name"><input id="a" /></app-labelled-field>'),
    ).toEqual([]);
  });

  it('accepts aria-label, bound or written out', () => {
    expect(check('<input aria-label="Search" />')).toEqual([]);
    expect(check('<input [attr.aria-label]="searchLabel" />')).toEqual([]);
  });

  it('accepts aria-labelledby', () => {
    expect(check('<select aria-labelledby="heading"></select>')).toEqual([]);
  });

  it('accepts a button named by the alt text of the image inside it', () => {
    // A thumbnail button. The image carries the name, which is why it was
    // wrong to report it.
    expect(
      check('<button><img [alt]="thumbnailLabel()" /></button>'),
    ).toEqual([]);
  });

  it('accepts a button whose text arrives through an interpolation', () => {
    expect(check('<button>{{ actionLabel() }}</button>')).toEqual([]);
  });

  it('ignores a control that is not in the accessibility tree at all', () => {
    // class="hidden" is display:none — not focusable, so no name is required.
    // A file input behind a visible button was reported until this told the
    // two kinds of hiding apart.
    expect(check('<input type="file" class="hidden" />')).toEqual([]);
    expect(check('<input type="hidden" />')).toEqual([]);
    expect(check('<input hidden />')).toEqual([]);
  });

  it('still requires a name from a control that is only hidden visually', () => {
    // sr-only leaves the control in the tree and focusable, so it does need
    // one — the distinction the exclusion above turns on.
    expect(check('<input type="file" class="sr-only" />')).toHaveLength(1);
  });
});

describe('where controls are nested', () => {
  it('looks inside conditional blocks', () => {
    expect(check('@if (open()) { <input /> }')).toHaveLength(1);
  });

  it('looks inside loops, where one unnamed control becomes many', () => {
    expect(
      check('@for (row of rows(); track row.id) { <select></select> }'),
    ).toHaveLength(1);
  });

  it('looks inside a switch', () => {
    expect(
      check('@switch (kind()) { @case ("a") { <textarea></textarea> } }'),
    ).toHaveLength(1);
  });
});
