import { Component, input, inject, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

import { CollaborationService } from '../../../core/services/collaboration.service';

/**
 * Other people's pointers, drawn over a page.
 *
 * <p>Positions arrive in PDF page coordinates and are scaled here, so a
 * cursor lands on the same part of the drawing regardless of what zoom each
 * viewer is using — sending screen pixels would put it somewhere else
 * entirely for anyone not at 100%.
 *
 * <p>Pointer-events are off throughout: a remote cursor is a picture of where
 * someone is, never something to click.
 */
@Component({
  selector: 'app-remote-cursors',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="absolute top-0 left-0 w-full h-full pointer-events-none" style="z-index:5">
      @for (cursor of onThisPage(); track cursor.username) {
        <div class="absolute transition-transform duration-75 ease-linear"
             [style.transform]="translate(cursor)">
          <svg width="14" height="20" viewBox="0 0 14 20" class="drop-shadow">
            <path d="M1 1 L1 15 L5 11.5 L7.5 17.5 L10 16.5 L7.5 10.5 L12.5 10.5 Z"
                  [attr.fill]="cursor.colour" stroke="white" stroke-width="1.2" />
          </svg>
          <span class="absolute left-3 top-4 px-1.5 py-0.5 rounded text-white text-[10px]
                       whitespace-nowrap shadow"
                [style.background]="cursor.colour">
            {{ cursor.username }}
          </span>
        </div>
      }
    </div>
  `
})
export class RemoteCursorsComponent {
  /** Page these cursors belong to; others are drawn by their own page. */
  readonly pageNumber = input.required<number>();
  readonly zoom       = input.required<number>();

  private collaboration = inject(CollaborationService);

  // Signal inputs, so the filter re-runs when the page re-renders at a new
  // zoom rather than capturing the value it happened to have at creation.
  readonly onThisPage = computed(() =>
    this.collaboration.cursors().filter(cursor => cursor.page === this.pageNumber())
  );

  translate(cursor: { x: number; y: number }): string {
    const scale = this.zoom();
    return `translate(${cursor.x * scale}px, ${cursor.y * scale}px)`;
  }
}
