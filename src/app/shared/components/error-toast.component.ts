import { Component, inject, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GlobalErrorHandler } from '../../core/handlers/global-error.handler';

@Component({
  selector: 'app-error-toast',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      @for (err of visibleErrors(); track err.id) {
        <div
          class="pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-lg shadow-lg border text-sm animate-slide-in"
          [class]="toastClass(err.type, err.status)">

          <!-- Icon -->
          <span class="text-base flex-shrink-0 mt-0.5">{{ toastIcon(err.type, err.status) }}</span>

          <!-- Content -->
          <div class="flex-1 min-w-0">
            <div class="font-semibold">{{ err.message }}</div>
            @if (err.detail && err.type !== 'runtime') {
              <div class="text-xs opacity-75 mt-0.5 truncate">{{ err.detail }}</div>
            }
            @if (err.type === 'chunk') {
              <button (click)="reload()"
                class="mt-1.5 text-xs underline hover:no-underline">
                Refresh page
              </button>
            }
          </div>

          <!-- Dismiss -->
          <button (click)="handler.dismiss(err.id)"
            class="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
            aria-label="Dismiss error">
            ✕
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    @keyframes slide-in {
      from { transform: translateX(110%); opacity: 0; }
      to   { transform: translateX(0);    opacity: 1; }
    }
    .animate-slide-in { animation: slide-in .25s ease-out; }
  `]
})
export class ErrorToastComponent {
  handler = inject(GlobalErrorHandler);

  visibleErrors = computed(() =>
    this.handler.errors().filter(e => !e.dismissed)
  );

  toastClass(type: string, status?: number): string {
    if (status === 401 || status === 403)
      return 'bg-amber-50 border-amber-200 text-amber-800';
    if (type === 'http' && status && status >= 500)
      return 'bg-red-50 border-red-200 text-red-800';
    if (type === 'http')
      return 'bg-yellow-50 border-yellow-200 text-yellow-800';
    if (type === 'chunk')
      return 'bg-blue-50 border-blue-200 text-blue-800';
    return 'bg-red-50 border-red-200 text-red-800';
  }

  toastIcon(type: string, status?: number): string {
    if (status === 401 || status === 403) return '🔒';
    if (status === 404) return '🔍';
    if (status === 413) return '📦';
    if (type === 'http') return '🌐';
    if (type === 'chunk') return '🔄';
    return '⚠️';
  }

  reload() { window.location.reload(); }
}
