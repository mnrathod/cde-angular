#!/usr/bin/env node
/**
 * Fails on an interactive control with no accessible name.
 *
 * <p>WCAG 2.2 SC 2.4.6 asks that headings *and labels* describe topic or
 * purpose. The headings half had been worked through; the labels half had
 * never been looked at, and the conformance report said so. This is that
 * audit, kept as a gate so the answer stays true.
 *
 * <p>A control with no name is not a cosmetic problem. It announces as
 * "edit text" or "button", and where the control repeats — a status chooser
 * per document, a link per cross-reference — it announces as several
 * identical controls with nothing to tell them apart. A placeholder does not
 * fix it: the placeholder disappears the moment the reader types, so anyone
 * returning to the field hears nothing, and voice control has no name to
 * address it by.
 *
 * <p>**Every exclusion below was learned from a false positive this script
 * produced and a human then checked.** That is why they are written down
 * rather than left as conditions: an audit that cries wolf gets switched off,
 * and the first version of this one reported fourteen controls of which six
 * were correctly labelled by means it could not see.
 *
 * <p>A script rather than a spec, for the reason `check-i18n-markup.mjs`
 * gives: a source file pulled into the test bundle as raw text collapses to a
 * one-line module and empties the coverage denominator. The pure functions
 * here are unit-tested in `check-labels.spec.mjs`.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { parseTemplate } from '@angular/compiler';

import { extractInlineTemplate } from './i18n/component-templates.mjs';

/** Where component sources live. */
export const ROOTS = ['src/app', 'src/viewer-core'];

/** Elements that take focus and therefore need a name. */
export const CONTROLS = ['input', 'select', 'textarea', 'button', 'a'];

/** Controls whose name comes from a label rather than their own content. */
const LABELLED_CONTROLS = ['input', 'select', 'textarea'];

/**
 * Components that label the control they wrap.
 *
 * <p>`app-labelled-field` renders `<label [attr.for]>` around its content, so
 * a control inside one is labelled even though no `<label>` appears in the
 * template being read. Four correctly-labelled controls in one dialog were
 * reported as defects before this was understood.
 */
const LABELLING_WRAPPERS = ['app-labelled-field'];

const attributeOf = (node, name) =>
  (node.attributes ?? []).find((a) => a.name === name)?.value;

const hasAttribute = (node, name) =>
  (node.attributes ?? []).some((a) => a.name === name);

const bindingSource = (node, name) => {
  const binding = (node.inputs ?? []).find(
    (input) => String(input.name).replace(/^attr\./, '') === name,
  );
  return binding?.value?.source?.trim();
};

const hasBinding = (node, name) => bindingSource(node, name) !== undefined;

/** Either spelling of an attribute — written out, or bound. */
export function valueOf(node, name) {
  return attributeOf(node, name) ?? bindingSource(node, name);
}

/** Whether something carries a name of its own. */
export function isNamed(node) {
  return (
    valueOf(node, 'aria-label') !== undefined ||
    valueOf(node, 'aria-labelledby') !== undefined
  );
}

/**
 * Whether the element is out of the accessibility tree entirely.
 *
 * <p>`class="hidden"` is `display: none`, which is not focusable and carries
 * no name requirement — unlike `sr-only`, which hides an element visually and
 * leaves it in the tree, where it does need one. A file input hidden behind a
 * visible button was reported as a defect until this told them apart.
 */
export function isRemovedFromTree(node) {
  if (hasAttribute(node, 'hidden') || hasBinding(node, 'hidden')) return true;
  if (attributeOf(node, 'type') === 'hidden') return true;
  const classes = (attributeOf(node, 'class') ?? '').split(/\s+/);
  return classes.includes('hidden');
}

/**
 * The name a screen reader would read out of a subtree.
 *
 * <p>Returns a non-empty string when there is one, without caring what it
 * says — whether a name is *apt* is a judgement this cannot make, and
 * pretending otherwise would be the kind of automated-conformance claim
 * §1A.5 warns against. It checks only that one exists.
 *
 * <p>An `<img>` contributes its `alt`, which is why a thumbnail button with a
 * described image is correctly named and was reported as a defect before.
 */
export function readableText(node, childrenOf) {
  if (valueOf(node, 'aria-hidden') !== undefined) return '';
  if (node.name === 'img') return (valueOf(node, 'alt') ?? '').trim();
  if (node.attributes === undefined && node.value !== undefined) {
    const value = node.value;
    if (typeof value === 'string') return value.trim();
    // An interpolation supplies a name at runtime; its text is not knowable
    // here, and its presence is the thing being checked.
    return value?.source ? 'interpolated' : '';
  }
  return childrenOf(node)
    .map((child) => readableText(child, childrenOf))
    .join(' ')
    .trim();
}

/**
 * The children of anything that has them, whatever block shape it takes.
 *
 * <p>Accumulates rather than returning on the first match, because a block can
 * hold more than one collection: `@for` has `children` and an `@empty`, and an
 * earlier version of this returned the first and missed the second. Shaped to
 * match the equivalent in `i18n/template-strings.mjs` so the two sweeps cannot
 * come to disagree about what a template contains — `@switch` keeps its cases
 * in `groups`, not `cases`, which cost this one a test before it was read.
 *
 * <p>`@defer` is absent from the list because nothing in this application uses
 * one. Add its `placeholder`, `loading` and `error` blocks here and in the
 * i18n sweep together, on the day something does.
 */
export function childrenOf(node) {
  const nested = [...(node.children ?? [])];
  for (const collection of [node.branches, node.groups]) {
    for (const branch of collection ?? []) nested.push(...(branch.children ?? []));
  }
  if (node.empty?.children) nested.push(...node.empty.children);
  return nested;
}

/**
 * Every `for` a template's labels point at, and whether any of them is bound.
 *
 * <p>The bound flag is what stops this gate lying about what it can know.
 * A label can point at `labelTarget()` while the control it names carries
 * `[id]="controlId"` — two different expressions resolving to the same value,
 * which is correct code and which no static reader can pair up. Five properly
 * labelled controls in the form a reader actually fills in were reported as
 * defects on exactly that shape.
 *
 * <p>So a template holding a bound `for` and a control holding a bound `id` is
 * taken as associated. **That is a deliberate floor, and it has a cost worth
 * naming: a genuine mismatch between a bound `for` and a bound `id` will pass
 * this gate.** Catching it needs the rendered page, which is what §1A.5 means
 * by automated checks being necessary and not sufficient — the manual keyboard
 * pass and the screen-reader matrix are where that class of defect surfaces.
 * Reporting five correct controls to catch a hypothetical sixth would get the
 * gate switched off, and then it would catch nothing at all.
 */
export function labelTargets(nodes) {
  const written = new Set();
  let anyBound = false;
  const walk = (list) => {
    for (const node of list) {
      if (node.name === 'label') {
        const spelledOut = attributeOf(node, 'for');
        if (spelledOut) written.add(spelledOut);
        const bound = bindingSource(node, 'for');
        if (bound) {
          written.add(bound);
          anyBound = true;
        }
      }
      walk(childrenOf(node));
    }
  };
  walk(nodes);
  return { written, anyBound };
}

/**
 * Controls in one template that no reader could name.
 *
 * <p>`labelTargets` is gathered over the whole template first, so a label
 * written after the control it names is not reported — markup order is not
 * part of the association and a gate that thought otherwise would push people
 * into rearranging templates to satisfy it.
 */
export function findUnnamedControls(nodes) {
  const { written, anyBound } = labelTargets(nodes);
  const found = [];

  const walk = (list, insideLabel) => {
    for (const node of list) {
      const name = node.name;
      if (CONTROLS.includes(name) && !isRemovedFromTree(node)) {
        const spelledOutId = attributeOf(node, 'id');
        const boundId = bindingSource(node, 'id');
        if (LABELLED_CONTROLS.includes(name)) {
          const labelled =
            isNamed(node) ||
            insideLabel ||
            (spelledOutId && written.has(spelledOutId)) ||
            (boundId !== undefined && (written.has(boundId) || anyBound));
          if (!labelled) {
            found.push({
              element: name,
              reason: valueOf(node, 'placeholder')
                ? 'has a placeholder but no label — a placeholder disappears as soon as the reader types'
                : 'has no label and no aria-label',
            });
          }
        } else if (!isNamed(node) && readableText(node, childrenOf) === '') {
          found.push({
            element: name,
            reason:
              'has no text of its own and no aria-label — an aria-hidden icon ' +
              'contributes nothing, and a title is the weakest source in the ' +
              'accessible-name algorithm',
          });
        }
      }
      walk(
        childrenOf(node),
        insideLabel || name === 'label' || LABELLING_WRAPPERS.includes(name),
      );
    }
  };

  walk(nodes, false);
  return found;
}

/** Every non-spec TypeScript file under a directory, recursively. */
function sourcesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourcesUnder(path);
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.spec.ts')) return [];
    return [relative('.', path).split(sep).join('/')];
  });
}

function main() {
  const templates = ROOTS.flatMap(sourcesUnder)
    .map((path) => [path, extractInlineTemplate(readFileSync(path, 'utf8'))])
    .filter(([, found]) => found !== undefined);

  // A sweep that parsed nothing would pass every build. The count is low
  // enough to be wrong only if something structural broke.
  if (templates.length < 40) {
    console.error(
      `Only ${templates.length} component templates were found under ` +
        `${ROOTS.join(', ')}. Refusing to pass: a sweep that reads almost ` +
        'nothing reports almost nothing.',
    );
    process.exit(1);
  }

  const problems = [];
  for (const [path, { template }] of templates) {
    const parsed = parseTemplate(template, path);
    if (parsed.errors?.length) {
      console.error(
        `${path} did not parse: ${parsed.errors.map((e) => e.msg).join('; ')}`,
      );
      process.exit(1);
    }
    for (const control of findUnnamedControls(parsed.nodes)) {
      problems.push({ path, ...control });
    }
  }

  if (problems.length > 0) {
    console.error('\nControls with no accessible name (WCAG 2.2 SC 2.4.6):\n');
    for (const problem of problems) {
      console.error(`  ${problem.path}`);
      console.error(`    <${problem.element}> ${problem.reason}`);
    }
    console.error(
      '\nGive it an aria-label, or a <label> whose for matches its id. If the ' +
        'control repeats, name each one so they can be told apart.\n',
    );
    process.exit(1);
  }

  console.log(
    `Every control is named: ${templates.length} component templates checked.`,
  );
}

if (process.argv[1] && process.argv[1].endsWith('check-labels.mjs')) main();
