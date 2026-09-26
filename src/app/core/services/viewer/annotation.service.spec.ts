import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting }
  from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { AnnotationService } from './annotation.service';
import { Annotation, AnnotationType } from '../../models';
import { ShapeData, MarkupTool } from '../../../../viewer-core/viewer-state.service';

/**
 * Turning drawn shapes into stored markup, and back again.
 *
 * <p>The conversion in both directions is where this service earns its
 * keep, and where it can lose work silently. A shape whose `shapeData` will
 * not parse has to come back as nothing rather than as an exception — a
 * single bad row would otherwise take out the whole markup layer and lose
 * every other annotation on the page with it.
 *
 * <p>The tool-to-type mapping is the other half. The file carries a comment
 * about a defect it has already had: a sticky note and a text box both
 * mapped to `COMMENT`, so a note exported and reimported came back as text.
 * That mapping is asserted per tool here so it cannot happen again in the
 * other direction.
 */
describe('storing and restoring markup', () => {
  let annotations: AnnotationService;
  let httpMock: HttpTestingController;

  function annotation(fields: Partial<Annotation> = {}): Annotation {
    return {
      id: 1, documentId: 7, authorName: 'sam.okonkwo',
      type: 'MARKUP' as AnnotationType,
      shapeData: JSON.stringify({ tool: 'rect', x: 1, y: 2, width: 3, height: 4 }),
      comment: '', pageNumber: 1, status: 'OPEN',
      createdAt: '2026-03-04T10:00:00Z',
      ...fields,
    } as Annotation;
  }

  function shape(tool: MarkupTool, fields: Partial<ShapeData> = {}): ShapeData {
    return {
      id: 'shape-1', tool, pageNumber: 1,
      color: '#ff0000', strokeWidth: 2, opacity: 0.25,
      x: 10, y: 20, width: 30, height: 40,
      ...fields,
    };
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), AnnotationService],
    });
    annotations = TestBed.inject(AnnotationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('reading stored markup back as a shape', () => {

    it('restores a shape that was stored as one', () => {
      const restored = annotations.annotationToShape(annotation());

      expect(restored?.tool).toBe('rect');
      expect(restored?.width).toBe(3);
    });

    it('remembers which stored annotation the shape came from', () => {
      // Without this the next save creates a second annotation instead of
      // updating the one on screen, and the markup doubles.
      const restored = annotations.annotationToShape(annotation({ id: 88 }));

      expect(restored?.savedId).toBe(88);
    });

    it('returns nothing for markup whose shape will not parse', () => {
      // A single bad row must not take the layer down. Throwing here loses
      // every other annotation on the page along with the broken one.
      const restored = annotations.annotationToShape(
        annotation({ shapeData: 'not json at all' }));

      expect(restored).toBeNull();
    });

    it('returns nothing for markup with no shape stored', () => {
      const restored = annotations.annotationToShape(
        annotation({ shapeData: undefined as unknown as string }));

      expect(restored).toBeNull();
    });

    it('reads an older row that stored only a rectangle', () => {
      // Rows written before shapes carried a tool. Converting them is what
      // keeps markup drawn a year ago visible today.
      const restored = annotations.annotationToShape(annotation({
        shapeData: JSON.stringify({ x: 5, y: 6, width: 70, height: 80 }),
        pageNumber: 3,
      }));

      expect(restored?.tool).toBe('rect');
      expect(restored?.x).toBe(5);
      expect(restored?.width).toBe(70);
      expect(restored?.pageNumber).toBe(3);
    });

    it('gives an older row a sensible box when it recorded no size', () => {
      // Zero width would restore markup nobody can see or click, which
      // reads as the annotation having been lost.
      const restored = annotations.annotationToShape(
        annotation({ shapeData: JSON.stringify({}) }));

      expect(restored?.width).toBe(100);
      expect(restored?.height).toBe(100);
    });

    it('puts an older row on page one when it recorded no page', () => {
      const restored = annotations.annotationToShape(annotation({
        shapeData: JSON.stringify({ x: 1, y: 1 }),
        pageNumber: undefined as unknown as number,
      }));

      expect(restored?.pageNumber).toBe(1);
    });

    it('keeps the author and the date from an older row', () => {
      const restored = annotations.annotationToShape(annotation({
        shapeData: JSON.stringify({ x: 1, y: 1 }),
        authorName: 'rowan.li', createdAt: '2025-01-02T03:04:05Z',
      }));

      expect(restored?.author).toBe('rowan.li');
      expect(restored?.createdAt).toBe('2025-01-02T03:04:05Z');
    });

    it('converts a whole page of markup at once', () => {
      const shapes = annotations.annotationsToShapes([
        annotation({ id: 1 }), annotation({ id: 2 }),
      ]);

      expect(shapes.map((each) => each.savedId)).toEqual([1, 2]);
    });

    it('drops the rows it cannot read and keeps the rest', () => {
      // The behaviour that matters on a page with one corrupt annotation:
      // the other nine still draw.
      const shapes = annotations.annotationsToShapes([
        annotation({ id: 1 }),
        annotation({ id: 2, shapeData: '{{{' }),
        annotation({ id: 3 }),
      ]);

      expect(shapes.map((each) => each.savedId)).toEqual([1, 3]);
    });

    it('returns an empty list for a page with no markup', () => {
      expect(annotations.annotationsToShapes([])).toEqual([]);
    });
  });

  describe('saving shapes as markup', () => {

    it('sends nothing at all when there is nothing to save', () => {
      let result: Annotation[] | null = null;
      annotations.saveShapes(7, []).subscribe((saved) => { result = saved; });

      httpMock.verify();
      expect(result).toEqual([]);
    });

    it('creates markup for a shape that has never been saved', () => {
      annotations.saveShapes(7, [shape('rect')]).subscribe();

      const request = httpMock.expectOne('/api/annotations');
      expect(request.request.method).toBe('POST');
      request.flush(annotation());
    });

    it('updates the existing markup for a shape that has', () => {
      // Creating instead would leave two annotations where the user sees
      // one, and the older would never be cleaned up.
      annotations.saveShapes(7, [shape('rect', { savedId: 42 })]).subscribe();

      const request = httpMock.expectOne('/api/annotations/42');
      expect(request.request.method).toBe('PUT');
      request.flush(annotation({ id: 42 }));
    });

    it('sends the shape as its own stored form', () => {
      annotations.saveShapes(7, [shape('circle', { cx: 5, cy: 6, r: 7 })]).subscribe();

      const request = httpMock.expectOne('/api/annotations');
      const body = request.request.body as { shapeData: string };
      expect(JSON.parse(body.shapeData).tool).toBe('circle');
      request.flush(annotation());
    });

    it('sends the shape’s own text as the comment', () => {
      annotations.saveShapes(7, [shape('note', { text: 'Check this level' })])
        .subscribe();

      const request = httpMock.expectOne('/api/annotations');
      expect((request.request.body as { comment: string }).comment)
        .toBe('Check this level');
      request.flush(annotation());
    });

    it('sends an empty comment rather than undefined for a shape with no text', () => {
      annotations.saveShapes(7, [shape('rect')]).subscribe();

      const request = httpMock.expectOne('/api/annotations');
      expect((request.request.body as { comment: string }).comment).toBe('');
      request.flush(annotation());
    });

    it('saves every shape on the page', () => {
      annotations.saveShapes(7, [shape('rect'), shape('circle'), shape('line')])
        .subscribe();

      expect(httpMock.match('/api/annotations')).toHaveLength(3);
    });

    it('keeps each shape on the page it was drawn on', () => {
      annotations.saveShapes(7, [shape('rect', { pageNumber: 4 })]).subscribe();

      const request = httpMock.expectOne('/api/annotations');
      expect((request.request.body as { pageNumber: number }).pageNumber).toBe(4);
      request.flush(annotation());
    });
  });

  describe('which kind of markup a tool becomes', () => {

    function typeSentFor(tool: MarkupTool): AnnotationType {
      annotations.saveShapes(7, [shape(tool)]).subscribe();
      const request = httpMock.expectOne('/api/annotations');
      const type = (request.request.body as { type: AnnotationType }).type;
      request.flush(annotation());
      return type;
    }

    it('keeps a sticky note and a text box apart', () => {
      // The defect this file's own comment records: both mapped to COMMENT,
      // so a note exported and reimported came back as text and vice versa.
      expect(typeSentFor('note')).toBe('COMMENT');
      expect(typeSentFor('text')).toBe('MARKUP');
    });

    it.each([
      ['highlight', 'HIGHLIGHT'], ['stamp', 'STAMP'], ['dimension', 'DIMENSION'],
      ['cloud', 'CLOUD'], ['arrow', 'ARROW'], ['underline', 'UNDERLINE'],
      ['strikeout', 'STRIKEOUT'], ['squiggly', 'SQUIGGLY'],
    ] as Array<[MarkupTool, AnnotationType]>)(
      'stores %s as %s', (tool, type) => {
        expect(typeSentFor(tool)).toBe(type);
      });

    it.each(['rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line',
             'freehand', 'callout', 'redact'] as MarkupTool[])(
      'stores %s as generic markup, with the tool in its shape', (tool) => {
        // The backend dispatches the concrete shape from `shapeData.tool`,
        // so these need no type of their own — but they must not borrow
        // somebody else's.
        expect(typeSentFor(tool)).toBe('MARKUP');
      });
  });

  describe('the plain requests', () => {

    it('loads a document’s markup', () => {
      annotations.loadAnnotations(7).subscribe();

      const request = httpMock.expectOne('/api/annotations/document/7');
      expect(request.request.method).toBe('GET');
      request.flush([]);
    });

    it('deletes one piece of markup', () => {
      annotations.deleteAnnotation(9).subscribe();

      const request = httpMock.expectOne('/api/annotations/9');
      expect(request.request.method).toBe('DELETE');
      request.flush(null);
    });

    it('resolves one piece of markup', () => {
      annotations.resolveAnnotation(9).subscribe();

      const request = httpMock.expectOne('/api/annotations/9/resolve');
      expect(request.request.method).toBe('PATCH');
      request.flush(annotation());
    });

    it('asks for a document’s replies in one request', () => {
      annotations.loadRepliesForDocument(7).subscribe();

      const request = httpMock.expectOne('/api/annotations/document/7/replies');
      expect(request.request.method).toBe('GET');
      request.flush([]);
    });

    it('posts a reply into a thread', () => {
      annotations.addReply(9, 'Agreed').subscribe();

      const request = httpMock.expectOne('/api/annotations/9/replies');
      expect(request.request.body).toEqual({ content: 'Agreed' });
      request.flush({});
    });

    it('exports markup as a file rather than as JSON', () => {
      // XFDF is the interchange format, and it is downloaded. Parsing the
      // response as JSON would corrupt it.
      annotations.exportXfdf(7).subscribe();

      const request = httpMock.expectOne('/api/annotations/document/7/xfdf');
      expect(request.request.responseType).toBe('blob');
      request.flush(new Blob(['<xfdf/>']));
    });

    it('imports markup as a multipart upload', () => {
      const file = new File(['<xfdf/>'], 'markup.xfdf');
      annotations.importXfdf(7, file).subscribe();

      const request = httpMock.expectOne('/api/annotations/document/7/xfdf');
      expect(request.request.body).toBeInstanceOf(FormData);
      expect((request.request.body as FormData).get('file')).toBe(file);
      request.flush([]);
    });
  });
});
