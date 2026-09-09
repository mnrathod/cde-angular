/**
 * The five rules of protocol §3, as tests.
 *
 * These are the checks that get quietly dropped under deadline pressure and
 * are the reason embedded viewers leak, so each one is asserted directly
 * rather than inferred from a working handshake. A channel that talks to the
 * right host is not evidence that it refuses the wrong one.
 *
 * No TestBed and no browser: `HostChannel` injects nothing and takes its two
 * windows as arguments, so the whole surface is reachable with object
 * literals. That is deliberate — a security check that needs a rendered page
 * to test is a security check that stops being tested.
 */
import { HostChannel } from './host-channel.service';
import { PROTOCOL, Envelope } from './embed-protocol';

const HOST_ORIGIN = 'https://host.example';

interface Sent { message: unknown; targetOrigin: string }

/** A pair of fake windows, plus the wires needed to drive them from a test. */
function harness(parentOrigin: string = HOST_ORIGIN) {
  const sent: Sent[] = [];
  const listeners: Array<(event: MessageEvent) => void> = [];

  const parent = {
    postMessage: (message: unknown, targetOrigin: string) =>
      sent.push({ message, targetOrigin }),
  };

  const self = {
    addEventListener: (_type: 'message', listener: (event: MessageEvent) => void) =>
      listeners.push(listener),
    removeEventListener: (_type: 'message', listener: (event: MessageEvent) => void) => {
      const index = listeners.indexOf(listener);
      if (index >= 0) listeners.splice(index, 1);
    },
  };

  const channel = new HostChannel();
  let counter = 0;
  const connected = channel.connect({
    self, parent, parentOrigin,
    generateId: () => `id-${(counter += 1)}`,
  });

  /** Deliver an event as the browser would, with defaults that pass. */
  const deliver = (data: unknown, over: Partial<MessageEvent> = {}) => {
    const event = {
      origin: HOST_ORIGIN,
      source: parent,
      data,
      ...over,
    } as unknown as MessageEvent;
    for (const listener of [...listeners]) listener(event);
  };

  const received: Envelope[] = [];
  channel.subscribe((message) => received.push(message));

  return { channel, sent, deliver, received, connected, listenerCount: () => listeners.length };
}

function hostMessage(type: string, payload: Record<string, unknown> = {}) {
  return { protocol: PROTOCOL, type, id: 'host-1', payload };
}

describe('HostChannel', () => {

  describe('rule 1 — never postMessage to a wildcard', () => {

    it('addresses the host origin exactly, on the handshake', () => {
      const { sent } = harness();
      expect(sent).toHaveLength(1);
      expect(sent[0]?.targetOrigin).toBe(HOST_ORIGIN);
    });

    it('addresses the host origin exactly on every later send', () => {
      const { channel, sent } = harness();
      channel.send('viewer.loaded', { pageCount: 3 });
      channel.send('viewer.viewChanged', { page: 2 });

      expect(sent.map((entry) => entry.targetOrigin))
        .toEqual([HOST_ORIGIN, HOST_ORIGIN, HOST_ORIGIN]);
      expect(sent.some((entry) => entry.targetOrigin === '*')).toBe(false);
    });

    it.each(['*', 'null', '', 'not a url', '/relative', 'https://host.example/path'])(
      'refuses to connect when parentOrigin is %j, rather than falling back to a wildcard',
      (origin) => {
        const { connected, sent, listenerCount } = harness(origin);
        expect(connected).toBe(false);
        expect(sent).toHaveLength(0);
        expect(listenerCount()).toBe(0);
      },
    );
  });

  describe('rule 2 — check the origin on every message', () => {

    it('accepts a message from the host origin', () => {
      const { deliver, received } = harness();
      deliver(hostMessage('host.init'));
      expect(received).toHaveLength(1);
    });

    it('drops a message from another origin', () => {
      const { deliver, received, channel } = harness();
      deliver(hostMessage('host.init'), { origin: 'https://attacker.example' });

      expect(received).toHaveLength(0);
      expect(channel.dropped.at(-1)?.reason).toBe('origin');
    });

    it('keeps checking after a valid message — not only on the handshake', () => {
      const { deliver, received, channel } = harness();
      deliver(hostMessage('host.init'));
      deliver(hostMessage('host.command'), { origin: 'https://attacker.example' });

      expect(received).toHaveLength(1);
      expect(channel.dropped.at(-1)?.reason).toBe('origin');
    });
  });

  describe('rule 3 — check the sender, because an origin is not a sender', () => {

    it('drops a message from a different window on the host origin', () => {
      // A sibling iframe on the host's own origin: same origin, wrong sender.
      const { deliver, received, channel } = harness();
      deliver(hostMessage('host.init'), {
        source: { postMessage: () => undefined } as unknown as MessageEventSource,
      });

      expect(received).toHaveLength(0);
      expect(channel.dropped.at(-1)?.reason).toBe('source');
    });
  });

  describe('rule 4 — every payload is untrusted', () => {

    it.each([
      ['a foreign protocol', { protocol: 'other.thing.v1', type: 'x', id: '1', payload: {} }],
      ['no protocol at all', { type: 'host.init', id: '1', payload: {} }],
      ['a missing id', { protocol: PROTOCOL, type: 'host.init', payload: {} }],
      ['a non-object payload', { protocol: PROTOCOL, type: 'host.init', id: '1', payload: 'x' }],
      ['an array payload', { protocol: PROTOCOL, type: 'host.init', id: '1', payload: [] }],
      ['a bare string', 'host.init'],
      ['null', null],
    ])('drops %s', (_label, data) => {
      const { deliver, received } = harness();
      deliver(data);
      expect(received).toHaveLength(0);
    });

    it('ignores a foreign protocol silently, without reporting it as an error', () => {
      // §4: other frames on the page use postMessage for their own purposes.
      // Treating their traffic as malformed input produces noise that trains
      // people to ignore the log, so this must stay a count and not a throw.
      const { deliver, channel } = harness();
      expect(() =>
        deliver({ protocol: 'analytics.v3', type: 'pageview', id: '1', payload: {} }),
      ).not.toThrow();
      expect(channel.dropped.at(-1)?.reason).toBe('envelope');
    });
  });

  describe('direction', () => {

    it('ignores its own message type echoed back by the host', () => {
      // A logging proxy or replay tool that echoes traffic would otherwise
      // drive the viewer from its own output.
      const { deliver, received, channel } = harness();
      deliver({ protocol: PROTOCOL, type: 'viewer.markupCreated', id: 'x', payload: {} });

      expect(received).toHaveLength(0);
      expect(channel.dropped.at(-1)).toEqual({ reason: 'direction', type: 'viewer.markupCreated' });
    });
  });

  describe('the handshake', () => {

    it('announces the versions it speaks, so a host can pick', () => {
      const { sent } = harness();
      const ready = sent[0]?.message as Envelope;

      expect(ready.type).toBe('viewer.ready');
      expect(ready.protocol).toBe(PROTOCOL);
      expect(ready.payload).toEqual({ version: { supported: [PROTOCOL] } });
    });

    it('will not connect when it is not framed', () => {
      // window.parent === window when the page is opened directly. Sending
      // then would post the handshake to itself and wait forever.
      const alone = { postMessage: () => undefined, addEventListener: () => undefined,
                      removeEventListener: () => undefined };
      const channel = new HostChannel();

      expect(channel.connect({ self: alone, parent: alone, parentOrigin: HOST_ORIGIN }))
        .toBe(false);
      expect(channel.connected).toBe(false);
    });
  });

  describe('correlation and teardown', () => {

    it('returns the id it sent, so a reply can be matched to a request', () => {
      const { channel, sent } = harness();
      const id = channel.send('viewer.operationRequest', { operation: 'pages.rotate' });

      expect(id).toBe('id-2');                                  // id-1 was the handshake
      expect((sent.at(-1)?.message as Envelope).id).toBe('id-2');
    });

    it('carries replyTo only when there is something to reply to', () => {
      const { channel, sent } = harness();
      channel.send('viewer.loaded', { pageCount: 1 });
      expect((sent.at(-1)?.message as Envelope).replyTo).toBeUndefined();

      channel.send('viewer.error', {}, 'host-9');
      expect((sent.at(-1)?.message as Envelope).replyTo).toBe('host-9');
    });

    it('stops listening and stops sending once disconnected', () => {
      const { channel, sent, deliver, received, listenerCount } = harness();
      channel.disconnect();

      deliver(hostMessage('host.init'));
      channel.send('viewer.loaded', {});

      expect(listenerCount()).toBe(0);
      expect(received).toHaveLength(0);
      expect(sent).toHaveLength(1);                             // the handshake only
    });
  });
});
