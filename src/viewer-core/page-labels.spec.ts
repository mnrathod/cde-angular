/**
 * Saying which page of a document something is on.
 *
 * <p>These were six copies of English words sitting beside an interpolation —
 * `Page {{ n }}` and `p{{ n }}` — which is the shape the markup sweep could
 * not see until it was taught to, so every one shipped unmarked.
 */
import { abbreviatedPageLabel, pageLabel } from "./page-labels";

describe("page labels", () => {
  it("says which page, in a form that can be read on its own", () => {
    expect(pageLabel(4)).toContain("4");
    expect(pageLabel(4)).toMatch(/\p{Letter}/u);
  });

  it("abbreviates for a row it has to share", () => {
    // It sits beside a name and a value in a dense list, so it has to stay to
    // a couple of characters.
    expect(abbreviatedPageLabel(4)).toContain("4");
    expect(abbreviatedPageLabel(4).length).toBeLessThan(pageLabel(4).length);
  });

  it("keeps the two forms as separate messages", () => {
    // One id for both would force a translator to pick a single wording for a
    // phrase read alone and an abbreviation squeezed into a list.
    expect(abbreviatedPageLabel(4)).not.toBe(pageLabel(4));
  });

  it("puts the number in rather than leaving a placeholder behind", () => {
    // The failure mode of a mistyped $localize placeholder: it compiles, and
    // ships the marker to the user.
    expect(pageLabel(12)).not.toContain(":page:");
    expect(abbreviatedPageLabel(12)).not.toContain(":page:");
  });
});
