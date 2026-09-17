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
    expect(textsIn('<span>Page {{ n() }} of {{ total() }}</span>')).toEqual([]);
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
});
