/**
 * The viewer and the demo host, talking to each other for real.
 *
 * Both sides implement `cde.viewer.v1` independently — the viewer in
 * TypeScript in `host-channel.service.ts`, the host in plain JavaScript in
 * `demo/public/host-protocol.js` — and neither imports the other. That is the
 * arrangement an integrator is in, and it means a protocol change that breaks
 * interoperability breaks it here rather than in someone's staging
 * environment.
 *
 * The shipped host file is imported, not a copy of it. A copy would test the
 * copy.
 *
 * The two windows are objects. `postMessage` is wired to deliver
 * synchronously, which the browser does not do — but this is testing the
 * agreement about message content and checks, not the event loop, and a
 * synchronous wire makes an out-of-order failure impossible to hide.
 */
import { HostChannel } from './host-channel.service';
import { PROTOCOL, Envelope } from './embed-protocol';
// Plain JavaScript, imported as the demo ships it — see tsconfig.spec.json.
// TypeScript infers what it can from the JSDoc there, which is why the casts
// below are narrow rather than a blanket `any` on the import.
import { ViewerHost, MarkupStore, decideOperation } from '../../../../demo/public/host-protocol.js';

/** What the host stores: a Markup plus the fields the host adds itself. */
type StoredMarkup = Record<string, string | number>;

/**
 * The host's traffic callback signature, as its JSDoc declares it.
 *
 * `message` is `object` there and an `Envelope` here, and narrowing it in the
 * parameter would be unsound — the host is entitled to hand this anything. So
 * the cast happens on the way in, where it is a claim this test is making
 * rather than one the host is.
 */
type Traffic = { direction: string; message: object };

const VIEWER_ORIGIN = 'https://viewer.example';
const HOST_ORIGIN = 'https://host.example';

/**
 * Two fake windows wired together.
 *
 * Each side's `postMessage` synthesises the `message` event the other side
 * would receive, with the `origin` and `source` a browser would set — so the
 * origin and sender checks on both sides are exercised by every message that
 * crosses, rather than being bypassed by a shortcut.
 */
function wire() {
  const viewerListeners: Array<(event: MessageEvent) => void> = [];
  const hostListeners: Array<(event: MessageEvent) => void> = [];

  const viewerWindow = {
    addEventListener: (_t: string, fn: (event: MessageEvent) => void) => viewerListeners.push(fn),
    removeEventListener: (_t: string, fn: (event: MessageEvent) => void) => {
      const at = viewerListeners.indexOf(fn);
      if (at >= 0) viewerListeners.splice(at, 1);
    },
    postMessage: (data: unknown, targetOrigin: string) => {
      deliveries.push({ to: 'viewer', targetOrigin });
      for (const listener of [...viewerListeners]) {
        listener({ origin: HOST_ORIGIN, source: hostWindow, data } as unknown as MessageEvent);
      }
    },
  };

  const hostWindow = {
    addEventListener: (_t: string, fn: (event: MessageEvent) => void) => hostListeners.push(fn),
    removeEventListener: (_t: string, fn: (event: MessageEvent) => void) => {
      const at = hostListeners.indexOf(fn);
      if (at >= 0) hostListeners.splice(at, 1);
    },
    postMessage: (data: unknown, targetOrigin: string) => {
      deliveries.push({ to: 'host', targetOrigin });
      for (const listener of [...hostListeners]) {
        listener({ origin: VIEWER_ORIGIN, source: viewerWindow, data } as unknown as MessageEvent);
      }
    },
  };

  const deliveries: Array<{ to: string; targetOrigin: string }> = [];
  return { viewerWindow, hostWindow, deliveries };
}

/** A host that answers the handshake, as §9's minimum integration describes. */
function startHost(
  hostWindow: ReturnType<typeof wire>['hostWindow'],
  viewerWindow: ReturnType<typeof wire>['viewerWindow'],
  session = { displayName: 'A. Surveyor', subjectId: 'demo-user-1', capabilities: ['markup:create'] },
) {
  const seen: Envelope[] = [];
  const host = new ViewerHost({
    frame: viewerWindow,
    viewerOrigin: VIEWER_ORIGIN,
    self: hostWindow,
    generateId: (() => { let n = 0; return () => `host-${(n += 1)}`; })(),
    onTraffic: ({ direction, message }: Traffic) => {
      if (direction === 'in') seen.push(message as Envelope);
    },
  });

  host.on('viewer.ready', () => {
    host.send('host.init', {
      document: {
        url: 'https://files.host.example/doc/1',
        mediaType: 'application/pdf',
        displayName: 'Sample drawing.pdf',
        externalId: 'demo-doc-1',
      },
      identity: session,
    });
  });

  return { host, seen };
}

function startViewer(
  viewerWindow: ReturnType<typeof wire>['viewerWindow'],
  hostWindow: ReturnType<typeof wire>['hostWindow'],
) {
  const channel = new HostChannel();
  const received: Envelope[] = [];
  channel.subscribe((message) => received.push(message));

  let counter = 0;
  const connected = channel.connect({
    self: viewerWindow,
    parent: hostWindow,
    parentOrigin: HOST_ORIGIN,
    generateId: () => `viewer-${(counter += 1)}`,
  });

  return { channel, received, connected };
}

describe('the viewer and the demo host, end to end', () => {

  it('completes the handshake', () => {
    const { viewerWindow, hostWindow } = wire();
    const { seen } = startHost(hostWindow, viewerWindow);
    const { received, connected } = startViewer(viewerWindow, hostWindow);

    expect(connected).toBe(true);
    expect(seen.map((message) => message.type)).toEqual(['viewer.ready']);
    expect(received.map((message) => message.type)).toEqual(['host.init']);

    const init = received[0];
    expect(init?.payload['document']).toMatchObject({ mediaType: 'application/pdf' });
  });

  it('never addresses a wildcard origin, in either direction', () => {
    const { viewerWindow, hostWindow, deliveries } = wire();
    startHost(hostWindow, viewerWindow);
    const { channel } = startViewer(viewerWindow, hostWindow);
    channel.send('viewer.loaded', { pageCount: 3 });

    expect(deliveries.length).toBeGreaterThan(2);
    expect(deliveries.every((delivery) => delivery.targetOrigin !== '*')).toBe(true);
    expect(new Set(deliveries.map((delivery) => delivery.targetOrigin)))
      .toEqual(new Set([VIEWER_ORIGIN, HOST_ORIGIN]));
  });

  it('carries markup to the host and back without the host parsing it', () => {
    const { viewerWindow, hostWindow } = wire();
    const { host, seen } = startHost(hostWindow, viewerWindow);
    const { channel } = startViewer(viewerWindow, hostWindow);

    const store = new MarkupStore(null);
    const opaque = '{"points":[[120,300],[180,340]],"stroke":"#c00"}';
    host.on('viewer.markupCreated', (message: object) => {
      const markup = (message as Envelope).payload['markup'] as Record<string, unknown>;
      store.upsert('demo-doc-1', markup, 'A. Surveyor');
    });

    channel.send('viewer.markupCreated', {
      markup: {
        markupId: 'm-1', externalId: 'demo-doc-1', page: 3,
        type: 'CLOUD', shapeData: opaque, comment: 'Check this',
      },
    });

    const stored = store.list('demo-doc-1') as StoredMarkup[];
    expect(stored).toHaveLength(1);
    // §6.2: shapeData survives byte for byte because nothing parsed it.
    expect(stored[0]?.['shapeData']).toBe(opaque);
    expect(stored[0]?.['author']).toBe('A. Surveyor');
    expect(seen.at(-1)?.payload['markup']).not.toHaveProperty('author');

    // Handing it back is the reload path.
    host.send('host.loadMarkup', { markup: stored });
  });

  it('stamps the author from the session even when the message claims one', () => {
    // The viewer does not send an author, so a host that trusted one would
    // look correct forever — until something else on the page put a name in
    // the message. §6.2 exists because an author in the payload is a claim the
    // browser makes about its own user, and this asserts the host overrides it
    // rather than merely that it fills a gap.
    const { viewerWindow, hostWindow } = wire();
    const { host } = startHost(hostWindow, viewerWindow);
    startViewer(viewerWindow, hostWindow);

    const store = new MarkupStore(null);
    host.on('viewer.markupCreated', (message: object) => {
      store.upsert('demo-doc-1', (message as Envelope).payload['markup'], 'A. Surveyor');
    });

    hostWindow.postMessage({
      protocol: PROTOCOL, type: 'viewer.markupCreated', id: 'forged-1',
      payload: {
        markup: {
          markupId: 'm-2', page: 1, type: 'CLOUD', shapeData: '{}',
          author: 'Someone Else', displayName: 'Someone Else',
        },
      },
    }, VIEWER_ORIGIN);

    const [first] = store.list('demo-doc-1') as StoredMarkup[];
    expect(first?.['author']).toBe('A. Surveyor');
  });

  it('refuses an operation whose capability it granted, and says why', () => {
    // §6.1: capabilities decide which controls render; authorisation happens
    // when the operation is requested. The two are allowed to disagree, and
    // this is the case that proves the viewer does not treat a grant as
    // permission.
    const { viewerWindow, hostWindow } = wire();
    const session = {
      displayName: 'A. Surveyor', subjectId: 'demo-user-1',
      capabilities: ['markup:create', 'document:sign'],
    };
    const { host } = startHost(hostWindow, viewerWindow, session);
    const { channel, received } = startViewer(viewerWindow, hostWindow);

    host.on('viewer.operationRequest', (message: object) => {
      const request = message as Envelope;
      const outcome = decideOperation(request.payload['operation'], session);
      host.send('host.operationResult', outcome, request.id);
    });

    const requestId = channel.send('viewer.operationRequest', { operation: 'document.sign' });

    const result = received.at(-1);
    expect(result?.type).toBe('host.operationResult');
    expect(result?.replyTo).toBe(requestId);
    expect(result?.payload['status']).toBe('refused');
    expect((result?.payload['problem'] as { status: number }).status).toBe(403);
  });

  it('survives a message type the other side has never heard of', () => {
    // §10 is the whole compatibility promise: within v1, either side may meet
    // a type it does not know and must carry on. It is easy to satisfy by
    // accident and easy to lose by adding a `default: throw` in a switch, so
    // it is asserted rather than assumed — in both directions, because the
    // host and the viewer age at different rates.
    const { viewerWindow, hostWindow } = wire();
    const { host, seen } = startHost(hostWindow, viewerWindow);
    const { channel, received } = startViewer(viewerWindow, hostWindow);

    expect(() => host.send('host.somethingFromV1Point9', { anything: true })).not.toThrow();
    expect(received.at(-1)?.type).toBe('host.somethingFromV1Point9');

    expect(() => channel.send('viewer.futureEvent' as never, { anything: true })).not.toThrow();
    expect(seen.at(-1)?.type).toBe('viewer.futureEvent');

    // Both sides still work afterwards — an unknown type is not a poisoned
    // channel.
    channel.send('viewer.loaded', { pageCount: 3 });
    expect(seen.at(-1)?.payload['pageCount']).toBe(3);
  });

  it('drops a foreign protocol on the host side without disturbing the session', () => {
    // The host page is the one most likely to have other frames talking on it
    // — analytics, chat widgets, a design system's own bus.
    const { viewerWindow, hostWindow } = wire();
    const { host, seen } = startHost(hostWindow, viewerWindow);
    const { channel } = startViewer(viewerWindow, hostWindow);
    const before = seen.length;

    hostWindow.postMessage({ protocol: 'analytics.v3', type: 'pageview', id: '1', payload: {} },
      HOST_ORIGIN);

    expect(seen.length).toBe(before);
    expect(host.dropped.at(-1)).toBe('envelope');

    channel.send('viewer.loaded', { pageCount: 1 });
    expect(seen.at(-1)?.type).toBe('viewer.loaded');
  });
});
