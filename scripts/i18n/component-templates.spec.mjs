import { extractInlineTemplate } from './component-templates';

/** The template text alone, for the assertions that do not care where it is. */
function templateOf(source) {
  return extractInlineTemplate(source)?.template;
}

describe('extractInlineTemplate', () => {
  it('returns the template a component declares', () => {
    const source = `@Component({
  selector: 'app-x',
  template: \`<p>Hello</p>\`,
})`;

    expect(templateOf(source)).toBe('<p>Hello</p>');
  });

  it('keeps a multi-line template whole', () => {
    const source = 'template: `\n  <p>One</p>\n  <p>Two</p>\n`,';

    expect(templateOf(source)).toContain('<p>Two</p>');
  });

  it('stops at the closing backtick, not at the end of the file', () => {
    const source = 'template: `<p>In</p>`,\n})\nconst other = `not template`;';

    expect(templateOf(source)).toBe('<p>In</p>');
  });

  it('does not truncate at an escaped backtick', () => {
    // The failure this scan exists to avoid: returning part of a template
    // looks like a clean answer and silently hides everything after it.
    const source = 'template: `<p>a \\` b</p>`,';

    expect(templateOf(source)).toBe('<p>a \\` b</p>');
  });

  it('returns nothing for a file with no template', () => {
    expect(templateOf('export class PlainService {}')).toBeUndefined();
  });

  it('is not fooled by a property whose name merely ends in template', () => {
    // `templateUrl:` and `stampTemplate:` are not what is being looked for.
    const source = 'const stampTemplate = `<svg></svg>`;';

    expect(templateOf(source)).toBeUndefined();
  });

  it('refuses a template that is never closed', () => {
    expect(() => templateOf('template: `<p>never ends')).toThrow(
      /never closed/,
    );
  });

  it('says which line of the file the template starts on', () => {
    // Without it every reported position counts from the backtick, which
    // points at nothing a reader can open.
    const source = ['@Component({', '  selector: "a",', '  template: `', '    <p>Hi</p>', '  `,', '})'].join('\n');

    expect(extractInlineTemplate(source)?.startLine).toBe(3);
  });
});
