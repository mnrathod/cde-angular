import { extractInlineTemplate } from './component-templates';

describe('extractInlineTemplate', () => {
  it('returns the template a component declares', () => {
    const source = `@Component({
  selector: 'app-x',
  template: \`<p>Hello</p>\`,
})`;

    expect(extractInlineTemplate(source)).toBe('<p>Hello</p>');
  });

  it('keeps a multi-line template whole', () => {
    const source = 'template: `\n  <p>One</p>\n  <p>Two</p>\n`,';

    expect(extractInlineTemplate(source)).toContain('<p>Two</p>');
  });

  it('stops at the closing backtick, not at the end of the file', () => {
    const source = 'template: `<p>In</p>`,\n})\nconst other = `not template`;';

    expect(extractInlineTemplate(source)).toBe('<p>In</p>');
  });

  it('does not truncate at an escaped backtick', () => {
    // The failure this scan exists to avoid: returning part of a template
    // looks like a clean answer and silently hides everything after it.
    const source = 'template: `<p>a \\` b</p>`,';

    expect(extractInlineTemplate(source)).toBe('<p>a \\` b</p>');
  });

  it('returns nothing for a file with no template', () => {
    expect(extractInlineTemplate('export class PlainService {}')).toBeUndefined();
  });

  it('is not fooled by a property whose name merely ends in template', () => {
    // `templateUrl:` and `stampTemplate:` are not what is being looked for.
    const source = 'const stampTemplate = `<svg></svg>`;';

    expect(extractInlineTemplate(source)).toBeUndefined();
  });

  it('refuses a template that is never closed', () => {
    expect(() => extractInlineTemplate('template: `<p>never ends')).toThrow(
      /never closed/,
    );
  });
});
