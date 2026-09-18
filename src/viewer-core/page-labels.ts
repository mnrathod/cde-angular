/**
 * Saying which page of a document something is on.
 *
 * <p>Written out in six places across the viewer, four of them as the bare
 * `p{{ n }}` that dense lists use. Every one was English words sitting beside
 * an interpolation, which is the shape the markup sweep could not see until
 * it was taught to — so they all shipped unmarked.
 *
 * <p>Two forms, because they are not the same message. The long one is read
 * on its own and has room to be a phrase; the short one shares a row with a
 * name and a value and has to stay to a couple of characters. A translator
 * needs to see that difference rather than infer it.
 */

/** "Page 4" — the form with room to be read. */
export function pageLabel(page: number): string {
  return $localize`:Says which page of a document something is on@@page.number:Page ${page}:page:`;
}

/**
 * "p4" — the same thing, abbreviated for a dense list.
 *
 * <p>Some languages have no such abbreviation and will use the long form
 * here; that is the translator's call, and the separate id is what lets them
 * make it.
 */
export function abbreviatedPageLabel(page: number): string {
  return $localize`:Which page something is on, abbreviated to a couple of characters because it shares a narrow row with a name and a value. Use the long form where no abbreviation is idiomatic.@@page.numberShort:p${page}:page:`;
}
