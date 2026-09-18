/**
 * The words and chip colours behind the project screens.
 *
 * <p>The behaviour worth guarding is the fallback. The server can add a phase
 * or a status before this table knows about it, and the two possible failures
 * are very different: showing `HANDOVER` is untidy, showing an empty chip
 * looks like missing data.
 */
import {
  DOCUMENT_STATUSES,
  PROJECT_PHASES,
  phaseChipStyle,
  phaseLabel,
  statusChipStyle,
  statusLabel,
} from "./project-vocabulary";

describe("project vocabulary", () => {
  it("gives every phase it offers a word rather than a stored value", () => {
    const unworded = PROJECT_PHASES.filter(
      (phase) => phaseLabel(phase) === phase,
    );

    expect(unworded).toEqual([]);
  });

  it("gives every status it offers a word rather than a stored value", () => {
    // The one that matters most: IN_REVIEW rendered by replacing the
    // underscore reads "IN REVIEW", which is not a sentence in any language.
    const unworded = DOCUMENT_STATUSES.filter(
      (status) => statusLabel(status) === status,
    );

    expect(unworded).toEqual([]);
    expect(statusLabel("IN_REVIEW")).toBe("In review");
  });

  it("shows an unrecognised phase rather than nothing", () => {
    // The server may add one before this table does. An untidy chip beats an
    // empty one, which reads as missing data.
    expect(phaseLabel("DECOMMISSIONING")).toBe("DECOMMISSIONING");
  });

  it("shows an unrecognised status rather than nothing", () => {
    expect(statusLabel("WITHDRAWN")).toBe("WITHDRAWN");
  });

  it("still colours a chip it does not recognise", () => {
    // An unstyled chip renders as unreadable dark-on-dark against the card,
    // so the fallback has to be a real pair of colours rather than "".
    expect(phaseChipStyle("DECOMMISSIONING")).toContain("color:");
    expect(statusChipStyle("WITHDRAWN")).toContain("background:");
  });

  it("gives each status its own colour, so two do not read as one", () => {
    const colours = DOCUMENT_STATUSES.map(statusChipStyle);

    expect(new Set(colours).size).toBe(DOCUMENT_STATUSES.length);
  });
});
