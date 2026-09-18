/**
 * A pending rearrangement of a document's pages.
 *
 * <p>Reordering, rotating, duplicating and deleting all happen here before
 * anything is sent: a page organiser that committed each drag would make a
 * new version of the document per gesture, and there would be no way to
 * change your mind.
 *
 * <p>Pulled out of the component because it is the part with the rules in it
 * and none of them need a browser — an id that survives duplication, a
 * baseline to tell an edit from a no-op, and the one page that cannot be
 * deleted because a document with no pages is not a document.
 */
import { signal } from "@angular/core";
import { computed } from "@angular/core";

/**
 * One page in the pending layout.
 *
 * <p>`id` is the draft's own, not the document's: duplicating page 3 gives
 * two entries with the same `sourcePage`, and something has to tell them
 * apart.
 */
export interface DraftPage {
  id: number;
  sourcePage: number;
  rotate: number;
}

/** How a click changes the selection. */
export interface SelectionIntent {
  /** Ctrl, meta or shift held — add to the selection rather than replace it. */
  additive: boolean;
}

export class PageDraft {
  /** The pending layout, in the order the pages will end up in. */
  readonly pages = signal<DraftPage[]>([]);
  /** Which pages are selected, by draft id. */
  readonly selection = signal<ReadonlySet<number>>(new Set());

  /** The layout as it was loaded, to tell an edit from a no-op. */
  private baseline: DraftPage[] = [];
  private nextId = 1;

  readonly dirty = computed(() => {
    const current = this.pages();
    if (current.length !== this.baseline.length) return true;
    return current.some((page, index) => {
      // Lengths were compared above, so the index is in range. Treating a
      // missing baseline entry as "changed" is also the right answer if that
      // ever stops holding: the draft would differ from the baseline.
      const original = this.baseline[index];
      return (
        !original ||
        page.sourcePage !== original.sourcePage ||
        page.rotate !== original.rotate
      );
    });
  });

  readonly hasSelection = computed(() => this.selection().size > 0);

  readonly allSelected = computed(
    () =>
      this.pages().length > 0 && this.selection().size === this.pages().length,
  );

  /** Deleting everything would leave no document, so the last page is kept. */
  readonly canDeleteSelection = computed(
    () => this.hasSelection() && this.selection().size < this.pages().length,
  );

  /** Starts again from a document of the given length. */
  reset(pageCount: number): void {
    this.nextId = 1;
    const pages = Array.from({ length: pageCount }, (_unused, index) => ({
      id: this.nextId++,
      sourcePage: index + 1,
      rotate: 0,
    }));
    this.baseline = pages.map((page) => ({ ...page }));
    this.pages.set(pages);
    this.selection.set(new Set());
  }

  isSelected(id: number): boolean {
    return this.selection().has(id);
  }

  /** Plain click replaces the selection; ctrl, meta or shift adds to it. */
  select(id: number, intent: SelectionIntent): void {
    this.selection.update((current) => {
      const next = intent.additive ? new Set(current) : new Set<number>();
      // A click on the only selected page clears it, so a selection can be
      // undone without reaching for a modifier.
      if (current.has(id) && (intent.additive || current.size === 1)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  /** Selects everything, or clears it when everything already is. */
  toggleSelectAll(): void {
    this.selection.set(
      this.allSelected()
        ? new Set()
        : new Set(this.pages().map((page) => page.id)),
    );
  }

  /** The page with this draft id, if it is still in the layout. */
  pageWithId(id: number): DraftPage | undefined {
    return this.pages().find((page) => page.id === id);
  }

  move(from: number, to: number): void {
    if (from === to) return;
    this.pages.update((pages) => {
      const next = [...pages];
      const [moved] = next.splice(from, 1);
      if (moved) next.splice(to, 0, moved);
      return next;
    });
  }

  /** Turns the selected pages, keeping the angle in 0–359. */
  rotateSelection(degrees: number): void {
    const selected = this.selection();
    this.pages.update((pages) =>
      pages.map((page) =>
        selected.has(page.id)
          ? { ...page, rotate: (((page.rotate + degrees) % 360) + 360) % 360 }
          : page,
      ),
    );
  }

  /** Each selected page gains a copy of itself, immediately after it. */
  duplicateSelection(): void {
    const selected = this.selection();
    this.pages.update((pages) =>
      pages.flatMap((page) =>
        selected.has(page.id)
          ? [page, { ...page, id: this.nextId++ }]
          : [page],
      ),
    );
  }

  deleteSelection(): void {
    if (!this.canDeleteSelection()) return;
    const selected = this.selection();
    this.pages.update((pages) => pages.filter((page) => !selected.has(page.id)));
    this.selection.set(new Set());
  }

  /** Throws the pending changes away and goes back to the loaded layout. */
  discard(): void {
    this.pages.set(this.baseline.map((page) => ({ ...page })));
    this.selection.set(new Set());
  }

  /** How many pages the document had when the draft was started. */
  originalPageCount(): number {
    return this.baseline.length;
  }

  /**
   * Where inserted pages land: after the last selected page, or at the end
   * when nothing is selected. One-based, as the page service expects.
   */
  insertPosition(): number | undefined {
    const selected = this.selection();
    if (!selected.size) return undefined;
    const lastIndex = this.pages().reduce(
      (last, page, index) => (selected.has(page.id) ? index : last),
      -1,
    );
    return lastIndex >= 0 ? lastIndex + 2 : undefined;
  }

  /** Selected pages as source page numbers, in order, without duplicates. */
  selectedSourcePages(): number[] {
    const selected = this.selection();
    return [
      ...new Set(
        this.pages()
          .filter((page) => selected.has(page.id))
          .map((page) => page.sourcePage),
      ),
    ].sort((left, right) => left - right);
  }
}
