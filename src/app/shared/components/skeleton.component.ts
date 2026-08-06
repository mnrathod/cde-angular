import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Skeleton loader components for consistent loading states.
 *
 * Usage:
 *   <app-skeleton type="card" [count]="6" />
 *   <app-skeleton type="list" [count]="5" />
 *   <app-skeleton type="text" [lines]="3" />
 *   <app-skeleton type="thumbnail" />
 *
 * All skeletons use a shimmer animation and match the Asite theme.
 */
@Component({
  selector: 'app-skeleton',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Card grid skeleton (document grid) -->
    @if (type === 'card') {
      <div class="grid gap-3" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr))">
        @for (i of countArr; track i) {
          <div class="bg-white rounded border border-gray-200 shadow-sm overflow-hidden">
            <div class="h-24 skeleton-bg"></div>
            <div class="p-2.5 space-y-2">
              <div class="h-3 skeleton-bg rounded w-4/5"></div>
              <div class="h-2.5 skeleton-bg rounded w-3/5"></div>
              <div class="h-2 skeleton-bg rounded w-2/5"></div>
            </div>
          </div>
        }
      </div>
    }

    <!-- List skeleton (annotation list, project list) -->
    @if (type === 'list') {
      <div class="space-y-2 p-3">
        @for (i of countArr; track i) {
          <div class="flex items-center gap-3 p-2">
            <div class="w-8 h-8 rounded-full skeleton-bg flex-shrink-0"></div>
            <div class="flex-1 space-y-1.5">
              <div class="h-3 skeleton-bg rounded" [style.width]="widths[i % widths.length]"></div>
              <div class="h-2.5 skeleton-bg rounded w-2/3"></div>
            </div>
          </div>
        }
      </div>
    }

    <!-- Text skeleton (descriptions, summaries) -->
    @if (type === 'text') {
      <div class="space-y-2">
        @for (i of linesArr; track i) {
          <div class="h-3 skeleton-bg rounded"
               [style.width]="i === linesArr.length - 1 ? '65%' : '100%'">
          </div>
        }
      </div>
    }

    <!-- Thumbnail skeleton (page thumbnails) -->
    @if (type === 'thumbnail') {
      <div class="space-y-2">
        @for (i of countArr; track i) {
          <div class="skeleton-bg rounded aspect-[3/4] w-full"></div>
          <div class="h-2 skeleton-bg rounded w-1/3 mx-auto"></div>
        }
      </div>
    }

    <!-- Table skeleton -->
    @if (type === 'table') {
      <div class="space-y-1">
        <div class="h-8 skeleton-bg rounded mb-2"></div>
        @for (i of countArr; track i) {
          <div class="flex gap-3 py-2 border-b border-gray-100">
            <div class="h-3 skeleton-bg rounded flex-1"></div>
            <div class="h-3 skeleton-bg rounded w-24"></div>
            <div class="h-3 skeleton-bg rounded w-16"></div>
            <div class="h-3 skeleton-bg rounded w-20"></div>
          </div>
        }
      </div>
    }

    <!-- Inline / single line -->
    @if (type === 'inline') {
      <div class="h-4 skeleton-bg rounded" [style.width]="width"></div>
    }
  `,
  styles: [`
    @keyframes shimmer {
      0%   { background-position: -200% 0; }
      100% { background-position:  200% 0; }
    }
    .skeleton-bg {
      background: linear-gradient(90deg,
        #f0f2f5 25%, #e4e8ec 50%, #f0f2f5 75%);
      background-size: 200% 100%;
      animation: shimmer 1.4s ease-in-out infinite;
    }
  `]
})
export class SkeletonComponent {
  @Input() type:  'card' | 'list' | 'text' | 'thumbnail' | 'table' | 'inline' = 'card';
  @Input() count = 6;
  @Input() lines = 3;
  @Input() width = '100%';

  get countArr() { return Array.from({ length: this.count }, (_, i) => i); }
  get linesArr()  { return Array.from({ length: this.lines }, (_, i) => i); }
  readonly widths = ['100%','85%','90%','75%','95%','80%'];
}
