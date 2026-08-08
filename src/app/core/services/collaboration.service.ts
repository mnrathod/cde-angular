import { Injectable, inject, signal, computed, OnDestroy } from '@angular/core';
import { Client, IMessage } from '@stomp/stompjs';

import { AuthService } from './auth.service';

/** Someone viewing the same document. */
export interface Participant {
  username: string;
  /** Stable per-user colour, chosen server-side so every client agrees. */
  colour:   string;
}

/** A pointer position in PDF page coordinates — independent of zoom. */
export interface CursorPosition {
  page: number;
  x:    number;
  y:    number;
}

export type CollaborationEventType =
  | 'PRESENCE' | 'CURSOR'
  | 'ANNOTATION_CREATED' | 'ANNOTATION_UPDATED' | 'ANNOTATION_DELETED'
  | 'ANNOTATION_RESOLVED' | 'REPLY_ADDED' | 'VERSION_COMMITTED';

export interface CollaborationEvent {
  type:          CollaborationEventType;
  documentId:    number;
  actor?:        string;
  participants?: Participant[];
  cursor?:       CursorPosition;
  annotation?:   unknown;
  annotationId?: number;
  reply?:        { id: number; annotationId: number; author: string; content: string };
  version?:      number;
  summary?:      string;
  at?:           string;
}

/** A remote pointer, with the moment it last moved. */
export interface RemoteCursor extends CursorPosition {
  username: string;
  colour:   string;
  seenAt:   number;
}

/** Cursors go stale rather than being explicitly cleared — a pointer that
 *  stopped moving a while ago is not telling anyone anything. */
const CURSOR_TIMEOUT_MS = 10_000;

/** Pointer moves are throttled: a mouse fires far faster than anyone can read. */
const CURSOR_THROTTLE_MS = 60;

/**
 * Live collaboration on a document: who else is here, where their pointer is,
 * and what they change.
 *
 * <p>One STOMP subscription per document carries every event kind. Reacting
 * to a single stream avoids the ordering problems that come from reconciling
 * several subscriptions, and means a new event type needs no new plumbing.
 *
 * <p>Not `providedIn: 'root'`: it is scoped to the viewer, so leaving the
 * document tears the connection down rather than leaving a socket announcing
 * a presence that has gone.
 */
@Injectable()
export class CollaborationService implements OnDestroy {
  private auth = inject(AuthService);

  private client: Client | null = null;
  private documentId = 0;
  private lastCursorSentAt = 0;

  readonly connected    = signal(false);
  readonly participants = signal<Participant[]>([]);
  readonly cursors      = signal<RemoteCursor[]>([]);

  /** Events other than presence and cursors, for the viewer to act on. */
  private readonly listeners = new Set<(event: CollaborationEvent) => void>();

  /** Everyone except the current user — the list is "who else is here". */
  readonly others = computed(() => {
    const me = this.auth.username();
    return this.participants().filter(participant => participant.username !== me);
  });

  connect(documentId: number) {
    const token = this.auth.token();
    if (!token || this.client) return;

    this.documentId = documentId;
    this.client = new Client({
      brokerURL: this.brokerUrl(),
      // The handshake is a plain GET the browser cannot add headers to, so
      // the token travels in the CONNECT frame instead.
      connectHeaders: { Authorization: `Bearer ${token}` },
      reconnectDelay: 4000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      onConnect:    () => this.onConnected(),
      onDisconnect: () => this.connected.set(false),
      onWebSocketClose: () => this.onDropped(),
      // Collaboration is an enhancement: if the socket cannot be established
      // the viewer must keep working, so failures are noted and swallowed.
      onStompError: frame => console.warn('[collaboration]', frame.headers['message'])
    });
    this.client.activate();
  }

  disconnect() {
    this.client?.deactivate();
    this.client = null;
    this.connected.set(false);
    this.participants.set([]);
    this.cursors.set([]);
  }

  ngOnDestroy() {
    this.disconnect();
  }

  /**
   * Reports where this user's pointer is.
   *
   * <p>Throttled, and dropped entirely while disconnected: a cursor is only
   * meaningful live, so queueing them for later delivery would replay a
   * trail of stale positions on reconnect.
   */
  reportCursor(position: CursorPosition) {
    const now = Date.now();
    if (!this.connected() || now - this.lastCursorSentAt < CURSOR_THROTTLE_MS) return;
    this.lastCursorSentAt = now;
    this.publish(`/app/documents/${this.documentId}/cursor`, position);
  }

  /** Subscribes to document changes. Returns a function that unsubscribes. */
  onEvent(listener: (event: CollaborationEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Drops cursors nobody has moved recently. Called on a timer by the viewer. */
  pruneStaleCursors() {
    const cutoff = Date.now() - CURSOR_TIMEOUT_MS;
    this.cursors.update(current => {
      const live = current.filter(cursor => cursor.seenAt > cutoff);
      return live.length === current.length ? current : live;
    });
  }

  // ── Internals ────────────────────────────────────────────────

  private onConnected() {
    this.connected.set(true);
    this.client?.subscribe(`/topic/documents/${this.documentId}`,
      (message: IMessage) => this.handle(message));
    // Announce arrival only once subscribed, so the presence broadcast that
    // this join triggers is not missed by the client that caused it.
    this.publish(`/app/documents/${this.documentId}/join`, {});
  }

  private onDropped() {
    this.connected.set(false);
    // Presence and cursors are only true while connected; showing the last
    // known list would claim people are here who may well have left.
    this.participants.set([]);
    this.cursors.set([]);
  }

  private handle(message: IMessage) {
    try {
      this.applyEvent(JSON.parse(message.body) as CollaborationEvent);
    } catch {
      // A frame we cannot parse is not worth tearing the session down for.
    }
  }

  /**
   * Applies one event to local state and passes the rest on to listeners.
   *
   * <p>Public because the socket is not the only thing that should be able to
   * drive it — separating parsing from application is what makes the state
   * transitions testable without a broker.
   */
  applyEvent(event: CollaborationEvent) {
    if (event.type === 'PRESENCE') {
      this.participants.set(event.participants ?? []);
      return;
    }

    if (event.type === 'CURSOR') {
      this.trackCursor(event);
      return;
    }

    this.listeners.forEach(listener => listener(event));
  }

  private trackCursor(event: CollaborationEvent) {
    const { actor, cursor } = event;
    // A user's own pointer is already on screen; echoing it back would draw
    // a second one lagging behind the real one.
    if (!actor || !cursor || actor === this.auth.username()) return;

    const colour = this.participants().find(p => p.username === actor)?.colour ?? '#666';
    const updated: RemoteCursor = { ...cursor, username: actor, colour, seenAt: Date.now() };

    this.cursors.update(current => {
      const others = current.filter(existing => existing.username !== actor);
      return [...others, updated];
    });
  }

  private publish(destination: string, body: unknown) {
    if (!this.client?.connected) return;
    this.client.publish({ destination, body: JSON.stringify(body) });
  }

  /** Same host and scheme as the page, upgraded to ws/wss. */
  private brokerUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  }
}
