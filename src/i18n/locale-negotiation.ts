/**
 * Choosing which language to render in, and which way round to render it.
 *
 * <p>Both functions here are pure and take everything they need as an
 * argument — no `navigator`, no `document`, no fetch. That is deliberate:
 * language negotiation is the kind of logic that is easy to get subtly wrong
 * (a browser offering `fr-CA` when only `fr` is deployed, a user whose first
 * preference is a language nobody has translated yet) and impossible to test
 * honestly if it reads global state.
 */

/**
 * Whether a locale is written right-to-left.
 *
 * <p>Keyed by ISO 639 primary subtag, because direction is a property of the
 * script a language is written in, not of the region: `ar-AE` and `ar-EG` are
 * both right-to-left, and no Arabic-speaking region is an exception.
 *
 * <p>This is a short list on purpose. It covers the languages written in
 * right-to-left scripts that a product is realistically translated into, and
 * anything absent is treated as left-to-right — which is the correct answer
 * for the overwhelming majority of tags and a visibly wrong one only for a
 * language we have not been asked to ship.
 */
const RIGHT_TO_LEFT_LANGUAGES: ReadonlySet<string> = new Set([
  'ar', // Arabic
  'ckb', // Central Kurdish
  'dv', // Divehi
  'fa', // Persian
  'he', // Hebrew
  'ps', // Pashto
  'sd', // Sindhi
  'ug', // Uyghur
  'ur', // Urdu
  'yi', // Yiddish
]);

export type TextDirection = 'ltr' | 'rtl';

/** One locale the deployment has a translation catalogue for. */
export interface AvailableLocale {
  /** BCP 47 tag, e.g. `en-AU`, `fr`, `ar-AE`. */
  readonly tag: string;
  /** The language's own name for itself, for a language picker. */
  readonly name: string;
}

/** The outcome of negotiation: what to render, and which way round. */
export interface NegotiatedLocale {
  readonly tag: string;
  readonly direction: TextDirection;
  /**
   * Whether this is the locale the source strings are written in. When it is,
   * there is no catalogue to fetch and no translation to load.
   */
  readonly isSource: boolean;
}

/** The primary language subtag, lowercased. `en-AU` → `en`. */
function languageOf(tag: string): string {
  const [language = ''] = tag.split('-', 1);
  return language.toLowerCase();
}

/** Which way round a locale's text runs. */
export function directionForLocale(tag: string): TextDirection {
  return RIGHT_TO_LEFT_LANGUAGES.has(languageOf(tag)) ? 'rtl' : 'ltr';
}

/**
 * Picks the best available locale for a browser's stated preferences.
 *
 * <p>Follows the shape of RFC 4647 lookup, in the order that matters:
 *
 * <ol>
 *   <li>An exact tag match, ignoring case — `fr-CA` wants `fr-CA`.
 *   <li>Failing that, any available locale in the same language — `fr-CA`
 *       falls back to `fr`, and to `fr-FR` if that is what is deployed.
 *       Regional French is far closer to the user's intent than English is.
 *   <li>Failing that, the next preference, because a browser sends an ordered
 *       list and the second entry is a real preference rather than a tiebreak.
 * </ol>
 *
 * <p>When nothing matches, the source locale wins. Rendering untranslated
 * source text is the correct failure: it is legible, it is what the developer
 * wrote, and it is better than an empty screen.
 *
 * @param preferred ordered preferences, most-wanted first (`navigator.languages`)
 * @param available the locales this deployment actually has catalogues for
 * @param sourceLocale the locale the source strings are written in
 */
export function negotiateLocale(
  preferred: readonly string[],
  available: readonly AvailableLocale[],
  sourceLocale: string,
): NegotiatedLocale {
  for (const preference of preferred) {
    const match = bestMatchFor(preference, available);
    if (match) return describe(match, sourceLocale);
  }
  return describe(sourceLocale, sourceLocale);
}

function bestMatchFor(
  preference: string,
  available: readonly AvailableLocale[],
): string | undefined {
  const wanted = preference.toLowerCase();
  const exact = available.find(locale => locale.tag.toLowerCase() === wanted);
  if (exact) return exact.tag;

  const language = languageOf(preference);
  return available.find(locale => languageOf(locale.tag) === language)?.tag;
}

function describe(tag: string, sourceLocale: string): NegotiatedLocale {
  return {
    tag,
    direction: directionForLocale(tag),
    isSource: tag.toLowerCase() === sourceLocale.toLowerCase(),
  };
}
