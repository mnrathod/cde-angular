import {
  Component, inject, signal, effect, ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { OutlineService, OutlineEntry } from '../../../../viewer-core/outline.service';
import { ViewerStateService } from '../../../../viewer-core/viewer-state.service';

/** An outline entry flattened for rendering, carrying its own collapsed state. */
interface VisibleEntry {
  entry:      OutlineEntry;
  /** Path through the tree, used as the collapse key and the track identity. */
  key:        string;
  hasChildren: boolean;
  collapsed:  boolean;
}

/**
 * The document's bookmarks.
 *
 * <p>pdf.js has always exposed the outline and it was never read, so a
 * specification with a hundred sections offered no way to reach one except
 * scrolling.
 *
 * <p>Rendered as a flattened list rather than a recursive component: the tree
 * is display-only, and recursion would mean a component instance per node for
 * no behaviour that a depth indent does not already give.
 */
@Component({
  selector: 'app-outline-panel',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex-1 overflow-y-auto p-2">
      @if (loading()) {
        <div class="text-center text-gray-400 text-xs py-8">Reading bookmarks...</div>
      } @else if (!entries().length) {
        <div class="text-center text-gray-400 text-xs py-8 px-2">
          This document has no bookmarks.
        </div>
      }

      @for (row of visible(); track row.key) {
        <div class="flex items-center gap-1 text-xs rounded hover:bg-gray-50"
             [style.padding-left.px]="row.entry.depth * 10">
          @if (row.hasChildren) {
            <button (click)="toggle(row.key)"
              class="w-4 flex-shrink-0 text-gray-400 hover:text-gray-700"
              [title]="row.collapsed ? 'Expand' : 'Collapse'">
              {{ row.collapsed ? '▸' : '▾' }}
            </button>
          } @else {
            <span class="w-4 flex-shrink-0"></span>
          }

          <button (click)="go(row.entry)" [disabled]="row.entry.page === null"
            [title]="row.entry.page === null
              ? 'This bookmark points nowhere'
              : 'Go to page ' + row.entry.page"
            class="flex-1 min-w-0 text-left py-1 truncate disabled:text-gray-400
                   disabled:cursor-default"
            [class.font-medium]="row.entry.page === state.currentPage()">
            {{ row.entry.title }}
          </button>

          @if (row.entry.page !== null) {
            <span class="text-gray-400 flex-shrink-0 pr-1">{{ row.entry.page }}</span>
          }
        </div>
      }
    </div>
  `
})
export class OutlinePanelComponent {
  private outline = inject(OutlineService);
  readonly state  = inject(ViewerStateService);

  readonly entries   = signal<OutlineEntry[]>([]);
  readonly loading   = signal(false);
  readonly collapsed = signal<Set<string>>(new Set());

  constructor() {
    // Re-read when the document loads or a new version replaces it: page
    // manipulation can move or remove the pages bookmarks point at.
    effect(() => {
      this.state.reloadToken();
      const pdfDoc = this.state.pdfDoc();
      if (pdfDoc) this.load(pdfDoc);
    });
  }

  /** Entries whose ancestors are all expanded. */
  readonly visible = signal<VisibleEntry[]>([]);

  toggle(key: string) {
    this.collapsed.update(current => {
      const next = new Set(current);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
    this.rebuild();
  }

  go(entry: OutlineEntry) {
    if (entry.page !== null) this.state.navigateTo(entry.page);
  }

  private load(pdfDoc: unknown) {
    this.loading.set(true);
    this.outline.getOutline(pdfDoc)
      .then(entries => {
        this.entries.set(entries);
        // Deep outlines open collapsed below the second level, so a long
        // specification does not arrive as hundreds of rows.
        this.collapsed.set(new Set(this.keysDeeperThan(entries, 1)));
        this.rebuild();
      })
      .catch(() => this.entries.set([]))
      .finally(() => this.loading.set(false));
  }

  private keysDeeperThan(entries: OutlineEntry[], depth: number, prefix = ''): string[] {
    const keys: string[] = [];
    entries.forEach((entry, index) => {
      const key = `${prefix}${index}`;
      if (entry.depth >= depth && entry.children.length) keys.push(key);
      keys.push(...this.keysDeeperThan(entry.children, depth, `${key}.`));
    });
    return keys;
  }

  private rebuild() {
    const collapsed = this.collapsed();
    const rows: VisibleEntry[] = [];

    const walk = (entries: OutlineEntry[], prefix: string) => {
      entries.forEach((entry, index) => {
        const key = `${prefix}${index}`;
        const hasChildren = entry.children.length > 0;
        const isCollapsed = collapsed.has(key);
        rows.push({ entry, key, hasChildren, collapsed: isCollapsed });
        if (hasChildren && !isCollapsed) walk(entry.children, `${key}.`);
      });
    };

    walk(this.entries(), '');
    this.visible.set(rows);
  }
}
