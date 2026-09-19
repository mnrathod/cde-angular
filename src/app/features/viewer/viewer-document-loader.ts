/**
 * Fetching an open document and putting it into the viewer's state.
 *
 * <p>Out of the shell component because a component that renders a screen
 * should not also be the thing that talks to the server (§3.3). It also put
 * the one remaining raw-error path in the application inside a template's
 * own file, where it was easy not to see: a failed load showed
 * `'Failed to load document: ' + err.message`, which is an implementation
 * detail in English with no reference a reader could quote to support
 * (§1.4). It now goes through `problemMessage` like every other request.
 *
 * <p>Provided per viewer, alongside ViewerStateService, because what it
 * loads into belongs to one open document.
 */
import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { firstValueFrom } from "rxjs";

import { problemMessage } from "../../core/handlers/problem-detail";
import { AnnotationService } from "../../core/services/viewer/annotation.service";
import { PdfEngineService } from "../../../viewer-core/pdf-engine.service";
import { ViewerStateService } from "../../../viewer-core/viewer-state.service";

@Injectable()
export class ViewerDocumentLoader {
  private http = inject(HttpClient);
  private engine = inject(PdfEngineService);
  private state = inject(ViewerStateService);
  private annotations = inject(AnnotationService);

  /** Fetches the document and shows it, whatever kind it turns out to be. */
  load(documentId: number): void {
    this.state.loading.set(true);
    this.state.loadingMsg.set(
      $localize`:Progress message while the document is being fetched@@viewerShell.loadingDocument:Loading document...`,
    );

    this.http.get<any>(`/api/viewer/${documentId}`).subscribe({
      next: async (data: any) => {
        if (data.type === "pdf" || data.pdfUrl) {
          await this.showPdf(documentId, data);
        } else {
          this.state.viewerData.set(data);
        }
        this.state.loading.set(false);
      },
      error: (err: unknown) => {
        this.state.errorMsg.set(
          problemMessage(
            err,
            $localize`:Shown when a document cannot be opened and the server explained nothing@@viewerShell.loadFailed:This document could not be opened. Try again; if it keeps failing, quote any reference shown here to support.`,
          ),
        );
        this.state.loading.set(false);
      },
    });
  }

  /**
   * Opens the PDF bytes with pdf.js and hands them to the viewer.
   *
   * <p>Fetched through HttpClient, where the auth interceptor attaches the
   * session, rather than handing pdf.js a URL to fetch itself: its internal
   * fetch bypasses Angular's interceptors entirely and the backend correctly
   * refuses it as unauthenticated.
   */
  private async showPdf(documentId: number, data: any): Promise<void> {
    this.state.loadingMsg.set(
      $localize`:Progress message while the PDF is being drawn@@viewerShell.renderingPdf:Rendering PDF...`,
    );
    const url = data.pdfUrl || `/api/viewer/${documentId}/pdf`;
    const bytes = await firstValueFrom(
      this.http.get(url, { responseType: "arraybuffer" }),
    );
    const pdfDoc = await this.engine.openDocument(bytes);

    // Release the previous document before swapping it out — reloading after
    // a version commit would otherwise leak a pdf.js worker and its page
    // buffers on every operation.
    this.state.pdfDoc()?.destroy?.();
    this.state.pdfDoc.set(pdfDoc);
    this.state.totalPages.set(pdfDoc.numPages);
    this.state.currentVersion.set(data.version ?? 1);
    this.state.viewerData.set({ ...data, type: "pdf" });
  }

  /**
   * Reads the document's annotations and restores the shapes drawn on it.
   *
   * <p>The shapes are marked clean afterwards: they came from the server, so
   * offering to save them again would make every freshly opened document
   * look like it had unsaved work.
   */
  loadAnnotations(documentId: number): void {
    this.annotations.loadAnnotations(documentId).subscribe((saved) => {
      this.state.setAnnotationsSaved(saved);
      const shapes = this.annotations.annotationsToShapes(saved);
      if (shapes.length > 0) {
        this.state.shapes.set(shapes);
        this.state.dirty.set(false);
      }
    });
  }

  /** Stores the shapes drawn here, and keeps the ids the server gave them. */
  saveShapes(): void {
    const shapes = this.state.shapes();
    if (!shapes.length) return;

    this.annotations
      .saveShapes(this.state.documentId(), shapes)
      .subscribe((saved) => {
        for (const annotation of saved) {
          const id = shapeIdOf(annotation.shapeData);
          if (id) this.state.updateShape(id, { savedId: annotation.id });
        }
        this.state.setAnnotationsSaved(saved);
      });
  }
}

/**
 * The drawing id inside a saved annotation's payload.
 *
 * <p>Unreadable payloads are skipped rather than thrown: one annotation the
 * viewer cannot match up should not lose the ids of all the others.
 */
function shapeIdOf(shapeData: string): string | null {
  try {
    return JSON.parse(shapeData)?.id ?? null;
  } catch {
    return null;
  }
}
