import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { RemoteDocumentChanges } from './remote-document-changes';
import { AuthService } from '../../core/services/auth.service';
import {
  CollaborationEvent,
  CollaborationService,
} from '../../core/services/collaboration.service';
import { ViewerDocumentLoader } from './viewer-document-loader';
import { ViewerStateService } from '../../../viewer-core/viewer-state.service';

/**
 * Keeping an open document in step with what other people do to it.
 *
 * <p>The collaborators are stubbed rather than mocked wholesale, so each
 * case can say what arrived on the socket and then assert what the viewer
 * did about it. The socket itself is one function — `onEvent` hands back a
 * listener — which is what makes that possible without a broker.
 */
describe('applying what other people change', () => {
  let changes: RemoteDocumentChanges;
  let state: ViewerStateService;
  let emit: (event: CollaborationEvent) => void;

  /** What the stubbed collaborators were asked to do. */
  let connectedTo: number[];
  let disconnects: number;
  let unsubscribes: number;
  let pruned: number;
  let annotationsLoadedFor: number[];

  const me = 'sam.okonkwo';

  function event(partial: Partial<CollaborationEvent>): CollaborationEvent {
    return { type: 'PRESENCE', documentId: 7, ...partial } as CollaborationEvent;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    connectedTo = [];
    disconnects = 0;
    unsubscribes = 0;
    pruned = 0;
    annotationsLoadedFor = [];

    const collaboration = {
      connect: (documentId: number) => connectedTo.push(documentId),
      disconnect: () => { disconnects += 1; },
      pruneStaleCursors: () => { pruned += 1; },
      onEvent: (listener: (event: CollaborationEvent) => void) => {
        emit = listener;
        return () => { unsubscribes += 1; };
      },
    };

    TestBed.configureTestingModule({
      providers: [
        RemoteDocumentChanges,
        { provide: CollaborationService, useValue: collaboration },
        {
          provide: ViewerDocumentLoader,
          useValue: {
            loadAnnotations: (id: number) => annotationsLoadedFor.push(id),
          },
        },
        ViewerStateService,
        { provide: AuthService, useValue: { username: signal(me) } },
      ],
    });

    changes = TestBed.inject(RemoteDocumentChanges);
    state = TestBed.inject(ViewerStateService);
    state.documentId.set(7);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('opening and closing the connection', () => {
    it('connects to the document being watched', () => {
      changes.watch(7);

      expect(connectedTo).toEqual([7]);
    });

    it('disconnects when the viewer is left', () => {
      changes.watch(7);
      changes.stop();

      expect(disconnects).toBe(1);
    });

    it('stops listening when the viewer is left', () => {
      // Without this the listener outlives the viewer and keeps applying
      // events to a document nobody is looking at.
      changes.watch(7);
      changes.stop();

      expect(unsubscribes).toBe(1);
    });

    it('stops the cursor timer when the viewer is left', () => {
      changes.watch(7);
      changes.stop();
      const afterStop = pruned;

      vi.advanceTimersByTime(10_000);

      expect(pruned).toBe(afterStop);
    });

    it('survives being stopped without ever having been started', () => {
      // The shell tears down on destroy whether or not the document
      // finished loading, so this path is reachable.
      expect(() => changes.stop()).not.toThrow();
    });
  });

  describe('taking stale pointers off the page', () => {
    it('prunes them repeatedly rather than once', () => {
      changes.watch(7);

      vi.advanceTimersByTime(6_000);

      expect(pruned).toBeGreaterThanOrEqual(3);
    });

    it('does not prune before the first interval elapses', () => {
      changes.watch(7);

      vi.advanceTimersByTime(500);

      expect(pruned).toBe(0);
    });
  });

  describe('changes other people made to the annotations', () => {
    beforeEach(() => changes.watch(7));

    it.each([
      'ANNOTATION_CREATED',
      'ANNOTATION_UPDATED',
      'ANNOTATION_DELETED',
      'ANNOTATION_RESOLVED',
      'REPLY_ADDED',
    ])('reloads the annotations after %s', (type) => {
      emit(event({ type: type as CollaborationEvent['type'], actor: 'rowan.li' }));

      expect(annotationsLoadedFor).toEqual([7]);
    });

    it('re-reads the list rather than patching it from the payload', () => {
      // The choice recorded in the service: a reload cannot drift out of
      // step with the server, where a sequence of incremental patches can.
      emit(event({ type: 'ANNOTATION_DELETED', actor: 'rowan.li', annotationId: 99 }));

      expect(annotationsLoadedFor).toEqual([7]);
    });

    it('ignores an event this user caused', () => {
      // The local viewer already has the change. Reloading on it costs a
      // request per keystroke-sized edit and can overwrite work in flight.
      emit(event({ type: 'ANNOTATION_CREATED', actor: me }));

      expect(annotationsLoadedFor).toEqual([]);
    });

    it('still applies an event with no actor named', () => {
      // A server-originated change — a retention job, an import — has no
      // actor. Dropping those would leave the viewer stale.
      emit(event({ type: 'ANNOTATION_UPDATED' }));

      expect(annotationsLoadedFor).toEqual([7]);
    });

    it('does nothing for an event it does not handle', () => {
      emit(event({ type: 'PRESENCE', actor: 'rowan.li' }));

      expect(annotationsLoadedFor).toEqual([]);
    });
  });

  describe('someone replacing the document underneath you', () => {
    beforeEach(() => {
      changes.watch(7);
      state.currentVersion.set(4);
    });

    it('moves the viewer to the committed version', () => {
      emit(event({ type: 'VERSION_COMMITTED', actor: 'rowan.li', version: 5 }));

      expect(state.currentVersion()).toBe(5);
    });

    it('says who did it and what they did', () => {
      // The page changing under you with no explanation is alarming, which
      // is the whole reason this notice exists rather than a silent reload.
      emit(event({
        type: 'VERSION_COMMITTED',
        actor: 'rowan.li',
        version: 5,
        summary: 'Redacted 3 pages',
      }));

      expect(state.processingMessage()).toContain('rowan.li');
      expect(state.processingMessage()).toContain('Redacted 3 pages');
      expect(state.processingMessage()).toContain('5');
    });

    it('still says something when the server sent no summary', () => {
      emit(event({ type: 'VERSION_COMMITTED', actor: 'rowan.li', version: 5 }));

      expect(state.processingMessage()).not.toBe('');
      expect(state.processingMessage()).toContain('rowan.li');
    });

    it('holds the version it already had when none was sent', () => {
      emit(event({ type: 'VERSION_COMMITTED', actor: 'rowan.li' }));

      expect(state.currentVersion()).toBe(4);
    });

    it('ignores a commit this user made', () => {
      emit(event({ type: 'VERSION_COMMITTED', actor: me, version: 5 }));

      expect(state.currentVersion()).toBe(4);
      expect(state.processingMessage()).toBe('');
    });

    it('asks the viewer to re-read the bytes', () => {
      // The commit replaced the file. Moving the version number without
      // triggering a reload would leave the old pages on screen under a
      // new version label.
      const before = state.reloadToken();

      emit(event({ type: 'VERSION_COMMITTED', actor: 'rowan.li', version: 5 }));

      expect(state.reloadToken()).toBeGreaterThan(before);
    });
  });
});
