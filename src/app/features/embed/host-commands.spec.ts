/**
 * What the viewer does when the host tells it to do something.
 *
 * <p>`lifecycle-events.spec.ts` covers the document lifecycle and
 * `protocol-conversation.spec.ts` covers the wire agreement. This covers the
 * half neither touched: `host.command`, the operation round trip, the
 * outbound notifications, and — the reason this file matters most — what the
 * viewer does with numbers the host supplies.
 *
 * <p>§7 of the protocol is the rule under test throughout: nothing the host
 * sends is ever the basis of a security decision, and `capabilities` decides
 * only which controls render. A host is not hostile, but it is a separate
 * program written by somebody else, and a page number of -1 or a zoom of 1e9
 * arrives the same way a good one does.
 *
 * <p>The harness matches `lifecycle-events.spec.ts`: an explicit injector
 * rather than TestBed, real services throughout, and only the window pair
 * substituted — which is what `HostChannel` takes as an argument for exactly
 * this reason. Messages are delivered the way a browser would deliver them,
 * so the channel's origin and source checks run on every one.
 */
import { Injector, runInInjectionContext } from '@angular/core';
import { describe, it, expect, vi, afterEach } from 'vitest';

import { EmbedSession } from './embed-session.service';
import { HostChannel } from './host-channel.service';
import { MarkupWireFormat } from './markup-wire-format';
import { ViewerStateService, ShapeData } from '../../../viewer-core/viewer-state.service';
import { MarkupEngineService } from '../../../viewer-core/markup-engine.service';
import { PdfEngineService } from '../../../viewer-core/pdf-engine.service';
import { PROTOCOL, Envelope } from './embed-protocol';

const HOST_ORIGIN = 'https://host.example';

/** A format the browser cannot render, so no case here needs the network. */
const NEEDS_CONVERSION =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function office(externalId = 'doc-a') {
  return {
    url: 'https://files.host.example/doc/1',
    mediaType: NEEDS_CONVERSION,
    displayName: `${externalId}.docx`,
    externalId,
  };
}

function startSession() {
  const sent: Envelope[] = [];
  const listeners: Array<(event: MessageEvent) => void> = [];

  const hostWindow = { postMessage: (data: unknown) => sent.push(data as Envelope) };
  const viewerWindow = {
    addEventListener: (_type: string, fn: (event: MessageEvent) => void) => listeners.push(fn),
    removeEventListener: (_type: string, fn: (event: MessageEvent) => void) => {
      const at = listeners.indexOf(fn);
      if (at >= 0) listeners.splice(at, 1);
    },
  };

  const injector = Injector.create({ providers: [
    { provide: HostChannel, useFactory: () => new HostChannel(), deps: [] },
    { provide: MarkupEngineService, useFactory: () => new MarkupEngineService(), deps: [] },
    { provide: ViewerStateService, useFactory: () => new ViewerStateService(), deps: [] },
    { provide: PdfEngineService, useFactory: () => new PdfEngineService(), deps: [] },
    { provide: MarkupWireFormat, useFactory: () => new MarkupWireFormat(), deps: [] },
    { provide: EmbedSession, useFactory: () => new EmbedSession(), deps: [] },
  ] });

  const session = runInInjectionContext(injector, () => injector.get(EmbedSession));
  const state = injector.get(ViewerStateService);
  session.start({ self: viewerWindow, parent: hostWindow, parentOrigin: HOST_ORIGIN });

  let delivered = 0;
  const deliver = (type: string, payload: Record<string, unknown>, replyTo?: string) => {
    delivered += 1;
    for (const listener of [...listeners]) {
      listener({
        origin: HOST_ORIGIN,
        source: hostWindow,
        data: {
          protocol: PROTOCOL, type, id: `host-${delivered}`, payload,
          ...(replyTo ? { replyTo } : {}),
        },
      } as unknown as MessageEvent);
    }
  };

  const command = (name: string, args: Record<string, unknown> = {}) =>
    deliver('host.command', { command: name, arguments: args });

  const typesSent = () => sent.map((message) => message.type);
  const lastOf = (type: string) => [...sent].reverse().find((m) => m.type === type);

  return { session, state, sent, deliver, command, typesSent, lastOf };
}

describe('commands the host sends', () => {

  describe('moving to a page', () => {
    it('goes to the page asked for', () => {
      const { state, command } = startSession();
      state.totalPages.set(10);

      command('goToPage', { page: 4 });

      expect(state.currentPage()).toBe(4);
    });

    it('refuses a page past the end of the document', () => {
      // Not the host's call to make. Setting it anyway renders a blank
      // frame and leaves the viewer with a page number it cannot draw.
      const { state, command } = startSession();
      state.totalPages.set(10);

      command('goToPage', { page: 11 });

      expect(state.currentPage()).toBe(1);
    });

    it('refuses page zero', () => {
      const { state, command } = startSession();
      state.totalPages.set(10);

      command('goToPage', { page: 0 });

      expect(state.currentPage()).toBe(1);
    });

    it('refuses a negative page', () => {
      const { state, command } = startSession();
      state.totalPages.set(10);

      command('goToPage', { page: -3 });

      expect(state.currentPage()).toBe(1);
    });

    it('truncates a fractional page rather than holding one', () => {
      const { state, command } = startSession();
      state.totalPages.set(10);

      command('goToPage', { page: 3.9 });

      expect(state.currentPage()).toBe(3);
    });

    it('ignores a page that is not a number at all', () => {
      const { state, command } = startSession();
      state.totalPages.set(10);

      command('goToPage', { page: '4' });

      expect(state.currentPage()).toBe(1);
    });

    it('refuses any page before the document has loaded', () => {
      // totalPages is 0 until a document opens, so every page is past the
      // end — which is the right answer, not an edge case to special-case.
      const { state, command } = startSession();

      command('goToPage', { page: 1 });

      expect(state.currentPage()).toBe(1);
    });
  });

  describe('setting the zoom', () => {
    it('applies a reasonable zoom', () => {
      const { state, command } = startSession();

      command('setZoom', { zoom: 2 });

      expect(state.zoom()).toBe(2);
    });

    it('clamps a zoom that would exhaust memory', () => {
      // A page rendered at 1e9 allocates a canvas nothing can hold. The
      // host does not get to decide that.
      const { state, command } = startSession();

      command('setZoom', { zoom: 1e9 });

      expect(state.zoom()).toBe(8);
    });

    it('clamps a zoom that would render nothing', () => {
      const { state, command } = startSession();

      command('setZoom', { zoom: 0 });

      expect(state.zoom()).toBe(0.1);
    });

    it('clamps a negative zoom', () => {
      const { state, command } = startSession();

      command('setZoom', { zoom: -4 });

      expect(state.zoom()).toBe(0.1);
    });

    it('ignores a zoom that is not a number', () => {
      const { state, command } = startSession();

      command('setZoom', { zoom: 'big' });

      expect(state.zoom()).toBe(1);
    });
  });

  describe('the other two commands', () => {
    it('selects the tool the host asked for', () => {
      const { state, command } = startSession();

      command('setTool', { tool: 'rectangle' });

      expect(state.activeTool()).toBe('rectangle');
    });

    it('ignores a tool that is not a string', () => {
      const { state, command } = startSession();

      command('setTool', { tool: 7 });

      expect(state.activeTool()).toBe('pan');
    });

    it('runs a search the host asked for', () => {
      const { state, command } = startSession();

      command('search', { query: 'fire door' });

      expect(state.searchQuery()).toBe('fire door');
    });

    it('accepts an empty search, which clears the previous one', () => {
      const { state, command } = startSession();
      command('search', { query: 'fire door' });

      command('search', { query: '' });

      expect(state.searchQuery()).toBe('');
    });
  });

  describe('commands it cannot act on', () => {
    it('ignores a command it does not know', () => {
      // §10: a host built against a later v1 may send one. Ignoring it is
      // the compatibility promise, not a failure — it must not blank the
      // frame with viewer.error.
      const { command, typesSent } = startSession();

      command('summonHelicopter', { count: 2 });

      expect(typesSent()).toEqual(['viewer.ready']);
    });

    it('ignores a command sent with no arguments at all', () => {
      const { state, deliver } = startSession();

      deliver('host.command', { command: 'goToPage' });

      expect(state.currentPage()).toBe(1);
    });

    it('ignores a message type it does not know', () => {
      const { deliver, typesSent } = startSession();

      deliver('host.summonHelicopter', {});

      expect(typesSent()).toEqual(['viewer.ready']);
    });
  });
});

describe('who the host says the reader is', () => {

  it('reports no capability before the host says anything', () => {
    const { session } = startSession();

    expect(session.canDo('markup')).toBe(false);
  });

  it('reports a capability the host granted', () => {
    const { session, deliver } = startSession();

    deliver('host.setIdentity', { identity: { displayName: 'Ada', capabilities: ['markup'] } });

    expect(session.canDo('markup')).toBe(true);
  });

  it('reports no capability the host did not grant', () => {
    const { session, deliver } = startSession();

    deliver('host.setIdentity', { identity: { capabilities: ['markup'] } });

    expect(session.canDo('redact')).toBe(false);
  });

  it('treats an empty capability list as a read-only deployment', () => {
    // §7 again: no capabilities is a legitimate configuration, not a
    // misconfiguration to report.
    const { session, deliver, typesSent } = startSession();

    deliver('host.setIdentity', { identity: { capabilities: [] } });

    expect(session.canDo('markup')).toBe(false);
    expect(typesSent()).toEqual(['viewer.ready']);
  });

  it('falls back to an anonymous identity when the host sent nonsense', () => {
    // A malformed identity is not fatal — a viewer with no identity still
    // works, so refusing to render would be the worse answer.
    const { session, deliver } = startSession();
    deliver('host.setIdentity', { identity: { displayName: 'Ada', capabilities: ['markup'] } });

    deliver('host.setIdentity', { identity: 'not an identity' });

    expect(session.canDo('markup')).toBe(false);
    expect(session.authorLabel()).toBe('Unattributed');
  });

  it('keeps the identity it had when the host sent none', () => {
    const { session, deliver } = startSession();
    deliver('host.setIdentity', { identity: { displayName: 'Ada', capabilities: ['markup'] } });

    deliver('host.setIdentity', {});

    expect(session.authorLabel()).toBe('Ada');
  });

  it('labels markup with the name the host gave', () => {
    const { session, deliver } = startSession();

    deliver('host.setIdentity', { identity: { displayName: 'Ada Okafor' } });

    expect(session.authorLabel()).toBe('Ada Okafor');
  });

  it('labels markup as unattributed when no name was given', () => {
    const { session, deliver } = startSession();

    deliver('host.setIdentity', { identity: { capabilities: ['markup'] } });

    expect(session.authorLabel()).toBe('Unattributed');
  });
});

describe('the toolbar the host asked for', () => {

  it('offers everything when the host expressed no preference', () => {
    const { session } = startSession();

    expect(session.allowedTools()).toEqual([]);
  });

  it('narrows the toolbar to the tools named', () => {
    const { session, deliver } = startSession();

    deliver('host.init', { ui: { tools: ['pan', 'rectangle'] }, document: office() });

    expect(session.allowedTools()).toEqual(['pan', 'rectangle']);
  });

  it('ignores a tool list with something that is not a tool name in it', () => {
    // Half-applying it would silently drop tools the host asked for, which
    // is worse than ignoring a list it cannot read.
    const { session, deliver } = startSession();

    deliver('host.init', { ui: { tools: ['pan', 42] }, document: office() });

    expect(session.allowedTools()).toEqual([]);
  });

  it('ignores a ui block that is not an object', () => {
    const { session, deliver } = startSession();

    deliver('host.init', { ui: 'compact', document: office() });

    expect(session.allowedTools()).toEqual([]);
  });

  it('ignores a ui block with no tools in it', () => {
    const { session, deliver } = startSession();

    deliver('host.init', { ui: { theme: 'dark' }, document: office() });

    expect(session.allowedTools()).toEqual([]);
  });
});

describe('asking the host to do something only it can do', () => {

  function shape(id: string): ShapeData {
    return {
      id, tool: 'rectangle', pageNumber: 1,
      points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      color: '#ff0000', strokeWidth: 2,
    } as unknown as ShapeData;
  }

  it('sends the request to the host', () => {
    const { session, lastOf } = startSession();

    void session.requestOperation('redact', { pages: [1] });

    expect(lastOf('viewer.operationRequest')?.payload).toMatchObject({
      operation: 'redact',
      arguments: { pages: [1] },
    });
  });

  it('resolves with the outcome the host reported', async () => {
    const { session, deliver, lastOf } = startSession();
    const outcome = session.requestOperation('redact');
    const requestId = lastOf('viewer.operationRequest')!.id;

    deliver('host.operationResult', { status: 'applied' }, requestId);

    await expect(outcome).resolves.toMatchObject({ status: 'applied' });
  });

  it('carries the host’s reason for a refusal', async () => {
    const { session, deliver, lastOf } = startSession();
    const outcome = session.requestOperation('redact');
    const requestId = lastOf('viewer.operationRequest')!.id;

    deliver('host.operationResult', {
      status: 'refused',
      problem: { title: 'Not permitted on a published revision' },
    }, requestId);

    await expect(outcome).resolves.toMatchObject({
      status: 'refused',
      problem: { title: 'Not permitted on a published revision' },
    });
  });

  it('treats an unrecognised status as a failure, not a success', async () => {
    // The direction that matters: a host replying with a status this build
    // does not know must not be read as "applied", which would tell the
    // reader their redaction landed.
    const { session, deliver, lastOf } = startSession();
    const outcome = session.requestOperation('redact');
    const requestId = lastOf('viewer.operationRequest')!.id;

    deliver('host.operationResult', { status: 'partially-maybe' }, requestId);

    await expect(outcome).resolves.toMatchObject({ status: 'failed' });
  });

  it('ignores a result that names no request', () => {
    const { deliver } = startSession();

    expect(() => deliver('host.operationResult', { status: 'applied' })).not.toThrow();
  });

  it('ignores a result for a request it never made', () => {
    const { deliver } = startSession();

    expect(() =>
      deliver('host.operationResult', { status: 'applied' }, 'never-sent')
    ).not.toThrow();
  });

  it('answers each request once, and only the one it was for', async () => {
    const { session, deliver, lastOf, sent } = startSession();
    const first = session.requestOperation('redact');
    const firstId = lastOf('viewer.operationRequest')!.id;
    const second = session.requestOperation('sign');
    const secondId = sent.filter((m) => m.type === 'viewer.operationRequest')[1]!.id;

    deliver('host.operationResult', { status: 'refused' }, secondId);
    deliver('host.operationResult', { status: 'applied' }, firstId);

    await expect(first).resolves.toMatchObject({ status: 'applied' });
    await expect(second).resolves.toMatchObject({ status: 'refused' });
  });

  it('does not answer a request twice', async () => {
    // The host replying twice to the same id must not resolve a promise
    // that has already settled with a different answer.
    const { session, deliver, lastOf } = startSession();
    const outcome = session.requestOperation('redact');
    const requestId = lastOf('viewer.operationRequest')!.id;

    deliver('host.operationResult', { status: 'applied' }, requestId);
    deliver('host.operationResult', { status: 'failed' }, requestId);

    await expect(outcome).resolves.toMatchObject({ status: 'applied' });
  });

  describe('telling the host what the reader did', () => {
    it('reports markup drawn', () => {
      const { session, lastOf } = startSession();

      session.markupCreated(shape('m-1'));

      expect(lastOf('viewer.markupCreated')).toBeDefined();
    });

    it('reports markup changed', () => {
      const { session, lastOf } = startSession();

      session.markupUpdated(shape('m-1'));

      expect(lastOf('viewer.markupUpdated')).toBeDefined();
    });

    it('reports markup removed, by id', () => {
      const { session, lastOf } = startSession();

      session.markupDeleted('m-1');

      expect(lastOf('viewer.markupDeleted')?.payload).toMatchObject({ markupId: 'm-1' });
    });

    it('reports where the reader navigated to', () => {
      const { session, state, lastOf } = startSession();
      state.totalPages.set(10);
      state.currentPage.set(6);
      state.zoom.set(1.5);

      session.viewChanged();

      expect(lastOf('viewer.viewChanged')?.payload).toMatchObject({ page: 6, zoom: 1.5 });
    });

    it('reports a selection, and reports clearing one', () => {
      const { session, lastOf } = startSession();

      session.selectionChanged('m-2');
      expect(lastOf('viewer.selectionChanged')?.payload).toMatchObject({ markupId: 'm-2' });

      session.selectionChanged(null);
      expect(lastOf('viewer.selectionChanged')?.payload).toMatchObject({ markupId: null });
    });
  });
});

describe('a host that never configures the viewer', () => {
  afterEach(() => vi.useRealTimers());

  it('says so rather than leaving a blank frame', () => {
    // §5. A permanently empty iframe is indistinguishable from a broken
    // deployment, and the integrator is the one who has to tell them apart.
    vi.useFakeTimers();
    const { lastOf } = startSession();

    vi.advanceTimersByTime(31_000);

    const reported = lastOf('viewer.error')?.payload['problem'] as { type: string };
    expect(reported.type).toContain('host-did-not-initialise');
  });

  it('stays quiet when the host did configure it in time', () => {
    vi.useFakeTimers();
    const { deliver, sent } = startSession();

    deliver('host.init', { document: office() });
    vi.advanceTimersByTime(31_000);

    const timeouts = sent.filter((m) =>
      ((m.payload?.['problem'] as { type?: string } | undefined)?.type ?? '')
        .includes('host-did-not-initialise'));
    expect(timeouts).toEqual([]);
  });
});
