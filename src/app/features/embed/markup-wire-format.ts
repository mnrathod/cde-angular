/**
 * Translation between the viewer's `ShapeData` and the protocol's `Markup`.
 *
 * These are deliberately different shapes, and this is the one place that
 * knows both. `models.ts` once flagged `documentId: number` as a wire decision
 * to revisit when the integration contract existed; it does now, and the
 * contract says opaque string ids, an `externalId` that belongs to the host,
 * and **no author** — the host stamps that from its own session (§6.2).
 *
 * Extracted from `EmbedSession` when that file reached §3.3's 400-line limit.
 * It earns its own file rather than being squeezed in: it is the only part of
 * the session with no session state, so it tests directly against the two
 * representations without a channel, a document, or a host.
 */
import { Injectable, inject } from '@angular/core';
import { MarkupEngineService } from '../../../viewer-core/markup-engine.service';
import type { ShapeData } from '../../../viewer-core/viewer-state.service';
import { Markup } from './embed-protocol';

@Injectable({ providedIn: 'root' })
export class MarkupWireFormat {

  private readonly markupEngine = inject(MarkupEngineService);

  /** What the viewer drew, as the host will store it. */
  toWire(shape: ShapeData, externalId: string | undefined): Markup {
    return {
      markupId: shape.id,
      externalId,
      page: shape.pageNumber,
      type: shape.tool.toUpperCase(),
      shapeData: this.markupEngine.shapesToJson([shape]),
      comment: shape.text ?? '',
      createdAt: shape.createdAt ?? new Date().toISOString(),
    };
  }

  /**
   * What the host stored, as the viewer will draw it.
   *
   * Host-supplied and therefore untrusted, even though we encoded it: it has
   * been through the host's storage since, and a parse failure must drop one
   * markup rather than lose the page. An empty result is how the caller counts
   * a rejection for `viewer.markupLoaded`.
   */
  fromWire(markup: Markup): ShapeData[] {
    try {
      return this.markupEngine.parseShapesJson(markup.shapeData)
        .map((shape) => ({ ...shape, id: markup.markupId, pageNumber: markup.page }));
    } catch {
      return [];
    }
  }
}
