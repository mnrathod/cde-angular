/**
 * The three kinds of button in the command bar, and the rule between them.
 *
 * <p>Named rather than repeated inline so a change lands on every control at
 * once, and so the difference between them is a deliberate choice rather
 * than a copy that drifted. Out of the component because the bar is now more
 * than one component and they have to agree — two copies of a button style
 * is how a toolbar ends up with two heights in it.
 */

/** A square button whose whole content is an icon. */
export const ICON_BUTTON =
  "w-8 h-8 rounded-md inline-flex items-center justify-center text-gray-600 " +
  "hover:bg-gray-100 hover:text-gray-900 transition-colors " +
  "disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed";

/** The same, while the thing it toggles is on. */
export const ACTIVE_ICON_BUTTON =
  "w-8 h-8 rounded-md inline-flex items-center justify-center " +
  "bg-accent/10 text-accent transition-colors";

/** An icon with a word beside it. */
export const LABELLED_BUTTON =
  "h-8 px-2 rounded-md inline-flex items-center gap-1.5 text-xs font-medium " +
  "text-gray-700 hover:bg-gray-100 transition-colors " +
  "disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed";

/** The hairline between groups of controls. */
export const TOOLBAR_DIVIDER = "w-px h-5 bg-gray-200 mx-1.5";
