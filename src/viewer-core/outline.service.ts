import { Injectable } from '@angular/core';

/** One entry in a document's outline, with its children. */
export interface OutlineEntry {
  title:    string;
  /** Page this entry points at, or null when the destination cannot be resolved. */
  page:     number | null;
  depth:    number;
  children: OutlineEntry[];
}

/** A link on a page: either a jump within the document or a URL. */
export interface PageLink {
  /** Position in PDF page coordinates, bottom-left origin. */
  x:      number;
  y:      number;
  width:  number;
  height: number;
  /** Set for an internal jump. */
  page?:  number;
  /** Set for an external link. */
  url?:   string;
}

/** Only http(s) and mailto are followed; see {@link OutlineService.isSafeUrl}. */
const FOLLOWABLE_SCHEMES = ['http:', 'https:', 'mailto:'];

/**
 * Reads a PDF's outline (bookmarks) and its link annotations.
 *
 * <p>pdf.js exposes both and neither was being used: a specification with a
 * hundred sections offered no way to reach one except scrolling, and every
 * cross-reference and URL in every document was dead.
 *
 * <p>Destinations are resolved to page numbers here rather than in the
 * component, because that resolution is two indirections deep — a named
 * destination resolves to an explicit destination, whose first element is a
 * page reference that only the document can turn into an index.
 */
@Injectable({ providedIn: 'root' })
export class OutlineService {

  /**
   * The document's bookmark tree, flattened destinations resolved to pages.
   *
   * @returns an empty array when the document has no outline, which most
   *          drawings do not
   */
  async getOutline(pdfDoc: any): Promise<OutlineEntry[]> {
    const raw = await pdfDoc.getOutline?.();
    if (!raw?.length) return [];
    return this.convert(pdfDoc, raw, 0);
  }

  private async convert(pdfDoc: any, items: any[], depth: number): Promise<OutlineEntry[]> {
    const entries: OutlineEntry[] = [];
    for (const item of items) {
      entries.push({
        title:    item.title?.trim() || '(untitled)',
        page:     await this.resolvePage(pdfDoc, item.dest),
        depth,
        children: item.items?.length ? await this.convert(pdfDoc, item.items, depth + 1) : []
      });
    }
    return entries;
  }

  /**
   * Turns a destination into a 1-based page number.
   *
   * @returns null when the destination is missing or names a page the
   *          document does not have — a broken bookmark should be shown as
   *          unclickable, not silently sent to page 1
   */
  async resolvePage(pdfDoc: any, dest: unknown): Promise<number | null> {
    try {
      const explicit = typeof dest === 'string'
        ? await pdfDoc.getDestination(dest)
        : dest;
      if (!Array.isArray(explicit) || !explicit.length) return null;

      const index = await pdfDoc.getPageIndex(explicit[0]);
      return index >= 0 ? index + 1 : null;
    } catch {
      return null;
    }
  }

  /**
   * Links on a page, in PDF page coordinates.
   *
   * @param page a pdf.js page proxy
   */
  async getPageLinks(pdfDoc: any, page: any): Promise<PageLink[]> {
    let annotations: any[];
    try {
      annotations = await page.getAnnotations({ intent: 'display' });
    } catch {
      return [];
    }

    const links: PageLink[] = [];
    for (const annotation of annotations) {
      if (annotation.subtype !== 'Link') continue;

      const rect = annotation.rect;
      if (!Array.isArray(rect) || rect.length < 4) continue;

      const link: PageLink = {
        x:      Math.min(rect[0], rect[2]),
        y:      Math.min(rect[1], rect[3]),
        width:  Math.abs(rect[2] - rect[0]),
        height: Math.abs(rect[3] - rect[1])
      };

      if (annotation.url && this.isSafeUrl(annotation.url)) {
        link.url = annotation.url;
      } else if (annotation.dest) {
        const target = await this.resolvePage(pdfDoc, annotation.dest);
        if (target) link.page = target;
      }

      // A link that goes nowhere is not worth drawing.
      if (link.url || link.page) links.push(link);
    }
    return links;
  }

  /**
   * Whether a URL from a document may be opened.
   *
   * <p>A PDF is untrusted input and its links are attacker-controlled;
   * `javascript:` and `file:` targets in particular must never be followed
   * just because a document asked.
   */
  isSafeUrl(url: string): boolean {
    // Resolved against the page so relative targets are understood — which
    // also means a blank string would resolve to the current page and look
    // safe, so it is rejected before parsing.
    if (!url?.trim()) return false;
    try {
      return FOLLOWABLE_SCHEMES.includes(new URL(url, window.location.href).protocol);
    } catch {
      return false;
    }
  }
}
