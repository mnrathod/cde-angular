/**
 * The converted drawing is rendered, not injected.
 *
 * It is our conversion service's rendering of a file a user uploaded, so its
 * text and its layer names come from that file. It used to reach the page
 * through `bypassSecurityTrustHtml`, which §5.12 bans, and which means every
 * one of those strings is markup in this application's origin.
 *
 * It now goes through `<img>`, where the browser renders an SVG in a
 * restricted mode: no scripts, no event handlers, no external references, no
 * reach into this document. Verified against Chromium directly before this was
 * written — the isolation is the browser's guarantee, and these tests hold the
 * component to using it.
 */
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { CadViewerComponent } from './cad-viewer.component';
import { ViewerStateService } from './viewer-state.service';

/** Shaped like the converter's output, with a script an attacker would add. */
const DRAWING = `<svg style="max-width:100%;display:block" width="800px" height="600px"
  viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">
  <script>window.__pwned = true;</script>
  <g data-layer="WALLS"><rect x="10" y="10" width="300" height="200"/></g>
  <g data-layer="NOTES"><rect x="350" y="10" width="300" height="200"/></g>
</svg>`;

/**
 * Captures what goes into each object URL.
 *
 * The blob is read where it is created rather than requested back from its
 * URL. A `blob:` request does not resolve in this test environment and yields
 * the string "undefined", so a test written that way would pass every
 * assertion about what is *not* in the drawing — which is exactly the shape of
 * bug this file exists for. It also keeps the package free of network calls,
 * which `viewer-core.boundary.spec.ts` asserts and which caught this.
 */
function captureDrawings() {
  const blobs: Blob[] = [];
  const create = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    blobs.push(blob as Blob);
    return `blob:captured-${blobs.length}`;
  });
  return {
    latest: () => {
      expect(blobs.length, 'nothing was published as an object URL').toBeGreaterThan(0);
      return blobs[blobs.length - 1]!.text();
    },
    restore: () => create.mockRestore(),
  };
}

function viewerShowing(svg: string) {
  TestBed.configureTestingModule({
    imports: [CadViewerComponent],
    providers: [ViewerStateService],
  });
  const fixture = TestBed.createComponent(CadViewerComponent);
  fixture.componentRef.setInput('svgContent', svg);
  fixture.detectChanges();
  return fixture;
}

/** The <img> exists and points at an object URL. */
function drawingImage(element: HTMLElement): HTMLImageElement {
  const image = element.querySelector('img');
  expect(image, 'no <img> — the drawing is not being rendered').not.toBeNull();
  expect(image!.getAttribute('src')).toMatch(/^blob:/);
  return image!;
}

describe('the CAD drawing is isolated from this document', () => {

  it('renders through an image rather than putting markup on the page', async () => {
    const fixture = viewerShowing(DRAWING);
    const host: HTMLElement = fixture.nativeElement;

    // The whole point: the drawing's elements are not in this document at all,
    // so there is nothing here for a sanitiser to have to get right.
    expect(host.querySelector('script')).toBeNull();
    expect(host.querySelector('svg [data-layer]')).toBeNull();
    drawingImage(host);
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
  });

  it('publishes the drawing whole, script and all, for the browser to isolate', async () => {
    // Nothing is stripped on the way out — the guarantee is the rendering
    // mode, not a filter. Asserting the script survives into the blob is how
    // this test says so, and it is only safe because of the test above.
    const captured = captureDrawings();
    viewerShowing(DRAWING);

    await expect(captured.latest()).resolves.toContain('<script>');
    captured.restore();
  });

  it('hides a layer with a rule inside the drawing, not with page CSS', async () => {
    // Page CSS cannot reach into an <img>'s document, so the rule has to
    // travel with the drawing. Asserted on the bytes that reach the browser.
    const captured = captureDrawings();
    const fixture = viewerShowing(DRAWING);

    fixture.componentInstance.layers.update((layers) =>
      layers.map((layer) => layer.name === 'NOTES' ? { ...layer, visible: false } : layer));
    fixture.detectChanges();

    const svg = await captured.latest();
    expect(svg).toContain('display: none');
    expect(svg).toContain('NOTES');
    captured.restore();
  });

  it('revokes the previous object URL when the drawing changes', () => {
    // A CAD drawing is megabytes. Without this, every layer toggle and every
    // document opened leaves one alive for the life of the tab.
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    const fixture = viewerShowing(DRAWING);
    const first = drawingImage(fixture.nativeElement).src;

    fixture.componentRef.setInput('svgContent',
      DRAWING.replace('WALLS', 'GRID'));
    fixture.detectChanges();

    expect(revoke).toHaveBeenCalledWith(first);
    revoke.mockRestore();
  });

  it('gives the image an accessible name naming the drawing layers', () => {
    // §1A.4: a drawing rendered as an image needs an equivalent in text, and
    // an empty alt on the only content of the screen is the worst of both.
    const fixture = viewerShowing(DRAWING);

    const alt = fixture.nativeElement.querySelector('img')!.getAttribute('alt');

    expect(alt).toContain('WALLS');
    expect(alt).toContain('NOTES');
  });
});
