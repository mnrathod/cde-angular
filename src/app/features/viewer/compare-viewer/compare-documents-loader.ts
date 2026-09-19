/**
 * Fetching the two documents a visual comparison puts side by side.
 *
 * <p>Out of the component because it was ninety lines of nested subscribes
 * inside a `new Promise`, in a component whose job is to draw two canvases.
 *
 * <p>It was also fetching the wrong thing. The PDF bytes were requested from
 * `/api/viewer/{id}` with `responseType: 'arraybuffer'` — but that route
 * returns the document's JSON metadata, and the bytes live at
 * `/api/viewer/{id}/pdf`. pdf.js was being handed a JSON document to open,
 * so the comparison never rendered a PDF at all. The viewer shell has always
 * used the right route; this copy did not.
 */
import { Injectable, inject, signal } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";

import { Document } from "../../../core/models";
import { problemMessage } from "../../../core/handlers/problem-detail";
import { PdfEngineService } from "../../../../viewer-core/pdf-engine.service";

/** One side of a comparison: what the document is, and its pages. */
export interface ComparedDocument {
  document: Document;
  /** The opened PDF, absent for a document that is not one. */
  pdfDoc?: any;
}

@Injectable()
export class CompareDocumentsLoader {
  private http = inject(HttpClient);
  private engine = inject(PdfEngineService);

  readonly loading = signal(true);
  readonly progress = signal(
    $localize`:Progress message while both drawings are being fetched@@visualCompare.loading:Loading drawings...`,
  );
  readonly errorMsg = signal("");

  /** Both documents, or an explanation of why neither arrived. */
  async load(
    firstId: number,
    secondId: number,
  ): Promise<[ComparedDocument, ComparedDocument] | null> {
    this.loading.set(true);
    this.errorMsg.set("");
    await this.engine.ensureLoaded();

    try {
      const pair = await Promise.all([
        this.fetchOne(firstId),
        this.fetchOne(secondId),
      ]);
      this.loading.set(false);
      return pair;
    } catch (err: unknown) {
      // The spinner used to keep turning beside the failure message, so a
      // comparison that had already given up still looked like it was
      // working.
      this.loading.set(false);
      this.errorMsg.set(
        problemMessage(
          err,
          $localize`:Shown when the two drawings cannot be loaded for comparison@@visualCompare.loadFailed:These drawings could not be loaded for comparison. Try again, and quote any reference shown here to support.`,
        ),
      );
      return null;
    }
  }

  private async fetchOne(id: number): Promise<ComparedDocument> {
    const data = await firstValueFrom(
      this.http.get<any>(`/api/viewer/${id}`),
    );
    const document = documentFrom(id, data);

    if (data.type !== "pdf" && !data.pdfUrl) return { document };

    // The bytes, from the route that serves bytes.
    const bytes = await firstValueFrom(
      this.http.get(data.pdfUrl || `/api/viewer/${id}/pdf`, {
        responseType: "arraybuffer",
      }),
    );
    return { document, pdfDoc: await this.engine.openDocument(bytes) };
  }
}

/**
 * The document record the comparison header shows.
 *
 * <p>Only the fields the header reads are taken from the response; the rest
 * are filled so the shared `Document` type is satisfied. A comparison never
 * shows a file size or a status, so nothing here pretends to know them.
 */
function documentFrom(id: number, data: any): Document {
  return {
    id,
    name: data.name || "",
    fileName: data.fileName || "",
    fileType: "",
    fileSize: 0,
    documentType: "DRAWING",
    status: "DRAFT",
    drawingNumber: data.drawingNumber || "",
    revision: data.revision || "",
    projectId: 0,
    createdAt: "",
  };
}
