import {
  directionForLocale,
  negotiateLocale,
  type AvailableLocale,
} from './locale-negotiation';

const SOURCE = 'en-AU';

function deployed(...tags: string[]): AvailableLocale[] {
  return tags.map(tag => ({ tag, name: tag }));
}

describe('directionForLocale', () => {
  it('reads Arabic right to left', () => {
    expect(directionForLocale('ar')).toBe('rtl');
  });

  it('reads Arabic right to left in every region', () => {
    // Direction belongs to the script, not the country. Keying this off the
    // full tag would make ar-EG left-to-right by omission.
    expect(directionForLocale('ar-EG')).toBe('rtl');
    expect(directionForLocale('ar-AE')).toBe('rtl');
  });

  it('ignores case in the tag', () => {
    expect(directionForLocale('HE-IL')).toBe('rtl');
  });

  it('reads English left to right', () => {
    expect(directionForLocale('en-AU')).toBe('ltr');
  });

  it('treats an unknown language as left to right', () => {
    // The right default: wrong only for a language nobody asked us to ship,
    // and correct for the overwhelming majority of tags.
    expect(directionForLocale('xx-YY')).toBe('ltr');
  });
});

describe('negotiateLocale', () => {
  it('takes an exact match', () => {
    const chosen = negotiateLocale(['fr-CA'], deployed('en-AU', 'fr-CA'), SOURCE);

    expect(chosen.tag).toBe('fr-CA');
    expect(chosen.isSource).toBe(false);
  });

  it('ignores case when matching', () => {
    // Browsers are not consistent about this and the tag is case-insensitive.
    const chosen = negotiateLocale(['FR-ca'], deployed('fr-CA'), SOURCE);

    expect(chosen.tag).toBe('fr-CA');
  });

  it('falls back to the same language in another region', () => {
    // Canadian French rendered as French is a small compromise. Canadian
    // French rendered as English is a failure.
    const chosen = negotiateLocale(['fr-CA'], deployed('en-AU', 'fr-FR'), SOURCE);

    expect(chosen.tag).toBe('fr-FR');
  });

  it('prefers an exact match over a same-language one', () => {
    const chosen = negotiateLocale(['fr-CA'], deployed('fr-FR', 'fr-CA'), SOURCE);

    expect(chosen.tag).toBe('fr-CA');
  });

  it('moves to the next preference when the first is not deployed', () => {
    // navigator.languages is ordered, so the second entry is a real
    // preference rather than a tiebreak.
    const chosen = negotiateLocale(['de', 'fr'], deployed('en-AU', 'fr'), SOURCE);

    expect(chosen.tag).toBe('fr');
  });

  it('falls back to the source locale when nothing matches', () => {
    const chosen = negotiateLocale(['de', 'ja'], deployed('en-AU'), SOURCE);

    expect(chosen.tag).toBe(SOURCE);
    expect(chosen.isSource).toBe(true);
  });

  it('falls back to the source locale when the browser states no preference', () => {
    const chosen = negotiateLocale([], deployed('en-AU', 'fr'), SOURCE);

    expect(chosen.tag).toBe(SOURCE);
    expect(chosen.isSource).toBe(true);
  });

  it('falls back to the source locale when nothing is deployed at all', () => {
    // The state this ships in: the mechanism is live before any catalogue
    // exists, and must render source text rather than fail.
    const chosen = negotiateLocale(['fr'], [], SOURCE);

    expect(chosen.tag).toBe(SOURCE);
    expect(chosen.isSource).toBe(true);
  });

  it('marks the source locale as the source even when it is listed', () => {
    // It appears in the manifest so a language picker can offer it, but it
    // still must not trigger a catalogue fetch.
    const chosen = negotiateLocale(['en-AU'], deployed('en-AU', 'fr'), SOURCE);

    expect(chosen.isSource).toBe(true);
  });

  it('reports the direction of the locale it chose', () => {
    const chosen = negotiateLocale(['ar-EG'], deployed('en-AU', 'ar-EG'), SOURCE);

    expect(chosen.direction).toBe('rtl');
  });
});
