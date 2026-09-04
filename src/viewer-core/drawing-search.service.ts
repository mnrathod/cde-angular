import { Injectable } from '@angular/core';
import { SearchResult } from './viewer-state.service';

/** A run of text in a drawing, with where it sits in the drawing's own space. */
export interface DrawingTextItem {
  text: string;
  /**
   * Left edge, not the SVG's anchor point. Converters centre nearly every
   * label with `text-anchor="middle"`, so taking the `x` attribute at face
   * value marks a box starting halfway through the words it is meant to
   * frame.
   */
  x: number;
  /** Baseline, as the SVG gives it. */
  y: number;
  /** Approximate extent, used to frame the match when it is navigated to. */
  width:  number;
  height: number;
}

/** A match, carrying the place to look as well as the text that matched. */
export interface DrawingMatch extends SearchResult {
  item: DrawingTextItem;
}

/**
 * Finding text in a converted CAD drawing.
 *
 * Search used to run only against a PDF's text layer and give up the moment
 * there was no PDF document — silently, so a DWG or DXF answered every query
 * with "No matches found" whether the words were on the drawing or not. A
 * converted drawing does carry its text: the SVG holds it in `<text>`
 * elements, which is exactly what a title block, a room name or a drawing
 * number is made of.
 */
@Injectable({ providedIn: 'root' })
export class DrawingSearchService {

  /**
   * Pull every run of text out of a drawing, with its position.
   *
   * Reads `textContent`, so a label broken into `<tspan>`s — which is how most
   * converters emit multi-line text — is indexed as the one phrase a reader
   * sees rather than as unsearchable fragments.
   */
  extractText(svgContent: string): DrawingTextItem[] {
    if (!svgContent) return [];

    const doc = new DOMParser().parseFromString(svgContent, 'image/svg+xml');
    if (doc.querySelector('parsererror')) return [];

    const items: DrawingTextItem[] = [];
    for (const element of Array.from(doc.querySelectorAll('text'))) {
      const text = this.normalise(element.textContent ?? '');
      if (!text) continue;

      // A <text> may carry its position on itself or on its first <tspan>.
      const positioned = element.hasAttribute('x') ? element
                       : element.querySelector('tspan') ?? element;
      const x = parseFloat(positioned.getAttribute('x') ?? '');
      const y = parseFloat(positioned.getAttribute('y') ?? '');
      if (!isFinite(x) || !isFinite(y)) continue;

      const fontSize = parseFloat(element.getAttribute('font-size') ?? '') || 12;
      // The glyphs are not measurable without laying the text out, so this is
      // an estimate — enough to frame the match, not to hit-test it.
      const width = text.length * fontSize * 0.6;

      items.push({
        text,
        x: this.leftEdge(x, width, this.anchorOf(element)),
        y,
        width,
        height: fontSize * 1.2,
      });
    }
    return items;
  }

  /**
   * Every match for `query`, in drawing order.
   *
   * Matching ignores case and treats any run of whitespace as a single space,
   * so a phrase split across lines in the drawing — the normal shape of a
   * title block — is still found by typing it as one line.
   */
  search(items: ReadonlyArray<DrawingTextItem>, query: string): DrawingMatch[] {
    const needle = this.normalise(query).toLowerCase();
    if (!needle) return [];

    const matches: DrawingMatch[] = [];
    for (const item of items) {
      const haystack = item.text.toLowerCase();
      let from = 0;
      let at = haystack.indexOf(needle, from);
      while (at !== -1) {
        matches.push({
          pageIndex:  1,          // a drawing is a single sheet
          matchIndex: at,
          text:       item.text,
          item,
        });
        from = at + 1;
        at = haystack.indexOf(needle, from);
      }
    }
    return matches;
  }

  /** Collapses whitespace so a wrapped label reads as one phrase. */
  private normalise(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  /**
   * The element's effective `text-anchor`. Walked up the tree because a
   * converter commonly sets it once on a group rather than on each label.
   */
  private anchorOf(element: Element): string {
    return element.closest('[text-anchor]')?.getAttribute('text-anchor') ?? 'start';
  }

  /** Turns an anchor point into the left edge of the text it positions. */
  private leftEdge(anchorX: number, width: number, anchor: string): number {
    if (anchor === 'middle') return anchorX - width / 2;
    if (anchor === 'end')    return anchorX - width;
    return anchorX;
  }
}
