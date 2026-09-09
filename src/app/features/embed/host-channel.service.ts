/**
 * The viewer's end of the `cde.viewer.v1` postMessage channel.
 *
 * One job: get messages safely across the origin boundary. It knows the five
 * rules in §3 of the protocol and nothing about documents, markup or rendering
 * — those belong to the component that uses it. Keeping them apart is what
 * makes the rules testable without a browser, a document, or Angular.
 *
 * Constructed with `new` in tests. It injects nothing, and the window pair it
 * talks through is passed to `connect()` rather than reached for globally, so
 * a test can hand it two fakes and watch what actually crosses.
 */
import { Injectable } from '@angular/core';
import {
  PROTOCOL, SUPPORTED_PROTOCOLS, Envelope, ViewerMessageType,
  isOurEnvelope, isUsableOrigin,
} from './embed-protocol';

/** How long to wait for `host.init` before saying so (§5). */
export const INIT_TIMEOUT_MS = 30_000;

/** The subset of `Window` this needs, so a test can supply an object literal. */
export interface MessageTarget {
  postMessage(message: unknown, targetOrigin: string): void;
}

export interface MessageSource {
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
}

export interface ChannelConfiguration {
  /** The window that receives `message` events — the viewer's own. */
  self: MessageSource;
  /** The window to address — the host's frame. */
  parent: MessageTarget;
  /** The exact origin to address and to accept. Never a wildcard. */
  parentOrigin: string;
  /** Generates message ids. Injected so tests get stable, readable ones. */
  generateId?: () => string;
}

export type HostMessageListener = (message: Envelope) => void;

@Injectable({ providedIn: 'root' })
export class HostChannel {

  private configuration: ChannelConfiguration | null = null;
  private listener: ((event: MessageEvent) => void) | null = null;
  private readonly subscribers = new Set<HostMessageListener>();

  /**
   * Messages that arrived and were dropped, and why.
   *
   * Kept because a silently-ignored message is the hardest integration
   * failure to diagnose from the outside — an integrator whose origin is
   * misconfigured sees a viewer that does nothing at all. §4 forbids logging
   * foreign-protocol traffic as an error, so it is counted here instead and
   * surfaced only when someone asks.
   */
  readonly dropped: Array<{ reason: string; type?: string }> = [];

  get connected(): boolean { return this.configuration !== null; }

  /**
   * Start listening and announce readiness.
   *
   * Returns false without connecting when the origin is unusable, because the
   * only way to proceed would be to address `'*'`, and rule 1 of §3 says never.
   */
  connect(configuration: ChannelConfiguration): boolean {
    if (!isUsableOrigin(configuration.parentOrigin)) return false;
    if (configuration.self === (configuration.parent as unknown)) return false;

    this.configuration = configuration;
    this.listener = (event: MessageEvent) => this.receive(event);
    configuration.self.addEventListener('message', this.listener);

    this.send('viewer.ready', { version: { supported: [...SUPPORTED_PROTOCOLS] } });
    return true;
  }

  disconnect(): void {
    if (this.configuration && this.listener) {
      this.configuration.self.removeEventListener('message', this.listener);
    }
    this.configuration = null;
    this.listener = null;
    this.subscribers.clear();
  }

  /** Register a listener for validated host messages. Returns an unsubscribe. */
  subscribe(listener: HostMessageListener): () => void {
    this.subscribers.add(listener);
    return () => this.subscribers.delete(listener);
  }

  /**
   * Send one message to the host, addressed to its exact origin.
   *
   * @returns the message id, so a caller can correlate a reply against it.
   */
  send(type: ViewerMessageType, payload: Record<string, unknown>, replyTo?: string): string {
    const configuration = this.configuration;
    if (!configuration) return '';

    const id = (configuration.generateId ?? defaultId)();
    const envelope: Envelope<ViewerMessageType> = {
      protocol: PROTOCOL, type, id, payload,
      ...(replyTo ? { replyTo } : {}),
    };
    configuration.parent.postMessage(envelope, configuration.parentOrigin);
    return id;
  }

  /**
   * Accept or drop one inbound message.
   *
   * The order matters and is the order of §3: origin, then sender, then
   * protocol, then shape. Checking the protocol first would mean deciding
   * whether to ignore a message before establishing who sent it.
   */
  private receive(event: MessageEvent): void {
    const configuration = this.configuration;
    if (!configuration) return;

    // Rule 2 — on every message, not only the handshake.
    if (event.origin !== configuration.parentOrigin) {
      this.dropped.push({ reason: 'origin' });
      return;
    }

    // Rule 3 — origin alone does not identify a sender when several frames
    // share one. A sibling iframe on the host's own origin is a real case.
    if (event.source !== null && event.source !== (configuration.parent as unknown)) {
      this.dropped.push({ reason: 'source' });
      return;
    }

    // §4 — foreign protocols are ignored silently, so this counts and returns
    // rather than reporting anything.
    if (!isOurEnvelope(event.data)) {
      this.dropped.push({ reason: 'envelope' });
      return;
    }

    // A message the *viewer* sends is not one it should act on. Without this,
    // a host that echoes traffic back — a logging proxy, a replay tool — would
    // drive the viewer from its own output.
    if (event.data.type.startsWith('viewer.')) {
      this.dropped.push({ reason: 'direction', type: event.data.type });
      return;
    }

    for (const subscriber of [...this.subscribers]) subscriber(event.data);
  }
}

function defaultId(): string {
  return globalThis.crypto.randomUUID();
}
