/**
 * Markup actually appears on the page.
 *
 * This is the demo's headline — draw on a document, the host stores it, reload,
 * the host hands it back and it reappears — and none of it happened. The
 * overlay bound `[innerHTML]` to a string of SVG, Angular's HTML sanitiser
 * strips SVG elements, and every shape was removed on its way to the DOM. The
 * protocol messages were all correct throughout, so the host's log looked
 * perfect while the page stayed blank.
 *
 * The fix renders primitives through attribute bindings, which is also the
 * only safe option here: markup arrives from the host, and a string built from
 * it and injected would run whatever the host put in it, on the viewer's
 * origin (§5.12 A03).
 */
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { EmbedViewerComponent } from './embed-viewer.component';
import { EmbedPageComponent } from './embed-page.component';
import { ViewerStateService } from '../../../viewer-core/viewer-state.service';
import { MarkupEngineService } from '../../../viewer-core/markup-engine.service';
import type { ShapeData, MarkupTool } from '../../../viewer-core/viewer-state.service';

function shapeOf(tool: MarkupTool): ShapeData {
  return {
    id: 'shape-1', tool, pageNumber: 1,
    color: '#ff0000', strokeWidth: 2, opacity: 0.2,
    x: 10, y: 20, width: 100, height: 50,
    x1: 10, y1: 20, x2: 110, y2: 70,
    points: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }],
  };
}

describe('markup the embed can hold', () => {

  const markup = new MarkupEngineService();

  it('draws something for every tool the embed offers', () => {
    // The toolbar and the renderer are two lists that must agree. A tool added
    // to the toolbar with no primitive here draws nothing at all, which looks
    // like a broken pointer rather than a missing case — so it fails here
    // instead, naming the tool.
    TestBed.configureTestingModule({ imports: [EmbedViewerComponent] });
    const toolbar = TestBed.createComponent(EmbedViewerComponent).componentInstance;
    const drawable = toolbar.tools
      .map((tool) => tool.id)
      .filter((id) => id !== 'pan');

    expect(drawable.length).toBeGreaterThan(0);
    for (const id of drawable) {
      expect(markup.shapeToPrimitives(shapeOf(id as MarkupTool)), `tool "${id}"`)
        .not.toHaveLength(0);
    }
  });

  it('puts the rectangle geometry on a rect primitive', () => {
    const primitives = markup.shapeToPrimitives(shapeOf('rect'));

    expect(primitives[0]).toMatchObject({
      kind: 'rect', x: 10, y: 20, width: 100, height: 50, stroke: '#ff0000',
    });
  });

  it('draws an arrow as a line and a head, not one element', () => {
    const primitives = markup.shapeToPrimitives(shapeOf('arrow'));

    expect(primitives.map((p) => p.kind)).toEqual(['line', 'polygon']);
  });

  it('draws markup made with a tool the embed does not offer', () => {
    // A host stores markup, and it may have been drawn in the full viewer with
    // a tool this toolbar has no button for. Handing it back should render it,
    // not silently drop it — the host is the record and the embed is a view of
    // it. Every tool draws since the renderer was shared with the full viewer;
    // markup-primitives.spec.ts is what holds that true for all of them.
    expect(markup.shapeToPrimitives(shapeOf('dimension'))).not.toHaveLength(0);
  });

  it('renders host-supplied values as attributes, never as markup', () => {
    // The point of the primitives: a colour is a string the host controls.
    // It ends up in an attribute binding, so this can only ever be a bad
    // colour — never an element, and never a script.
    const hostile = { ...shapeOf('rect'), color: '"><script>alert(1)</script>' };

    const primitives = markup.shapeToPrimitives(hostile);

    expect(primitives).toHaveLength(1);
    expect(primitives[0]).toMatchObject({
      kind: 'rect', stroke: '"><script>alert(1)</script>',
    });
  });

  it('paints the shape into the rendered overlay, not just into a signal', () => {
    // Asserted on the DOM, because the strip that caused this bug happened
    // between the signal and the page: the component held the right shapes
    // the whole time and the browser showed none of them. A test of the
    // signal would have passed throughout.
    TestBed.configureTestingModule({
      imports: [EmbedPageComponent],
      providers: [ViewerStateService],
    });
    const state = TestBed.inject(ViewerStateService);
    const fixture = TestBed.createComponent(EmbedPageComponent);
    fixture.componentRef.setInput('pageNumber', 1);
    fixture.componentRef.setInput('zoom', 1);
    fixture.detectChanges();

    state.addShape(shapeOf('rect'));
    fixture.detectChanges();

    const rect: SVGRectElement | null = fixture.nativeElement.querySelector('svg rect');
    expect(rect).not.toBeNull();
    expect(rect!.getAttribute('x')).toBe('10');
    expect(rect!.getAttribute('width')).toBe('100');
    expect(rect!.getAttribute('stroke')).toBe('#ff0000');
  });

  it('keeps a hostile colour an attribute value, in the real DOM', () => {
    TestBed.configureTestingModule({
      imports: [EmbedPageComponent],
      providers: [ViewerStateService],
    });
    const state = TestBed.inject(ViewerStateService);
    const fixture = TestBed.createComponent(EmbedPageComponent);
    fixture.componentRef.setInput('pageNumber', 1);
    fixture.componentRef.setInput('zoom', 1);
    fixture.detectChanges();

    state.addShape({ ...shapeOf('rect'), color: '"><script>alert(1)</script>' });
    fixture.detectChanges();

    const overlay: HTMLElement = fixture.nativeElement;
    expect(overlay.querySelector('script')).toBeNull();
    expect(overlay.querySelector('svg rect')!.getAttribute('stroke'))
      .toBe('"><script>alert(1)</script>');
  });
});
