import {
  negotiateLocale,
  type AvailableLocale,
  type NegotiatedLocale,
} from './locale-negotiation';

/**
 * Installing the user's language, at startup, before anything renders.
 *
 * <p>§1.4 requires i18n from day one and §9.2 requires one artifact promoted
 * unchanged through every environment. Angular's default answer to i18n
 * conflicts with the second: it compiles one bundle per locale and picks
 * between them at deploy time, so adding a language means rebuilding and
 * shipping a different artifact to different places.
 *
 * <p>So translations load at runtime instead. One bundle, one image, and the
 * set of available languages is a file in the deployment rather than a
 * property of the build — adding a language is dropping in a catalogue, with
 * no rebuild and nothing to promote.
 *
 * <p>The cost of that choice, stated plainly: the translation is fetched and
 * applied before Angular boots, so it sits on the critical path. It is one
 * small JSON request, it does not happen at all for the source locale (the
 * common case), and a failure is non-fatal — but it is not free, and it is
 * the reason everything here is careful about failing open.
 */

/** The locale the source strings in this repository are written in. */
export const SOURCE_LOCALE = 'en-AU';

/** Where the deployment says which languages it has catalogues for. */
export const LOCALE_MANIFEST_URL = '/assets/locale/locales.json';

/** What a translation catalogue looks like on disk. */
interface TranslationCatalogue {
  readonly locale: string;
  /** Message ID to translated text, as `ng extract-i18n --format=json` emits. */
  readonly translations: Record<string, string>;
}

/** What the deployment publishes about the languages it carries. */
interface LocaleManifest {
  readonly available: readonly AvailableLocale[];
}

/**
 * Installs a message catalogue into `$localize`.
 *
 * <p>Named rather than imported directly so that it arrives as an argument
 * like everything else here, which lets a test observe the call without
 * mocking a module — and, more importantly, keeps this function from reaching
 * into global state it has not declared.
 */
export type TranslationInstaller = (
  translations: Record<string, string>,
) => void;

/**
 * The document properties that must agree with the chosen locale.
 *
 * <p>Narrowed to the two attributes this actually sets so that a test can
 * supply a plain object, and so nothing here can reach further into the DOM
 * than it has declared it will.
 */
export interface LocalisableDocument {
  documentElement: { lang: string; dir: string };
}

/**
 * Resolves the user's language and loads its translations.
 *
 * <p>Every dependency is a parameter because this runs before Angular exists,
 * so there is no injector to take them from, and because a function that
 * reads `navigator` and `window.fetch` directly cannot be tested without
 * standing up a browser.
 *
 * <p>**Never rejects.** A missing manifest, an unreachable catalogue or a
 * malformed file leaves the application rendering untranslated source text,
 * which is legible and correct-if-not-ideal. Failing the boot instead would
 * turn a translation problem into a blank screen, and the source text is
 * exactly what a user would see if nobody had translated their language yet.
 *
 * @param fetchResource how to retrieve the manifest and catalogue
 * @param target the document whose `lang` and `dir` must match
 * @param preferredLanguages ordered preferences, most-wanted first
 * @param loadTranslations what to hand the catalogue to, once read
 * @returns the locale that was actually installed
 */
export async function installTranslations(
  fetchResource: typeof fetch,
  target: LocalisableDocument,
  preferredLanguages: readonly string[],
  loadTranslations: TranslationInstaller,
): Promise<NegotiatedLocale> {
  const available = await readManifest(fetchResource);
  const chosen = negotiateLocale(preferredLanguages, available, SOURCE_LOCALE);

  if (!chosen.isSource) {
    const translations = await readCatalogue(fetchResource, chosen.tag);
    if (translations) loadTranslations(translations);
  }

  target.documentElement.lang = chosen.tag;
  target.documentElement.dir = chosen.direction;
  return chosen;
}

async function readManifest(
  fetchResource: typeof fetch,
): Promise<readonly AvailableLocale[]> {
  const manifest = await readJson<LocaleManifest>(
    fetchResource,
    LOCALE_MANIFEST_URL,
  );
  return Array.isArray(manifest?.available) ? manifest.available : [];
}

async function readCatalogue(
  fetchResource: typeof fetch,
  tag: string,
): Promise<Record<string, string> | undefined> {
  const catalogue = await readJson<TranslationCatalogue>(
    fetchResource,
    `/assets/locale/messages.${tag}.json`,
  );
  const translations = catalogue?.translations;
  return translations && typeof translations === 'object'
    ? translations
    : undefined;
}

/** Fetches and parses JSON, treating every failure as "not there". */
async function readJson<T>(
  fetchResource: typeof fetch,
  url: string,
): Promise<T | undefined> {
  try {
    const response = await fetchResource(url);
    if (!response.ok) return undefined;
    return (await response.json()) as T;
  } catch {
    return undefined;
  }
}
