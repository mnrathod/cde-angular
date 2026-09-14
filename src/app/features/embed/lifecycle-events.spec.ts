/**
 * The lifecycle events a host listens to, driven through a real session.
 *
 * `protocol-conversation.spec.ts` checks the two implementations agree about
 * the wire. This checks the other half: that `EmbedSession` actually emits
 * `opened`, `unloaded`, `markupLoaded` and `pageRendered` at the right moments,
 * in the right order, and — for the two that deduplicate — not more often than
 * they should.
 *
 * `EmbedSession` is built from an explicit injector rather than TestBed,
 * because TestBed needs the Angular CLI and the CLI will not start on this
 * container's Node (see `viewer-architecture.md` §12). The providers below are
 * the real services, not fakes: the only thing substituted is the window pair,
 * which is what `HostChannel` already takes as an argument for this reason.
 *
 * Every document here is a media type the viewer refuses without a conversion
 * service, which makes these tests deterministic — the refusal happens before
 * any fetch, so nothing depends on the network. `viewer.opened` fires first
 * regardless, which is the point of it firing before the outcome is known.
 */
import { Injector, runInInjectionContext } from '@angular/core';
import { EmbedSession } from './embed-session.service';
import { HostChannel } from './host-channel.service';
import { MarkupWireFormat } from './markup-wire-format';
import { ViewerStateService, ShapeData } from '../../../viewer-core/viewer-state.service';
import { MarkupEngineService } from '../../../viewer-core/markup-engine.service';
import { PdfEngineService } from '../../../viewer-core/pdf-engine.service';
import { PROTOCOL, Envelope } from './embed-protocol';

const HOST_ORIGIN = 'https://host.example';

/** A format the browser cannot render, so the outcome is decided without I/O. */
const NEEDS_CONVERSION = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function office(externalId: string, displayName = `${externalId}.docx`) {
  return {
    url: 'https://files.host.example/doc/1',
    mediaType: NEEDS_CONVERSION,
    displayName,
    externalId,
  };
}

/**
 * A session wired to a window pair that records everything it is sent.
 *
 * `deliver` pushes a host message in the way a browser would, so the channel's
 * origin and source checks run on it rather than being stepped around.
 */
function startSession() {
  const sent: Envelope[] = [];
  const listeners: Array<(event: MessageEvent) => void> = [];

  const hostWindow = {
    postMessage: (data: unknown) => sent.push(data as Envelope),
  };
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
  const engine = injector.get(MarkupEngineService);
  session.start({ self: viewerWindow, parent: hostWindow, parentOrigin: HOST_ORIGIN });

  const deliver = (type: string, payload: Record<string, unknown>) => {
    for (const listener of [...listeners]) {
      listener({
        origin: HOST_ORIGIN,
        source: hostWindow,
        data: { protocol: PROTOCOL, type, id: `host-${sent.length}`, payload },
      } as unknown as MessageEvent);
    }
  };

  const typesSent = () => sent.map((message) => message.type);
  const lastOf = (type: string) => [...sent].reverse().find((m) => m.type === type);

  return { session, sent, deliver, typesSent, lastOf, engine };
}

describe('document lifecycle events', () => {

  it('announces viewer.opened before it knows whether the document can be shown', async () => {
    const { deliver, typesSent, lastOf } = startSession();

    deliver('host.init', { document: office('doc-a', 'Specification.docx') });
    await Promise.resolve();

    // opened, then the refusal — not the other way round, and not only the
    // refusal. A host logging "this person opened X" must hear it even when
    // the viewer then cannot render X.
    expect(typesSent()).toEqual(['viewer.ready', 'viewer.opened', 'viewer.error']);
    expect(lastOf('viewer.opened')?.payload).toMatchObject({
      externalId: 'doc-a',
      displayName: 'Specification.docx',
      mediaType: NEEDS_CONVERSION,
    });
  });

  it('does not announce an open for a document it rejected outright', async () => {
    const { deliver, typesSent } = startSession();

    // No mediaType — fails `isDocumentDescriptor`, so there is no document to
    // have opened. Announcing one would invent a document the host never got.
    deliver('host.init', { document: { url: 'https://files.host.example/x', displayName: 'x' } });
    await Promise.resolve();

    expect(typesSent()).toEqual(['viewer.ready', 'viewer.error']);
  });

  it('unloads the previous document before opening the next, in that order', async () => {
    const { deliver, sent, typesSent, lastOf } = startSession();

    deliver('host.init', { document: office('doc-a') });
    await Promise.resolve();
    sent.length = 0;

    deliver('host.loadDocument', { document: office('doc-b') });
    await Promise.resolve();

    expect(typesSent()).toEqual(['viewer.unloaded', 'viewer.opened', 'viewer.error']);
    // The unload names the document that closed, not the one arriving — a host
    // filing "time spent on doc-a" needs the id it is closing.
    expect(lastOf('viewer.unloaded')?.payload).toMatchObject({
      reason: 'replaced', externalId: 'doc-a',
    });
    expect(lastOf('viewer.opened')?.payload).toMatchObject({ externalId: 'doc-b' });
  });

  it('unloads on session end, before the channel closes', async () => {
    const { session, deliver, sent, lastOf } = startSession();

    deliver('host.init', { document: office('doc-a') });
    await Promise.resolve();
    sent.length = 0;

    session.stop();

    // If `stop()` disconnected first this array would be empty, because a
    // disconnected channel drops sends silently.
    expect(lastOf('viewer.unloaded')?.payload).toMatchObject({
      reason: 'session-ended', externalId: 'doc-a',
    });
  });

  it('sends no unload when no document was ever opened', () => {
    const { session, sent } = startSession();
    sent.length = 0;

    session.stop();

    // A host that never saw an open should not have to write code to ignore
    // a close. This is the whole reason the announcement is guarded.
    expect(sent).toEqual([]);
  });

  it('sends exactly one unload when a session with a document stops twice', async () => {
    const { session, deliver, sent } = startSession();

    deliver('host.init', { document: office('doc-a') });
    await Promise.resolve();
    sent.length = 0;

    session.stop();
    session.stop();

    expect(sent.filter((message) => message.type === 'viewer.unloaded').length).toBe(1);
  });
});

describe('viewer.markupLoaded', () => {

  const shape = (id: string): ShapeData => ({
    id, tool: 'rect', pageNumber: 1, color: '#c00', strokeWidth: 2, opacity: 1,
    x: 10, y: 10, width: 40, height: 30,
  });

  it('acknowledges what it rendered and counts what it could not', async () => {
    const { deliver, lastOf, engine } = startSession();
    deliver('host.init', { document: office('doc-a') });
    await Promise.resolve();

    deliver('host.loadMarkup', { markup: [
      // Two the viewer can draw.
      { markupId: 'm1', page: 1, type: 'RECT', shapeData: engine.shapesToJson([shape('m1')]) },
      { markupId: 'm2', page: 1, type: 'RECT', shapeData: engine.shapesToJson([shape('m2')]) },
      // Well-formed Markup whose opaque blob no longer parses — the failure a
      // host's own storage can introduce, and the one that used to be silent.
      { markupId: 'm3', page: 1, type: 'RECT', shapeData: 'not json at all' },
      // Not a Markup: no markupId.
      { page: 1, type: 'RECT', shapeData: '{}' },
    ] });

    expect(lastOf('viewer.markupLoaded')?.payload).toMatchObject({
      count: 2, rejected: 2, externalId: 'doc-a',
    });
  });

  it('acknowledges an empty list rather than staying silent', async () => {
    const { deliver, lastOf } = startSession();
    deliver('host.init', { document: office('doc-a') });
    await Promise.resolve();

    deliver('host.loadMarkup', { markup: [] });

    // "You have none stored" and "I never heard you" look identical to a host
    // without this, and only one of them is worth retrying.
    expect(lastOf('viewer.markupLoaded')?.payload).toMatchObject({ count: 0, rejected: 0 });
  });

  it('stays silent when markup is not a list, as §6.3 documents', async () => {
    const { deliver, sent } = startSession();
    deliver('host.init', { document: office('doc-a') });
    await Promise.resolve();
    sent.length = 0;

    deliver('host.loadMarkup', { markup: { markupId: 'm1' } });

    // Deliberate: `viewer.error` means the document could not be opened, and
    // widening it here would blank the page of every host that treats it so.
    expect(sent).toEqual([]);
  });
});

describe('viewer.pageRendered', () => {

  it('reports a page once however many times it repaints', async () => {
    const { session, deliver, sent } = startSession();
    deliver('host.init', { document: office('doc-a') });
    await Promise.resolve();
    sent.length = 0;

    session.pageRendered(3, 800, 1130);
    session.pageRendered(3, 1600, 2260);   // the same page, zoomed
    session.pageRendered(4, 800, 1130);

    const pages = sent
      .filter((message) => message.type === 'viewer.pageRendered')
      .map((message) => message.payload['page']);
    expect(pages).toEqual([3, 4]);
  });

  it('carries the rendered size and the zoom it was rendered at', async () => {
    const { session, deliver, lastOf } = startSession();
    deliver('host.init', { document: office('doc-a') });
    await Promise.resolve();

    session.pageRendered(2, 816, 1056);

    expect(lastOf('viewer.pageRendered')?.payload).toMatchObject({
      page: 2, widthPx: 816, heightPx: 1056, externalId: 'doc-a',
    });
  });

  it('counts pages afresh for a new document', async () => {
    const { session, deliver, sent } = startSession();
    deliver('host.init', { document: office('doc-a') });
    await Promise.resolve();
    session.pageRendered(1, 800, 1130);

    deliver('host.loadDocument', { document: office('doc-b') });
    await Promise.resolve();
    sent.length = 0;

    session.pageRendered(1, 800, 1130);

    // Page 1 of doc-b is not page 1 of doc-a. Without the reset a host would
    // record the second document as never having been read.
    const rendered = sent.filter((message) => message.type === 'viewer.pageRendered');
    expect(rendered.length).toBe(1);
    expect(rendered[0]?.payload['externalId']).toBe('doc-b');
  });
});
