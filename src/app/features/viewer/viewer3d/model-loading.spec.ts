import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { describe, it, expect, beforeEach } from 'vitest';

import { ModelLoading } from './model-loading';
import { ViewerService } from '../../../core/services/viewer.service';
import { ModelGeometry } from '../../../../viewer-core/model-geometry';


/**
 * Fetching a model's geometry, and explaining it when there is none.
 *
 * <p>The geometry route answers with bytes when it could extract a model and
 * with JSON when it could not, so almost every case here is about the second
 * answer: which of six explanations a reader gets, and whether it tells them
 * what to do. Those sentences are the product, for anyone whose file will
 * not open.
 */
describe('opening a 3D model', () => {
  let loading: ModelLoading;
  let viewer: {
    getModelGeometry: (id: number) => unknown;
    get3DData: (id: number) => unknown;
  };

  function geometryResponse(contentType: string, body: ArrayBuffer | null) {
    return of({ headers: { get: () => contentType }, body });
  }

  /**
   * A real container, built the way the conversion service writes one.
   *
   * <p>Built here rather than decoded from a fixture so a single field can
   * be made wrong on purpose, and decoded by the real reader rather than a
   * stub — a stubbed decoder would only prove that a stub throws when told
   * to.
   */
  function container(): ArrayBuffer {
    const header = new TextEncoder().encode(JSON.stringify({
      vertexCount: 3, triangleCount: 1,
      groups: [{ type: 'IfcWall', start: 0, count: 3, elementCount: 1,
                 color: [1, 1, 1], opacity: 1 }],
    }));
    const padding = ((-header.length) % 4 + 4) % 4;
    const buffer = new ArrayBuffer(12 + header.length + padding + (9 + 9 + 3) * 4);
    const view = new DataView(buffer);

    new Uint8Array(buffer, 0, 4).set(new TextEncoder().encode('CDEG'));
    view.setUint32(4, 1, true);
    view.setUint32(8, header.length, true);
    new Uint8Array(buffer, 12, header.length).set(header);
    return buffer;
  }

  /** Bytes that are not a container at all. */
  function notAContainer(): ArrayBuffer {
    const buffer = new ArrayBuffer(32);
    new Uint8Array(buffer, 0, 4).set(new TextEncoder().encode('%PDF'));
    return buffer;
  }

  beforeEach(() => {
    viewer = {
      getModelGeometry: () => geometryResponse('application/octet-stream', container()),
      get3DData: () => of({ success: true }),
    };

    TestBed.configureTestingModule({
      providers: [ModelLoading, { provide: ViewerService, useValue: viewer }],
    });
    loading = TestBed.inject(ModelLoading);
  });

  describe('a model that opens', () => {
    it('hands the decoded geometry to the caller', () => {
      let received: ModelGeometry | null = null;

      loading.fetch(1, (geometry) => { received = geometry; });

      expect(received).not.toBeNull();
    });

    it('says it is building the scene once the bytes have decoded', () => {
      loading.fetch(1, () => {});

      expect(loading.progress()).toContain('Building');
    });

    it('is still loading until the scene says otherwise', () => {
      // The service cannot know when the canvas has finished; the component
      // tells it. Clearing the flag on decode would hide the progress
      // message while the scene was still assembling.
      loading.fetch(1, () => {});

      expect(loading.loading()).toBe(true);
    });

    it('stops loading when the scene reports itself up', () => {
      loading.fetch(1, () => {});
      loading.finished();

      expect(loading.loading()).toBe(false);
    });

    it('says nothing went wrong', () => {
      loading.fetch(1, () => {});

      expect(loading.errorMsg()).toBe('');
    });
  });

  describe('bytes that arrived but could not be read', () => {
    beforeEach(() => {
      viewer.getModelGeometry = () =>
        geometryResponse('application/octet-stream', notAContainer());
    });

    it('does not build a scene from geometry it could not decode', () => {
      let called = false;

      loading.fetch(1, () => { called = true; });

      expect(called).toBe(false);
    });

    it('suggests converting the model again', () => {
      loading.fetch(1, () => {});

      expect(loading.errorMsg()).toContain('converting it again');
    });

    it('says nothing about the byte offset that disagreed', () => {
      // The exception names an offset in the container format, which is
      // exactly nothing to a reader (§1.4).
      loading.fetch(1, () => {});

      expect(loading.errorMsg()).not.toContain('offset');
      expect(loading.errorMsg()).not.toContain('CDEG');
    });

    it('stops loading rather than spinning forever', () => {
      loading.fetch(1, () => {});

      expect(loading.loading()).toBe(false);
    });
  });

  describe('a document that produced no geometry', () => {
    function answeringWithJson(data: Record<string, unknown>) {
      viewer.getModelGeometry = () => geometryResponse('application/json', container());
      viewer.get3DData = () => of(data);
    }

    it('tells a Revit user exactly how to export', () => {
      // The single most common case, and the one where a generic "cannot
      // open this format" sends somebody to look for a bug that is not
      // there.
      answeringWithJson({ type: 'revit_binary' });

      loading.fetch(1, () => {});

      expect(loading.errorMsg()).toContain('Revit');
      expect(loading.errorMsg()).toContain('IFC');
    });

    it('passes on the converter’s own reason when it gave one', () => {
      // It knows which stage failed; this does not.
      answeringWithJson({ success: false, error: 'Geometry extraction timed out.' });

      loading.fetch(1, () => {});

      expect(loading.errorMsg()).toContain('timed out');
    });

    it('explains a failed conversion that came with no reason', () => {
      answeringWithJson({ success: false });

      loading.fetch(1, () => {});

      expect(loading.errorMsg()).toContain('could not be prepared');
    });

    it('explains a format it simply cannot open', () => {
      answeringWithJson({ success: true, type: 'dwg' });

      loading.fetch(1, () => {});

      expect(loading.errorMsg()).toContain('cannot be opened');
    });

    it('explains an answer with nothing useful in it at all', () => {
      answeringWithJson({});

      loading.fetch(1, () => {});

      expect(loading.errorMsg()).not.toBe('');
    });

    it('treats an empty body as no geometry, not as a model', () => {
      // A response claiming octet-stream with no body would otherwise be
      // handed to the decoder and fail as a corrupt file, which blames the
      // document for a server that sent nothing.
      viewer.getModelGeometry = () =>
        geometryResponse('application/octet-stream', null);
      viewer.get3DData = () => of({ type: 'revit_binary' });

      loading.fetch(1, () => {});

      expect(loading.errorMsg()).toContain('Revit');
    });

    it('stops loading once it has an explanation', () => {
      answeringWithJson({ success: false });

      loading.fetch(1, () => {});

      expect(loading.loading()).toBe(false);
    });
  });

  describe('a request that failed outright', () => {
    it('explains a geometry request that never returned', () => {
      viewer.getModelGeometry = () => throwError(() => ({ status: 500 }));

      loading.fetch(1, () => {});

      expect(loading.errorMsg()).toContain('could not be opened');
      expect(loading.loading()).toBe(false);
    });

    it('prefers the server’s sentence to its own', () => {
      viewer.getModelGeometry = () =>
        throwError(() => ({ status: 404, error: { detail: 'That revision was superseded.' } }));

      loading.fetch(1, () => {});

      expect(loading.errorMsg()).toContain('superseded');
    });

    it('explains a follow-up request that failed too', () => {
      // The path where the first answer said "no geometry" and the second
      // request, asking why, also failed. Leaving this silent shows an
      // empty canvas with no message at all.
      viewer.getModelGeometry = () => geometryResponse('application/json', container());
      viewer.get3DData = () => throwError(() => ({ status: 503 }));

      loading.fetch(1, () => {});

      expect(loading.errorMsg()).not.toBe('');
      expect(loading.loading()).toBe(false);
    });
  });
});
