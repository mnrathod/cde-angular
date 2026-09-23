import { findUnmarkedStrings } from './template-strings';

/** The texts reported, in order, for terser assertions. */
function textsIn(template) {
  return findUnmarkedStrings(template, 'test.html').map(found => found.text);
}

describe('findUnmarkedStrings', () => {
  it('reports plain element text', () => {
    expect(textsIn('<button>Sign in</button>')).toEqual(['Sign in']);
  });

  it('accepts text the author marked', () => {
    expect(textsIn('<button i18n>Sign in</button>')).toEqual([]);
  });

  it('accepts text inside a marked ancestor', () => {
    // `<p i18n>Hello <b>there</b></p>` is one message to Angular, not two,
    // so demanding a second i18n on the <b> would be wrong.
    expect(textsIn('<p i18n>Hello <b>there</b></p>')).toEqual([]);
  });

  it('reports a sibling of a marked element', () => {
    // The mark covers descendants, not the rest of the template.
    expect(textsIn('<p i18n>Marked</p><p>Missed</p>')).toEqual(['Missed']);
  });

  it('ignores a bare interpolation', () => {
    // There is no source text here, only a value.
    expect(textsIn('<span>{{ count() }}</span>')).toEqual([]);
  });

  it('reports text that surrounds an interpolation', () => {
    // This asserted [] — the opposite of its own name, and with no reason
    // given where every neighbouring test has one. The behaviour it locked
    // in is wrong: "Page 3 of 10" is a message whose word order changes with
    // the language, and it has to be marked with placeholders rather than
    // left as two English words either side of a value.
    expect(textsIn('<span>Page {{ n() }} of {{ total() }}</span>')).toEqual([
      'Page {{ n() }} of {{ total() }}',
    ]);
  });

  it('ignores punctuation between translated fragments', () => {
    // A separator means the same in every language; a catalogue entry for it
    // is something no translator can act on.
    expect(textsIn('<span>·</span><span>/</span><span>—</span>')).toEqual([]);
  });

  it('ignores whitespace and newlines', () => {
    expect(textsIn('<div>\n  <span i18n>Marked</span>\n</div>')).toEqual([]);
  });

  it('reports a translatable attribute', () => {
    expect(textsIn('<button aria-label="Close">×</button>')).toEqual(['Close']);
  });

  it('accepts a marked attribute', () => {
    expect(
      textsIn('<button i18n-aria-label aria-label="Close">×</button>'),
    ).toEqual([]);
  });

  it('names the attribute it is complaining about', () => {
    const [found] = findUnmarkedStrings('<img alt="A plan" src="x">', 'test.html');

    expect(found?.attribute).toBe('alt');
  });

  it('does not ask for machine-facing attributes to be translated', () => {
    // Translating a class or a role would break the page.
    expect(
      textsIn('<div class="flex gap-2" role="tablist" id="main-nav"></div>'),
    ).toEqual([]);
  });

  it('does not treat a bound attribute as source text', () => {
    // [attr.aria-label] takes its value from an expression; there is no
    // literal to translate, and the expression is not source text. The
    // content is an icon glyph so that only the attribute is under test.
    expect(textsIn('<button [attr.aria-label]="label()">×</button>')).toEqual([]);
  });

  it('requires a mark on an attribute even inside a marked ancestor', () => {
    // An element-level i18n covers content, never attributes — a real trap,
    // because the page looks marked up and the label ships untranslated.
    expect(textsIn('<p i18n>Text <img alt="A plan" src="x"></p>')).toEqual([
      'A plan',
    ]);
  });

  it('looks inside an @if block', () => {
    expect(textsIn('@if (x()) { <em>Inside</em> }')).toEqual(['Inside']);
  });

  it('looks inside both halves of an @for block', () => {
    expect(
      textsIn('@for (a of b(); track a) { <li>Row</li> } @empty { <li>None</li> }'),
    ).toEqual(['Row', 'None']);
  });

  it('looks inside an @switch block', () => {
    expect(
      textsIn('@switch (s()) { @case (1) { <b>One</b> } @default { <b>Other</b> } }'),
    ).toEqual(['One', 'Other']);
  });

  it('ignores comments', () => {
    expect(textsIn('<!-- An explanatory note --><span i18n>Shown</span>')).toEqual(
      [],
    );
  });

  it('reports where it found the problem', () => {
    const [found] = findUnmarkedStrings('<div>\n\n  <b>Late</b>\n</div>', 't.html');

    expect(found?.line).toBe(3);
  });

  it('refuses to vouch for a template it cannot parse', () => {
    // Returning "nothing found" for an unreadable template would be the
    // worst possible answer: the guard would pass hardest where it
    // understood least.
    expect(() => findUnmarkedStrings('<div><span></div>', 'broken.html')).toThrow(
      /did not parse/,
    );
  });

  it('flags an unmarked label on a component that takes one', () => {
    // `label` is not a native attribute here — it is an input on a form-field
    // component, and the text lands in front of the user either way. The
    // compiler sees a component input and says nothing about it.
    const found = findUnmarkedStrings(
      '<app-labelled-field for="name" label="Project Name" />',
      'labelled.ts',
    );

    expect(found).toEqual([
      expect.objectContaining({ attribute: 'label', text: 'Project Name' }),
    ]);
  });

  it('accepts a label carrying its own i18n-label', () => {
    const found = findUnmarkedStrings(
      '<app-labelled-field for="name" i18n-label="@@f.name" label="Project Name" />',
      'labelled.ts',
    );

    expect(found).toEqual([]);
  });

  it('flags words sitting alongside an interpolation', () => {
    // The gap this closes. Angular hands the whole node back as an
    // expression the moment an interpolation appears, so a check for a
    // string value skipped the words entirely and the sweep reported the
    // file clean.
    const found = findUnmarkedStrings(
      '<span>Select document for File {{ slot() }}</span>',
      'picker.ts',
    );

    expect(found).toHaveLength(1);
    expect(found[0].text).toContain('Select document for File');
  });

  it('still says nothing about an interpolation on its own', () => {
    // There is no source text in `{{ count }}` — only a value — so marking
    // it would produce a catalogue entry no translator can act on.
    expect(findUnmarkedStrings('<span>{{ count() }}</span>', 'n.ts')).toEqual([]);
  });

  it('accepts words beside an interpolation when the element is marked', () => {
    const found = findUnmarkedStrings(
      '<span i18n="@@p.slot">Select document for File {{ slot() }}</span>',
      'picker.ts',
    );

    expect(found).toEqual([]);
  });

  it('says nothing about a separator between two interpolations', () => {
    // "{{ a }} · {{ b }}" means the same in every language.
    expect(
      findUnmarkedStrings('<span>{{ a() }} · {{ b() }}</span>', 'n.ts'),
    ).toEqual([]);
  });

  describe('English hiding inside a bound expression', () => {
    // Three of these shipped before the sweep looked for them: a page
    // label built with `'Page ' + n`, a link tooltip built with
    // `'Go to page ' + page`, and a zoom reading with a bare percent sign.
    // A text node is not the only place a sentence hides.

    it('flags a literal sentence in a bound title', () => {
      const found = findUnmarkedStrings(
        `<a [title]="link.url ?? 'Go to page ' + link.page"></a>`,
        'links.ts',
      );

      expect(found).toHaveLength(1);
      expect(found[0].attribute).toBe('title');
    });

    it('flags one in a bound attr.aria-label', () => {
      const found = findUnmarkedStrings(
        `<canvas [attr.aria-label]="'Page ' + pageNumber"></canvas>`,
        'page.ts',
      );

      expect(found).toHaveLength(1);
      expect(found[0].attribute).toBe('aria-label');
    });

    it('says nothing when the bound value is a translated field', () => {
      expect(
        findUnmarkedStrings('<button [title]="saveHint"></button>', 'bar.ts'),
      ).toEqual([]);
    });

    it('says nothing about class names, which are full of letters', () => {
      // The reason only perceived targets are scanned. Every conditional
      // class binding in the application would otherwise be a finding.
      expect(
        findUnmarkedStrings(
          `<div [class]="on ? 'bg-accent text-white' : 'bg-white'"></div>`,
          'card.ts',
        ),
      ).toEqual([]);
    });

    it('says nothing about an empty string used as a missing tooltip', () => {
      expect(
        findUnmarkedStrings(`<button [title]="ready ? '' : hint"></button>`, 'b.ts'),
      ).toEqual([]);
    });
  });
});
