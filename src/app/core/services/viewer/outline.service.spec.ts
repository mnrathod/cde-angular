import { TestBed } from '@angular/core/testing';

import { OutlineService } from './outline.service';

/**
 * A PDF is untrusted input: its bookmarks can point nowhere and its links can
 * name any scheme they like. The refusals matter more than the happy path.
 */
describe('OutlineService', () => {
  let outline: OutlineService;

  /** A pdf.js document proxy, with just the parts the service uses. */
  function fakeDoc(options: {
    outline?: unknown[];
    pageIndex?: (ref: unknown) => Promise<number>;
    destinations?: Record<string, unknown>;
  } = {}) {
    return {
      getOutline: async () => options.outline ?? null,
      getDestination: async (name: string) => options.destinations?.[name] ?? null,
      getPageIndex: options.pageIndex ?? (async () => 0)
    };
  }

  beforeEach(() => {
    TestBed.configureTestingModule({});
    outline = TestBed.inject(OutlineService);
  });

  describe('reading the outline', () => {
    it('returns nothing for a document without bookmarks', async () => {
      // Most drawings have none; that is not an error.
      expect(await outline.getOutline(fakeDoc())).toEqual([]);
    });

    it('resolves each entry to a page', async () => {
      const doc = fakeDoc({
        outline: [{ title: 'Foundations', dest: ['ref-3'] }],
        pageIndex: async () => 2
      });

      const entries = await outline.getOutline(doc);

      expect(entries).toHaveLength(1);
      expect(entries[0].title).toBe('Foundations');
      expect(entries[0].page).toBe(3);
    });

    it('keeps nesting and records depth', async () => {
      const doc = fakeDoc({
        outline: [{
          title: 'Part A', dest: ['a'],
          items: [{ title: 'A.1', dest: ['b'], items: [{ title: 'A.1.1', dest: ['c'] }] }]
        }]
      });

      const [top] = await outline.getOutline(doc);

      expect(top.depth).toBe(0);
      expect(top.children[0].depth).toBe(1);
      expect(top.children[0].children[0].depth).toBe(2);
      expect(top.children[0].children[0].title).toBe('A.1.1');
    });

    it('names an untitled bookmark rather than showing a blank row', async () => {
      const [entry] = await outline.getOutline(fakeDoc({ outline: [{ title: '  ', dest: ['a'] }] }));
      expect(entry.title).toBe('(untitled)');
    });

    it('marks a bookmark that points nowhere instead of sending it to page 1', async () => {
      const doc = fakeDoc({
        outline: [{ title: 'Broken', dest: null }],
        pageIndex: async () => { throw new Error('no such page'); }
      });

      expect((await outline.getOutline(doc))[0].page).toBeNull();
    });
  });

  describe('resolving destinations', () => {
    it('follows a named destination', async () => {
      const doc = fakeDoc({
        destinations: { 'section-4': ['ref-7'] },
        pageIndex: async () => 6
      });

      expect(await outline.resolvePage(doc, 'section-4')).toBe(7);
    });

    it('reports nothing for a name the document does not define', async () => {
      expect(await outline.resolvePage(fakeDoc(), 'missing')).toBeNull();
    });

    it('reports nothing for an empty destination', async () => {
      expect(await outline.resolvePage(fakeDoc(), [])).toBeNull();
    });
  });

  describe('link safety', () => {
    it('allows the schemes a document may legitimately link to', () => {
      expect(outline.isSafeUrl('https://example.com/spec.pdf')).toBe(true);
      expect(outline.isSafeUrl('http://example.com')).toBe(true);
      expect(outline.isSafeUrl('mailto:engineer@example.com')).toBe(true);
    });

    it('refuses schemes that would execute or read local files', () => {
      // A PDF's links are attacker-controlled; these must never be followed
      // just because a document asked.
      expect(outline.isSafeUrl('javascript:alert(1)')).toBe(false);
      expect(outline.isSafeUrl('file:///etc/passwd')).toBe(false);
      expect(outline.isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    });

    it('refuses anything it cannot parse', () => {
      expect(outline.isSafeUrl('')).toBe(false);
      expect(outline.isSafeUrl('http://')).toBe(false);
    });
  });

  describe('page links', () => {
    function fakePage(annotations: unknown[]) {
      return { getAnnotations: async () => annotations };
    }

    it('reports an external link with its rectangle', async () => {
      const links = await outline.getPageLinks(fakeDoc(), fakePage([
        { subtype: 'Link', rect: [10, 20, 110, 40], url: 'https://example.com' }
      ]));

      expect(links).toEqual([
        { x: 10, y: 20, width: 100, height: 20, url: 'https://example.com' }
      ]);
    });

    it('normalises a rectangle given corner-first', async () => {
      // PDF rectangles are two opposite corners in any order.
      const [link] = await outline.getPageLinks(fakeDoc(), fakePage([
        { subtype: 'Link', rect: [110, 40, 10, 20], url: 'https://example.com' }
      ]));

      expect(link.x).toBe(10);
      expect(link.y).toBe(20);
      expect(link.width).toBe(100);
    });

    it('resolves an internal jump to a page', async () => {
      const doc = fakeDoc({ pageIndex: async () => 4 });
      const [link] = await outline.getPageLinks(doc, fakePage([
        { subtype: 'Link', rect: [0, 0, 10, 10], dest: ['ref'] }
      ]));

      expect(link.page).toBe(5);
      expect(link.url).toBeUndefined();
    });

    it('drops a link with an unsafe URL rather than rendering it', async () => {
      const links = await outline.getPageLinks(fakeDoc(), fakePage([
        { subtype: 'Link', rect: [0, 0, 10, 10], url: 'javascript:alert(1)' }
      ]));

      expect(links).toEqual([]);
    });

    it('ignores annotations that are not links', async () => {
      const links = await outline.getPageLinks(fakeDoc(), fakePage([
        { subtype: 'Widget', rect: [0, 0, 10, 10] },
        { subtype: 'Text',   rect: [0, 0, 10, 10] }
      ]));

      expect(links).toEqual([]);
    });

    it('drops a link that goes nowhere', async () => {
      const links = await outline.getPageLinks(fakeDoc(), fakePage([
        { subtype: 'Link', rect: [0, 0, 10, 10] }
      ]));

      expect(links).toEqual([]);
    });

    it('survives a page whose annotations cannot be read', async () => {
      const page = { getAnnotations: async () => { throw new Error('broken'); } };
      expect(await outline.getPageLinks(fakeDoc(), page)).toEqual([]);
    });
  });
});
