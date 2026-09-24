import { Component, inject, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GlobalErrorHandler } from '../../core/handlers/global-error.handler';

@Component({
  selector: 'app-error-toast',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!--
      A live region, present from first render rather than created with the
      first error. A region inserted at the same moment as its content is
      not announced by most screen readers, so a toast that appeared only
      when something failed was read by nobody — which is to say the one
      message a reader could not afford to miss was the one never spoken
      (§1A.2). It is assertive because these are errors, and non-atomic
      so a second failure announces itself rather than re-reading the first.

      aria-live rather than the alert role: the role carries an implicit
      atomic announcement, which would make every new failure re-read the
      toasts already on screen.
    -->
    <div class="fixed bottom-4 end-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none"
         aria-live="assertive" aria-atomic="false">
      @for (err of visibleErrors(); track err.id) {
        <div
          class="pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-lg shadow-lg border text-sm animate-slide-in"
          [class]="toastClass(err.type, err.status)">

          <!--
            Decorative: it restates the severity the sentence already
            carries, and a screen reader announcing "warning sign" ahead of
            every message is noise, not information. It stays visible as the
            non-colour cue severity needs (§1A.2).
          -->
          <span class="text-base flex-shrink-0 mt-0.5" aria-hidden="true">{{ toastIcon(err.type, err.status) }}</span>

          <!-- Content -->
          <div class="flex-1 min-w-0">
            <div class="font-semibold">{{ err.message }}</div>
            @if (err.detail && err.type !== 'runtime') {
              <div class="text-xs opacity-75 mt-0.5 truncate">{{ err.detail }}</div>
            }
            @if (err.type === 'chunk') {
              <button (click)="reload()"
                i18n="Offered when a lazily-loaded chunk failed, usually because the application was redeployed mid-session@@errorToast.refreshPage"
                class="mt-1.5 text-xs underline hover:no-underline min-h-6 px-1">
                Refresh page
              </button>
            }
          </div>

          <!-- Dismiss -->
          <!--
            The minimum width and height below are WCAG 2.2 SC 2.5.8's
            24×24 CSS px floor. A bare ✕ glyph sits well under it, which
            makes the only way to dismiss an error a target some people
            cannot reliably hit.
          -->
          <button (click)="handler.dismiss(err.id)"
            class="flex-shrink-0 min-w-6 min-h-6 flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity"
            i18n-aria-label="@@errorToast.dismiss"
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
