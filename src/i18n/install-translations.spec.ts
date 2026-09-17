/**
 * Installing a language at startup.
 *
 * <p>The behaviour that matters here is what happens when things go wrong.
 * This runs before Angular boots, on the critical path, against files that
 * may simply not be deployed — so most of these tests are about failing open
 * rather than about the happy path.
 */
vi.mock('@angular/localize', () => ({ loadTranslations: vi.fn() }));

import { loadTranslations } from '@angular/localize';

import {
  installTranslations,
  LOCALE_MANIFEST_URL,
  SOURCE_LOCALE,
  type LocalisableDocument,
} from './install-translations';

/** A document stand-in narrowed to the two attributes that get set. */
function documentStandIn(): LocalisableDocument {
  return { documentElement: { lang: '', dir: '' } };
}

/** A fetch that answers from a map of URL to body, and 404s anything else. */
function serving(bodies: Record<string, unknown>): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    return url in bodies
      ? ({ ok: true, json: async () => bodies[url] } as Response)
      : ({ ok: false, json: async () => ({}) } as Response);
  }) as unknown as typeof fetch;
}

const FRENCH_CATALOGUE = '/assets/locale/messages.fr.json';
const ARABIC_CATALOGUE = '/assets/locale/messages.ar.json';

describe('installTranslations', () => {
  beforeEach(() => vi.mocked(loadTranslations).mockClear());

  it('loads the catalogue for the language the browser asked for', async () => {
    const fetchResource = serving({
      [LOCALE_MANIFEST_URL]: { available: [{ tag: 'fr', name: 'Français' }] },
      [FRENCH_CATALOGUE]: { locale: 'fr', translations: { greeting: 'Bonjour' } },
    });

    const chosen = await installTranslations(fetchResource, documentStandIn(), [
      'fr',
    ]);

    expect(chosen.tag).toBe('fr');
    expect(loadTranslations).toHaveBeenCalledWith({ greeting: 'Bonjour' });
  });

  it('fetches nothing for the source locale', async () => {
    // The common case, and the one that must not pay for this feature: the
    // source text is already in the bundle.
    const fetchResource = serving({
      [LOCALE_MANIFEST_URL]: { available: [{ tag: SOURCE_LOCALE, name: 'English' }] },
    });

    await installTranslations(fetchResource, documentStandIn(), [SOURCE_LOCALE]);

    expect(fetchResource).toHaveBeenCalledTimes(1);
    expect(loadTranslations).not.toHaveBeenCalled();
  });

  it('marks the document with the language it installed', async () => {
    // Without a correct lang, a screen reader pronounces the page in the
    // wrong language — an accessibility failure, not a nicety (§1A).
    const target = documentStandIn();
    const fetchResource = serving({
      [LOCALE_MANIFEST_URL]: { available: [{ tag: 'fr', name: 'Français' }] },
      [FRENCH_CATALOGUE]: { locale: 'fr', translations: {} },
    });

    await installTranslations(fetchResource, target, ['fr']);

    expect(target.documentElement.lang).toBe('fr');
  });

  it('turns the document around for a right-to-left language', async () => {
    const target = documentStandIn();
    const fetchResource = serving({
      [LOCALE_MANIFEST_URL]: { available: [{ tag: 'ar', name: 'العربية' }] },
      [ARABIC_CATALOGUE]: { locale: 'ar', translations: {} },
    });

    await installTranslations(fetchResource, target, ['ar']);

    expect(target.documentElement.dir).toBe('rtl');
  });

  it('falls back to source text when the manifest is missing', async () => {
    // How this ships before any catalogue is deployed, and what a
    // misconfigured static host produces.
    const target = documentStandIn();

    const chosen = await installTranslations(serving({}), target, ['fr']);

    expect(chosen.tag).toBe(SOURCE_LOCALE);
    expect(target.documentElement.lang).toBe(SOURCE_LOCALE);
    expect(loadTranslations).not.toHaveBeenCalled();
  });

  it('still renders when the manifest promises a catalogue that is not there', async () => {
    // A half-finished deployment. The page must come up in source text
    // rather than not come up at all.
    const target = documentStandIn();
    const fetchResource = serving({
      [LOCALE_MANIFEST_URL]: { available: [{ tag: 'fr', name: 'Français' }] },
    });

    const chosen = await installTranslations(fetchResource, target, ['fr']);

    expect(chosen.tag).toBe('fr');
    expect(target.documentElement.lang).toBe('fr');
    expect(loadTranslations).not.toHaveBeenCalled();
  });

  it('still renders when the network fails outright', async () => {
    const rejecting = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;

    const chosen = await installTranslations(rejecting, documentStandIn(), ['fr']);

    expect(chosen.tag).toBe(SOURCE_LOCALE);
  });

  it('still renders when a catalogue is malformed', async () => {
    // A truncated or hand-edited file must not take the application down.
    const fetchResource = serving({
      [LOCALE_MANIFEST_URL]: { available: [{ tag: 'fr', name: 'Français' }] },
      [FRENCH_CATALOGUE]: { locale: 'fr' },
    });

    const chosen = await installTranslations(fetchResource, documentStandIn(), [
      'fr',
    ]);

    expect(chosen.tag).toBe('fr');
    expect(loadTranslations).not.toHaveBeenCalled();
  });

  it('ignores a manifest whose shape is wrong', async () => {
    const fetchResource = serving({ [LOCALE_MANIFEST_URL]: { available: 'fr' } });

    const chosen = await installTranslations(fetchResource, documentStandIn(), [
      'fr',
    ]);

    expect(chosen.tag).toBe(SOURCE_LOCALE);
  });
});
