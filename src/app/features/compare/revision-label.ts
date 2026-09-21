/**
 * The revision suffix shown after a file name, e.g. "· Rev B".
 *
 * <p>In one place rather than two because it is a translatable message with
 * a fixed id. Two copies of one message id is the drift that a catalogue
 * cannot see: both extract to the same entry, so the day one copy's wording
 * changes, the extractor keeps whichever it met first and the other silently
 * stops matching what is on screen.
 */
export function revisionSuffix(revision: string): string {
  return $localize`:Appended after a file name to show its revision@@compare.revisionSuffix:· Rev ${revision}:revision:`;
}
