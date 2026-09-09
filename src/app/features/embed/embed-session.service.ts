/**
 * The embedded viewer's session: what the host said, and what we tell it back.
 *
 * This is where the protocol meets the viewer's own state. It holds no DOM and
 * renders nothing, so the whole conversation — handshake, commands, markup
 * round trip, operation refusals — is testable without a browser.
 *
 * The rule it exists to keep is §7 of the protocol: **nothing the host sends
 * is ever the basis of a security decision.** `capabilities` reaches exactly
 * one place, `canDo()`, and that is consulted only to decide which controls
 * render. Every operation is authorised by the host when it is requested.
 */
import { Injectable, computed, inject, signal } from '@angular/core';
import { ViewerStateService } from '../../../viewer-core/viewer-state.service';
import { MarkupEngineService } from '../../../viewer-core/markup-engine.service';
import { PdfEngineService } from '../../../viewer-core/pdf-engine.service';
import type { ShapeData } from '../../../viewer-core/viewer-state.service';
import { HostChannel, INIT_TIMEOUT_MS } from './host-channel.service';
import {
  DocumentDescriptor, Envelope, Identity, Markup, ProblemDetail,
  isDocumentDescriptor, isFetchableDocumentUrl, isIdentity, isMarkup,
  isOperationStatus, problem,
} from './embed-protocol';

export type SessionPhase = 'awaiting-host' | 'loading' | 'ready' | 'failed';

/** Media types the browser renders on its own, with no conversion service. */
const DIRECTLY_RENDERABLE = new Set(['application/pdf']);

@Injectable({ providedIn: 'root' })
export class EmbedSession {

  private readonly channel = inject(HostChannel);
  private readonly viewerState = inject(ViewerStateService);
  private readonly markupEngine = inject(MarkupEngineService);
  private readonly pdfEngine = inject(PdfEngineService);

  readonly phase = signal<SessionPhase>('awaiting-host');
  readonly problem = signal<ProblemDetail | null>(null);
  readonly documentName = signal('');
  readonly identity = signal<Identity>({});

  /** The label to show on markup as it is drawn. Presentation only (§7). */
  readonly authorLabel = computed(() => this.identity().displayName ?? 'Unattributed');

  private externalId: string | undefined;
  private initTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribe: (() => void) | null = null;
  private readonly pendingOperations = new Map<string, (result: OperationOutcome) => void>();

  /**
   * Whether to render a control.
   *
   * Never whether to *permit* an action — §7. An empty capability list is a
   * legitimate read-only deployment, not a misconfiguration, so the absence of
   * identity hides controls rather than failing.
   */
  canDo(capability: string): boolean {
    return this.identity().capabilities?.includes(capability) ?? false;
  }

  start(configuration: Parameters<HostChannel['connect']>[0]): boolean {
    this.unsubscribe = this.channel.subscribe((message) => this.handle(message));
    const connected = this.channel.connect(configuration);

    if (!connected) {
      this.fail(problem(
        'not-embedded', 'This page is meant to be embedded', 400,
        'Open it inside a host application, with a parentOrigin query parameter ' +
        'naming that application\'s exact origin.',
      ));
      return false;
    }

    // §5: a permanently blank frame is indistinguishable from a broken
    // deployment, so say which one it is.
    this.initTimer = setTimeout(() => {
      if (this.phase() === 'awaiting-host') {
        this.fail(problem(
          'host-did-not-initialise', 'The host application did not configure the viewer', 408,
          'No host.init message arrived within 30 seconds. The host page must reply ' +
          'to viewer.ready with a document to open.',
        ));
      }
    }, INIT_TIMEOUT_MS);
    return true;
  }

  stop(): void {
    if (this.initTimer) clearTimeout(this.initTimer);
    this.initTimer = null;
    this.unsubscribe?.();
    this.channel.disconnect();
  }

  // ── Inbound ───────────────────────────────────────────────────────────────

  private handle(message: Envelope): void {
    switch (message.type) {
      case 'host.init':            return this.initialise(message);
      case 'host.loadDocument':    { void this.openDocument(message.payload['document']); return; }
      case 'host.setIdentity':     return this.setIdentity(message.payload['identity']);
      case 'host.loadMarkup':      return this.loadMarkup(message.payload['markup']);
      case 'host.command':         return this.runCommand(message.payload);
      case 'host.operationResult': return this.completeOperation(message);
      // §10: a host built against a later v1 may send a type this build does
      // not know. Ignoring it is the compatibility promise, not a failure.
      default: return;
    }
  }

  private initialise(message: Envelope): void {
    if (this.initTimer) clearTimeout(this.initTimer);
    this.setIdentity(message.payload['identity']);
    this.applyUiPreferences(message.payload['ui']);
    void this.openDocument(message.payload['document']);
  }

  private setIdentity(candidate: unknown): void {
    if (candidate === undefined) return;
    // A malformed identity is not fatal: §7 says a viewer with no identity
    // still works, so fall back to that rather than refusing to render.
    this.identity.set(isIdentity(candidate) ? candidate : {});
  }

  private applyUiPreferences(candidate: unknown): void {
    if (typeof candidate !== 'object' || candidate === null) return;
    const tools = (candidate as Record<string, unknown>)['tools'];
    if (Array.isArray(tools) && tools.every((tool) => typeof tool === 'string')) {
      this.allowedTools.set(tools as string[]);
    }
  }

  /** Which tools the host asked for; empty means all of them. */
  readonly allowedTools = signal<string[]>([]);

  private async openDocument(candidate: unknown): Promise<void> {
    if (!isDocumentDescriptor(candidate)) {
      return this.fail(problem(
        'invalid-document', 'The host sent a document the viewer cannot read', 422,
        'host.init needs a document with url, mediaType and displayName.',
      ));
    }
    if (!isFetchableDocumentUrl(candidate.url)) {
      return this.fail(problem(
        'unsupported-scheme', 'That document URL cannot be opened', 400,
        'Document URLs must be http or https.',
      ));
    }

    this.documentName.set(candidate.displayName);
    this.externalId = candidate.externalId;
    this.phase.set('loading');
    this.problem.set(null);

    if (!DIRECTLY_RENDERABLE.has(candidate.mediaType)) {
      return this.failUnconverted(candidate);
    }

    try {
      const pdf = await this.pdfEngine.openDocument(candidate.url);
      this.viewerState.pdfDoc.set(pdf);
      this.viewerState.totalPages.set(pdf.numPages);
      this.viewerState.currentPage.set(1);
      this.phase.set('ready');
      this.channel.send('viewer.loaded', {
        pageCount: pdf.numPages,
        mediaType: candidate.mediaType,
        renderedBy: 'pdf.js',
        externalId: this.externalId,
      });
    } catch {
      this.fail(problem(
        'document-unreadable', 'The document could not be opened', 502,
        `The viewer fetched ${candidate.displayName} but could not read it. Check that ` +
        'the URL is still valid and that its response allows this origin to read it.',
      ));
    }
  }

  /**
   * The honest answer for a format the browser cannot render on its own.
   *
   * IFC and Office are converted server-side before the viewer sees geometry
   * or pages (§6.7.4, §5.13.10). An embedded deployment that has no conversion
   * service reachable cannot open them, and saying so beats an empty frame.
   */
  private failUnconverted(document: DocumentDescriptor): void {
    this.fail(problem(
      'conversion-required', 'This format needs the conversion service', 415,
      `${document.displayName} is ${document.mediaType}, which the browser does not ` +
      'render on its own. The viewer deployment converts it server-side; this build ' +
      'has no conversion service configured, so only PDF opens directly.',
    ));
  }

  private loadMarkup(candidate: unknown): void {
    if (!Array.isArray(candidate)) return;
    const shapes = candidate
      .filter(isMarkup)
      .flatMap((markup) => this.toShapes(markup));
    this.viewerState.shapes.set(shapes);
  }

  private runCommand(payload: Record<string, unknown>): void {
    const command = payload['command'];
    const args = (payload['arguments'] ?? {}) as Record<string, unknown>;

    if (command === 'goToPage' && typeof args['page'] === 'number') {
      const page = Math.trunc(args['page']);
      const total = this.viewerState.totalPages();
      if (page >= 1 && page <= total) this.viewerState.currentPage.set(page);
      return;
    }
    if (command === 'setZoom' && typeof args['zoom'] === 'number') {
      // Clamped rather than trusted: a host sending 0 or 1e9 would otherwise
      // render nothing or exhaust memory, and neither is the host's to decide.
      this.viewerState.zoom.set(Math.min(8, Math.max(0.1, args['zoom'])));
      return;
    }
    if (command === 'setTool' && typeof args['tool'] === 'string') {
      this.viewerState.activeTool.set(args['tool'] as ShapeData['tool']);
      return;
    }
    if (command === 'search' && typeof args['query'] === 'string') {
      this.viewerState.searchQuery.set(args['query']);
    }
  }

  private completeOperation(message: Envelope): void {
    const replyTo = message.replyTo;
    if (!replyTo) return;
    const resolve = this.pendingOperations.get(replyTo);
    if (!resolve) return;
    this.pendingOperations.delete(replyTo);

    const status = message.payload['status'];
    resolve({
      status: isOperationStatus(status) ? status : 'failed',
      problem: message.payload['problem'] as ProblemDetail | undefined,
    });
  }

  // ── Outbound ──────────────────────────────────────────────────────────────

  markupCreated(shape: ShapeData): void {
    this.channel.send('viewer.markupCreated', { markup: this.toMarkup(shape) });
  }

  markupUpdated(shape: ShapeData): void {
    this.channel.send('viewer.markupUpdated', { markup: this.toMarkup(shape) });
  }

  markupDeleted(markupId: string): void {
    this.channel.send('viewer.markupDeleted', { markupId, externalId: this.externalId });
  }

  viewChanged(): void {
    this.channel.send('viewer.viewChanged', {
      page: this.viewerState.currentPage(),
      zoom: this.viewerState.zoom(),
      rotation: 0,
      externalId: this.externalId,
    });
  }

  selectionChanged(markupId: string | null): void {
    this.channel.send('viewer.selectionChanged', { markupId, externalId: this.externalId });
  }

  /**
   * Ask the host to do something only it can do (§6.1).
   *
   * Resolves when the host replies. It may never reply — a host that ignores
   * the message leaves this pending, which is the honest representation of
   * what happened; the caller shows a spinner until the user cancels rather
   * than the viewer inventing a timeout the protocol does not define.
   */
  requestOperation(operation: string, args: Record<string, unknown> = {}):
    Promise<OperationOutcome> {
    const id = this.channel.send('viewer.operationRequest', {
      operation, arguments: args, externalId: this.externalId,
    });
    return new Promise((resolve) => this.pendingOperations.set(id, resolve));
  }

  // ── Translation ───────────────────────────────────────────────────────────
  //
  // The viewer's ShapeData and the protocol's Markup are deliberately
  // different shapes. `models.ts` flagged `documentId: number` as a wire
  // decision to revisit once the integration contract existed; it does now,
  // and the contract says opaque string ids, an externalId that is the host's,
  // and **no author** — the host stamps that from its own session (§6.2).

  private toMarkup(shape: ShapeData): Markup {
    return {
      markupId: shape.id,
      externalId: this.externalId,
      page: shape.pageNumber,
      type: shape.tool.toUpperCase(),
      shapeData: this.markupEngine.shapesToJson([shape]),
      comment: shape.text ?? '',
      createdAt: shape.createdAt ?? new Date().toISOString(),
    };
  }

  private toShapes(markup: Markup): ShapeData[] {
    // Host-supplied and therefore untrusted, even though we encoded it: it has
    // been through the host's storage since, and a parse failure must drop one
    // markup rather than lose the page.
    try {
      return this.markupEngine.parseShapesJson(markup.shapeData)
        .map((shape) => ({ ...shape, id: markup.markupId, pageNumber: markup.page }));
    } catch {
      return [];
    }
  }

  private fail(detail: ProblemDetail): void {
    this.problem.set(detail);
    this.phase.set('failed');
    this.channel.send('viewer.error', { problem: detail });
  }
}

export interface OperationOutcome {
  status: 'applied' | 'refused' | 'failed';
  problem?: ProblemDetail;
}
