/**
 * The page a host frames.
 *
 * It renders and dispatches; the conversation lives in `EmbedSession` and the
 * message rules in `HostChannel` (§3.3 — components hold no business logic).
 * What is left here is the four states a framed viewer can be in and the
 * controls the host's capabilities allow.
 *
 * There is no auth guard on this route and there must not be. §7: the viewer
 * holds no session, and a login redirect inside someone else's iframe is both
 * a broken integration and an invitation to type a password into a frame.
 */
import {
  ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ViewerStateService } from '../../../viewer-core/viewer-state.service';
import { EmbedSession } from './embed-session.service';
import { EmbedPageComponent } from './embed-page.component';
import { ProblemDetail } from './embed-protocol';

@Component({
  selector: 'app-embed-viewer',
  standalone: true,
  imports: [CommonModule, EmbedPageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="shell">
      @if (session.phase() === 'ready') {
        <div class="toolbar" role="toolbar" aria-label="Document tools">
          <span class="name">{{ session.documentName() }}</span>

          @if (session.canDo('markup:create')) {
            @for (tool of tools; track tool.id) {
              <button type="button"
                      [class.active]="state.activeTool() === tool.id"
                      [attr.aria-pressed]="state.activeTool() === tool.id"
                      (click)="state.activeTool.set(tool.id)">{{ tool.label }}</button>
            }
          }

          @if (session.canDo('document:sign')) {
            <button type="button" (click)="requestSignature()">Sign</button>
          }

          <span class="spacer"></span>
          <span class="page-count">
            Page {{ state.currentPage() }} of {{ state.totalPages() }}
          </span>
        </div>

        @if (notice()) {
          <p class="notice" role="status">{{ notice() }}</p>
        }

        <div class="pages">
          @for (page of pageNumbers(); track page) {
            <app-embed-page [pageNumber]="page" [zoom]="state.zoom()"
                            (shapeDrawn)="session.markupCreated($event)" />
          }
        </div>
      } @else if (session.phase() === 'failed') {
        <div class="state" role="alert">
          <h1>{{ session.problem()?.title }}</h1>
          <p>{{ session.problem()?.detail }}</p>
          @if (session.problem()?.traceId; as traceId) {
            <p class="trace">Reference: {{ traceId }}</p>
          }
        </div>
      } @else {
        <div class="state" role="status">
          <p>{{ session.phase() === 'loading' ? 'Opening the document…'
                                              : 'Waiting for the host application…' }}</p>
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; background: #eceef1; }
    .shell { display: flex; flex-direction: column; height: 100%; }
    .toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
               padding: 8px 12px; background: #fff; border-bottom: 1px solid #d3d8e0; }
    .toolbar button { min-height: 36px; padding: 6px 12px; font: inherit; cursor: pointer;
                      border: 1px solid #b9c0cb; border-radius: 5px; background: #fff; }
    .toolbar button.active { background: #14496b; color: #fff; border-color: #14496b; }
    .toolbar button:focus-visible, .state a:focus-visible {
      outline: 3px solid #14496b; outline-offset: 2px; }
    .name { font-weight: 600; }
    .spacer { flex: 1; }
    .page-count { color: #4a5361; font-size: 13px; }
    .notice { margin: 0; padding: 8px 12px; background: #fff8e1; border-bottom: 1px solid #e8d9a0;
              color: #573a08; font-size: 14px; }
    .pages { flex: 1; overflow: auto; padding: 16px; }
    .state { display: grid; place-content: center; gap: 8px; height: 100%;
             padding: 32px; text-align: center; color: #14181f; }
    .state h1 { font-size: 18px; margin: 0; }
    .state p { margin: 0; max-width: 52ch; color: #4a5361; }
    .trace { font-family: ui-monospace, monospace; font-size: 12px; }
  `],
})
export class EmbedViewerComponent implements OnInit, OnDestroy {

  readonly session = inject(EmbedSession);
  readonly state = inject(ViewerStateService);

  readonly notice = signal('');

  readonly tools = [
    { id: 'pan', label: 'Pan' },
    { id: 'rect', label: 'Box' },
    { id: 'cloud', label: 'Cloud' },
    { id: 'arrow', label: 'Arrow' },
  ] as const;

  readonly pageNumbers = computed(() =>
    Array.from({ length: this.state.totalPages() }, (_unused, index) => index + 1));

  ngOnInit(): void {
    // §2: `parentOrigin` is addressing. It is read from the URL because that
    // is the only channel available before the first message, and it is
    // validated rather than trusted — `frame-ancestors` is what decides who
    // may frame us, and that is a header, not a query parameter.
    const parentOrigin = new URLSearchParams(window.location.search).get('parentOrigin');
    this.session.start({
      self: window,
      parent: window.parent,
      parentOrigin: parentOrigin ?? '',
    });
  }

  ngOnDestroy(): void {
    this.session.stop();
  }

  /**
   * Ask the host to sign, and show what it says.
   *
   * The button rendered because the host granted `document:sign`, and the
   * host may still refuse — §6.1 says those two are allowed to disagree and
   * that a refusal is expected rather than an error. So a refusal shows as a
   * notice, not an alert.
   */
  async requestSignature(): Promise<void> {
    this.notice.set('Asking the host to sign…');
    const outcome = await this.session.requestOperation('document.sign');
    this.notice.set(this.describe(outcome.status, outcome.problem));
  }

  private describe(status: string, problem?: ProblemDetail): string {
    if (status === 'applied') return 'The host signed the document.';
    return problem?.detail ?? (status === 'refused'
      ? 'The host did not permit that.'
      : 'The host could not complete that.');
  }
}
