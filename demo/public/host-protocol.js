/**
 * The host's end of `cde.viewer.v1`.
 *
 * Plain JavaScript, no framework, no build step — deliberately. The viewer is
 * an Angular application and this is not, which is the claim the iframe embed
 * makes (ADR 14: "Procore, Asite and Dalux are three different stacks"). A demo
 * host written in Angular would prove nothing.
 *
 * It is also a **separate implementation** of the same protocol rather than a
 * shared library. That is the point: an integrator writes this file, not
 * imports it, so if the protocol is awkward to implement it is awkward here
 * first. `docs/viewer-embed-protocol.md` §9 is the whole of what is required;
 * everything past `host.init` in this file is optional and marked as such.
 *
 * No DOM access anywhere in this module, so it can be tested against the
 * viewer's own channel with two fake windows and no browser.
 */

export const PROTOCOL = 'cde.viewer.v1';

/**
 * @typedef {object} HostOptions
 * @property {Window|{postMessage: Function}|(() => Window)} frame
 *   The viewer's window, or a function returning it. Pass a function when the
 *   frame is navigated after the host is constructed: assigning `src` replaces
 *   the window, and a reference captured beforehand stops matching
 *   `event.source`, so every inbound message is dropped by rule 3.
 * @property {string} viewerOrigin                        exact origin to address
 * @property {{addEventListener: Function, removeEventListener: Function}} self
 * @property {(event: {direction: string, message: object}) => void} [onTraffic]
 * @property {() => string} [generateId]
 */

export class ViewerHost {

  /** @param {HostOptions} options */
  constructor(options) {
    this.resolveFrame = typeof options.frame === 'function'
      ? options.frame
      : () => options.frame;
    this.viewerOrigin = options.viewerOrigin;
    this.self = options.self;
    this.onTraffic = options.onTraffic ?? (() => {});
    this.generateId = options.generateId
      ?? (() => globalThis.crypto.randomUUID());

    /** @type {Map<string, (message: object) => void>} */
    this.handlers = new Map();
    /** Counted rather than logged — see the viewer's channel for why. */
    this.dropped = [];

    this.listener = (event) => this.#receive(event);
    this.self.addEventListener('message', this.listener);
  }

  close() {
    this.self.removeEventListener('message', this.listener);
    this.handlers.clear();
  }

  /**
   * Register a handler for one viewer message type.
   * @param {string} type
   * @param {(message: object) => void} handler
   */
  on(type, handler) {
    this.handlers.set(type, handler);
    return this;
  }

  /**
   * Send one message to the viewer.
   *
   * Rule 1 of §3: the target origin is the viewer's exact origin, never `'*'`.
   * There is no code path here that produces a wildcard, which is the only way
   * to be sure of that.
   */
  send(type, payload, replyTo) {
    const message = { protocol: PROTOCOL, type, id: this.generateId(), payload };
    if (replyTo) message.replyTo = replyTo;
    this.resolveFrame().postMessage(message, this.viewerOrigin);
    this.onTraffic({ direction: 'out', message });
    return message.id;
  }

  #receive(event) {
    // Rule 2 — every message, not just the first.
    if (event.origin !== this.viewerOrigin) {
      this.dropped.push('origin');
      return;
    }
    // Rule 3 — an origin is not a sender. Several frames can share one.
    if (event.source !== null && event.source !== this.resolveFrame()) {
      this.dropped.push('source');
      return;
    }
    // §4 — a foreign protocol is ignored silently. The host page is the one
    // most likely to have other frames talking on it, so this matters more
    // here than it does in the viewer.
    if (!isOurEnvelope(event.data)) {
      this.dropped.push('envelope');
      return;
    }
    // The host must not act on its own messages coming back.
    if (!event.data.type.startsWith('viewer.')) {
      this.dropped.push('direction');
      return;
    }

    this.onTraffic({ direction: 'in', message: event.data });
    this.handlers.get(event.data.type)?.(event.data);
  }
}

/** Rule 4 — validate what arrives, in this direction too. */
export function isOurEnvelope(value) {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && value.protocol === PROTOCOL
    && typeof value.type === 'string' && value.type.length > 0
    && typeof value.id === 'string' && value.id.length > 0
    && typeof value.payload === 'object'
    && value.payload !== null
    && !Array.isArray(value.payload);
}

/**
 * Markup the host has stored, keyed by document.
 *
 * The whole persistence story from §11: the viewer forgets on unload and the
 * host remembers. `shapeData` is carried as an opaque string and is never
 * parsed — §6.2 — so this store works unchanged when the viewer's geometry
 * encoding changes.
 */
export class MarkupStore {

  /** @param {Storage|null} storage a Storage-like, or null to stay in memory */
  constructor(storage = null) {
    this.storage = storage;
    /** @type {Map<string, object[]>} */
    this.memory = new Map();
  }

  #key(externalId) { return `cde.demo.markup.${externalId}`; }

  /** @returns {object[]} */
  list(externalId) {
    if (!this.storage) return this.memory.get(externalId) ?? [];
    try {
      return JSON.parse(this.storage.getItem(this.#key(externalId)) ?? '[]');
    } catch {
      return [];
    }
  }

  #save(externalId, markup) {
    if (!this.storage) {
      this.memory.set(externalId, markup);
      return;
    }
    try {
      this.storage.setItem(this.#key(externalId), JSON.stringify(markup));
    } catch {
      // A private window, or storage disabled. Losing persistence is not worth
      // breaking the demo over; the round trip still works within the session.
      this.memory.set(externalId, markup);
      this.storage = null;
    }
  }

  /**
   * Store one markup, stamping the author from the host's own record.
   *
   * §6.2: the viewer sends no author, and this is why — the host knows who is
   * in the session because it said so in `host.init`. Taking a display name
   * from the message would be trusting the browser's claim about its own user.
   */
  upsert(externalId, markup, authorFromSession) {
    const stored = this.list(externalId);
    const record = { ...markup, author: authorFromSession, storedAt: new Date().toISOString() };
    const index = stored.findIndex((entry) => entry.markupId === markup.markupId);
    if (index >= 0) stored[index] = record; else stored.push(record);
    this.#save(externalId, stored);
    return record;
  }

  remove(externalId, markupId) {
    const remaining = this.list(externalId).filter((entry) => entry.markupId !== markupId);
    this.#save(externalId, remaining);
    return remaining;
  }
}

/**
 * Decide an operation the viewer asked for.
 *
 * A deliberately small, obvious policy, because the point it makes is about
 * *where* the decision is taken rather than how clever it is. §6.1: a
 * `refused` must be possible even for a capability granted in `host.init`,
 * and `document.sign` is the demo's example — the host grants the control so
 * the button renders, then refuses the operation, and the viewer shows the
 * refusal without treating it as an error.
 *
 * @returns {{status: 'applied'|'refused'|'failed', problem?: object, result?: object}}
 */
export function decideOperation(operation, session) {
  if (operation === 'document.sign') {
    return {
      status: 'refused',
      problem: {
        type: 'https://demo.example/problems/signing-not-configured',
        title: 'Signing is not available in the demo',
        status: 403,
        detail:
          'The control rendered because the demo granted the capability, and the ' +
          'operation was refused because the demo host does not hold a signing ' +
          'credential. Both are correct: capabilities decide what renders, the ' +
          'host decides what happens.',
      },
    };
  }

  if (!session.capabilities.includes('markup:create')) {
    return {
      status: 'refused',
      problem: {
        type: 'https://demo.example/problems/not-permitted',
        title: 'Not permitted',
        status: 403,
        detail: `This session may not perform ${operation}.`,
      },
    };
  }

  return { status: 'applied', result: {} };
}
