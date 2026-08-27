import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { CollaborationService, CollaborationEvent } from './collaboration.service';
import { AuthService } from './auth.service';
import { definitely } from '../../../testing/definitely';

/**
 * Exercised through applyEvent rather than a real broker: what matters is how
 * a frame changes local state, and a socket in the loop would only add
 * timing flakiness to assertions about that.
 */
describe('CollaborationService', () => {
  let collaboration: CollaborationService;
  let auth: AuthService;

  const ada   = { username: 'ada',   colour: '#1f77b4' };
  const grace = { username: 'grace', colour: '#d62728' };

  function presence(...participants: Array<{ username: string; colour: string }>): CollaborationEvent {
    return { type: 'PRESENCE', documentId: 7, participants };
  }

  function cursorFrom(actor: string, page = 1, x = 100, y = 200): CollaborationEvent {
    return { type: 'CURSOR', documentId: 7, actor, cursor: { page, x, y } };
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
        CollaborationService
      ]
    });
    collaboration = TestBed.inject(CollaborationService);
    auth = TestBed.inject(AuthService);
    // The signed-in user; their own cursor must never be echoed back at them.
    (auth as unknown as { _username: { set(v: string): void } })._username.set('ada');
  });

  afterEach(() => localStorage.clear());

  describe('presence', () => {
    it('records the participant list', () => {
      collaboration.applyEvent(presence(ada, grace));

      expect(collaboration.participants().map(p => p.username)).toEqual(['ada', 'grace']);
    });

    it('excludes the current user from "others"', () => {
      collaboration.applyEvent(presence(ada, grace));

      expect(collaboration.others().map(p => p.username)).toEqual(['grace']);
    });

    it('replaces the list rather than merging, so departures take effect', () => {
      collaboration.applyEvent(presence(ada, grace));
      collaboration.applyEvent(presence(ada));

      expect(collaboration.others()).toEqual([]);
    });
  });

  describe('cursors', () => {
    it('tracks another participant\'s pointer', () => {
      collaboration.applyEvent(presence(ada, grace));
      collaboration.applyEvent(cursorFrom('grace', 2, 50, 75));

      expect(collaboration.cursors()).toEqual([
        expect.objectContaining({ username: 'grace', page: 2, x: 50, y: 75, colour: '#d62728' })
      ]);
    });

    it('ignores the current user\'s own cursor', () => {
      // Their real pointer is already on screen; a second one would lag it.
      collaboration.applyEvent(presence(ada, grace));
      collaboration.applyEvent(cursorFrom('ada'));

      expect(collaboration.cursors()).toEqual([]);
    });

    it('keeps one cursor per person, at their latest position', () => {
      collaboration.applyEvent(presence(ada, grace));
      collaboration.applyEvent(cursorFrom('grace', 1, 10, 10));
      collaboration.applyEvent(cursorFrom('grace', 1, 90, 90));

      expect(collaboration.cursors()).toHaveLength(1);
      expect(collaboration.cursors()[0]).toEqual(
        expect.objectContaining({ x: 90, y: 90 }));
    });

    it('tracks several people at once', () => {
      collaboration.applyEvent(presence(ada, grace, { username: 'alan', colour: '#2ca02c' }));
      collaboration.applyEvent(cursorFrom('grace'));
      collaboration.applyEvent(cursorFrom('alan'));

      expect(collaboration.cursors().map(c => c.username).sort()).toEqual(['alan', 'grace']);
    });

    it('falls back to a neutral colour for someone not yet in the presence list', () => {
      // A cursor can arrive before the presence broadcast that introduces them.
      collaboration.applyEvent(cursorFrom('grace'));

      expect(definitely(collaboration.cursors()[0]).colour).toBe('#666');
    });

    it('drops cursors that have stopped moving', () => {
      collaboration.applyEvent(presence(ada, grace));
      collaboration.applyEvent(cursorFrom('grace'));

      collaboration.cursors.update(current =>
        current.map(cursor => ({ ...cursor, seenAt: Date.now() - 30_000 })));
      collaboration.pruneStaleCursors();

      expect(collaboration.cursors()).toEqual([]);
    });

    it('keeps cursors that moved recently', () => {
      collaboration.applyEvent(presence(ada, grace));
      collaboration.applyEvent(cursorFrom('grace'));
      collaboration.pruneStaleCursors();

      expect(collaboration.cursors()).toHaveLength(1);
    });
  });

  describe('document events', () => {
    it('passes annotation and version events to listeners', () => {
      const seen: CollaborationEvent[] = [];
      collaboration.onEvent(event => seen.push(event));

      collaboration.applyEvent({ type: 'ANNOTATION_CREATED', documentId: 7, actor: 'grace' });
      collaboration.applyEvent({
        type: 'VERSION_COMMITTED', documentId: 7, actor: 'grace',
        version: 3, summary: 'Recognised 2 page(s)'
      });

      expect(seen.map(e => e.type)).toEqual(['ANNOTATION_CREATED', 'VERSION_COMMITTED']);
    });

    it('does not route presence or cursor frames to listeners', () => {
      // Those drive the service's own signals; a listener seeing every
      // pointer move would be handed hundreds of events a minute.
      const seen: CollaborationEvent[] = [];
      collaboration.onEvent(event => seen.push(event));

      collaboration.applyEvent(presence(ada, grace));
      collaboration.applyEvent(cursorFrom('grace'));

      expect(seen).toEqual([]);
    });

    it('stops delivering once unsubscribed', () => {
      const seen: CollaborationEvent[] = [];
      const stop = collaboration.onEvent(event => seen.push(event));

      stop();
      collaboration.applyEvent({ type: 'ANNOTATION_DELETED', documentId: 7, annotationId: 1 });

      expect(seen).toEqual([]);
    });
  });

  describe('disconnecting', () => {
    it('clears presence and cursors, which are only true while connected', () => {
      collaboration.applyEvent(presence(ada, grace));
      collaboration.applyEvent(cursorFrom('grace'));

      collaboration.disconnect();

      expect(collaboration.participants()).toEqual([]);
      expect(collaboration.cursors()).toEqual([]);
      expect(collaboration.connected()).toBe(false);
    });
  });
});
