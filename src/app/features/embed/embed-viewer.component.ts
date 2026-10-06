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
import { HostChannel } from './host-channel.service';
import { EmbedPageComponent } from './embed-page.component';
import { ProblemDetail } from './embed-protocol';

@Component({
  selector: 'app-embed-viewer',
  standalone: true,
  imports: [CommonModule, EmbedPageComponent],
  // One set per framed viewer, matching ViewerShellComponent. ViewerStateService
  // is not a root service by design — two viewers on a page must not share a
  // zoom level or a page number — and EmbedSession and HostChannel hold one
  // host conversation each, so all three belong to this component's lifetime.
  //
  // Without this the route threw NG0201 on load and rendered nothing. The unit
  // tests did not catch it: they build their own injector listing every
  // service, which exercises the code and not the wiring.
  providers: [ViewerStateService, HostChannel, EmbedSession],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="shell">
      @if (session.phase() === 'ready') {
        <!--
          role="group", not role="toolbar". The toolbar role promises arrow-key
          navigation over a single tab stop, and this row does not implement it —
          each button is its own tab stop. A row of named buttons is already
          conformant without the role, and declaring it without the behaviour
          leaves a screen-reader user pressing arrows that do nothing (§1A.2:
          bad ARIA is worse than none). The full viewer's command bar carries the
          same reasoning and the same comment.
        -->
        <div class="toolbar" role="group"
             i18n-aria-label="@@embedViewer.toolbarLabel" aria-label="Document tools">
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
            <button type="button" i18n="@@embedViewer.sign"
                    (click)="requestSignature()">Sign</button>
          }

          <span class="spacer"></span>
          <span class="page-count"
                i18n="Current position in the document, e.g. Page 3 of 12@@embedViewer.pageCount">
            Page {{ state.currentPage() }} of {{ state.totalPages() }}
          </span>
        </div>

        @if (notice()) {
          <p class="notice" role="status">{{ notice() }}</p>
        }

        <div class="pages">
          @for (page of pageNumbers(); track page) {
            <app-embed-page [pageNumber]="page" [zoom]="state.zoom()"
                            (shapeDrawn)="session.markupCreated($event)"
                            (pageRendered)="session.pageRendered(
                              $event.page, $event.widthPx, $event.heightPx)" />
          }
        </div>
      } @else if (session.phase() === 'failed') {
        <div class="state" role="alert">
          <h1>{{ session.problem()?.title }}</h1>
          <p>{{ session.problem()?.detail }}</p>
          @if (session.problem()?.traceId; as traceId) {
            <p class="trace">{{ referenceLabel(traceId) }}</p>
          }
        </div>
      } @else {
        <div class="state" role="status">
          <p>{{ session.phase() === 'loading' ? openingLabel : waitingLabel }}</p>
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
  /** The identifier a user quotes to support (§1.4). */
  referenceLabel(traceId: string): string {
    return $localize`:Precedes the identifier a user can quote to support when reporting a fault@@embed.traceReference:Reference: ${traceId}:traceId:`;
  }


  readonly session = inject(EmbedSession);
  readonly state = inject(ViewerStateService);

  readonly notice = signal('');

  /**
   * Markup tools offered in the embedded toolbar.
   *
   * <p>`$localize` rather than plain strings: a label in a lookup table is
   * invisible to the template markup guard, which is exactly where
   * untranslated text hides until someone opens the product in another
   * language.
   *
   * <p>Their IDs are `embedTool.*` rather than the full viewer's
   * `markupTool.*` because the embedded toolbar is narrower and abbreviates —
   * "Box" where the full rail says "Rectangle". Sharing an ID between two
   * different source strings makes the extractor pick one arbitrarily, so
   * one of the two ships the wrong words in every translated language.
   */
  readonly tools = [
    { id: 'pan', label: $localize`:Embedded-viewer markup tool that moves the page rather than drawing. Short — the embedded toolbar is narrower than the full one.@@embedTool.pan:Pan` },
    { id: 'rect', label: $localize`:Embedded-viewer markup tool that draws a rectangle. Short — the embedded toolbar is narrower than the full one.@@embedTool.rect:Box` },
    { id: 'cloud', label: $localize`:Embedded-viewer markup tool that draws a revision cloud, the scalloped outline used on drawings to ring a change. Short — the embedded toolbar is narrower than the full one.@@embedTool.cloud:Cloud` },
    { id: 'arrow', label: $localize`:Embedded-viewer markup tool that draws an arrow. Short — the embedded toolbar is narrower than the full one.@@embedTool.arrow:Arrow` },
  ] as const;

  /**
   * The sentences this component says, which were plain string literals.
   *
   * <p>Three were in the template as expression operands and three in
   * `describe()`, so none of them was reachable by a sweep of the markup — and
   * this is the component a host frames inside their own product, which makes it
   * the most visible place in the product for untranslated English to sit. §1.4
   * allows none of them.
   */
  readonly openingLabel = $localize`:Shown while the document is being fetched inside a framed viewer@@embedViewer.opening:Opening the document…`;
  readonly waitingLabel = $localize`:Shown while the framed viewer waits for the host application's first message@@embedViewer.waiting:Waiting for the host application…`;
  readonly askingToSignLabel = $localize`:Shown while the framed viewer waits for the host to sign@@embedViewer.askingToSign:Asking the host to sign…`;
  readonly signedLabel = $localize`:Shown when the host signed the document@@embedViewer.signed:The host signed the document.`;
  readonly refusedLabel = $localize`:Shown when the host declined a request it was entitled to decline@@embedViewer.refused:The host did not permit that.`;
  readonly couldNotCompleteLabel = $localize`:Shown when the host could not finish a request for a reason it did not give@@embedViewer.couldNotComplete:The host could not complete that.`;

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
    this.notice.set(this.askingToSignLabel);
    const outcome = await this.session.requestOperation('document.sign');
    this.notice.set(this.describe(outcome.status, outcome.problem));
  }

  private describe(status: string, problem?: ProblemDetail): string {
    if (status === 'applied') return this.signedLabel;
    // The host's own reason first, when it gave one: it knows why it refused and
    // we do not. §6.1 treats a refusal as expected rather than as a fault, so
    // neither branch reads as an error.
    return problem?.detail ?? (status === 'refused'
      ? this.refusedLabel
      : this.couldNotCompleteLabel);
  }
}
