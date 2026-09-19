/**
 * Fetching a model's geometry, and explaining it when there is none.
 *
 * <p>Out of the component because it is two requests, a decode and six
 * different things to tell a reader — and every one of those sentences was
 * hardcoded English in a `.ts` file, where neither the template sweep nor
 * the message catalogue could see it. One of them pasted an exception's own
 * text onto the screen.
 *
 * <p>The geometry route answers with bytes for a model it could extract and
 * with JSON for anything else, so the content type is the branch. Only the
 * second case needs the JSON route, which is what names the specific reason
 * — a Revit binary, an unsupported format, a converter that is not running.
 * That keeps the common path to one request and one extraction.
 */
import { Injectable, inject, signal } from "@angular/core";

import { problemMessage } from "../../../core/handlers/problem-detail";
import { ViewerService } from "../../../core/services/viewer.service";
import {
  ModelGeometry,
  decodeGeometryContainer,
} from "../../../../viewer-core/model-geometry";

@Injectable()
export class ModelLoading {
  private service = inject(ViewerService);

  readonly loading = signal(true);
  readonly progress = signal(startingUpMessage());
  readonly errorMsg = signal("");

  /**
   * Fetches the geometry and hands it back, or explains why it cannot.
   *
   * <p>The caller gets the geometry rather than this building the scene,
   * because building it needs a canvas and this knows nothing about one.
   */
  fetch(documentId: number, onGeometry: (geometry: ModelGeometry) => void): void {
    this.progress.set(
      $localize`:Progress message while a 3D model's geometry is being fetched@@viewer3d.fetching:Fetching model data...`,
    );

    this.service.getModelGeometry(documentId).subscribe({
      next: (response) => {
        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("application/octet-stream") || !response.body) {
          this.explainUnopenableModel(documentId);
          return;
        }
        this.decodeAndBuild(response.body, onGeometry);
      },
      error: (err: unknown) => this.fail(err, couldNotFetchMessage()),
    });
  }

  private decodeAndBuild(
    body: ArrayBuffer,
    onGeometry: (geometry: ModelGeometry) => void,
  ): void {
    let geometry: ModelGeometry;
    try {
      geometry = decodeGeometryContainer(body);
    } catch {
      // The exception says which byte offset disagreed with the container
      // format, which is exactly nothing to a reader (§1.4).
      this.loading.set(false);
      this.errorMsg.set(
        $localize`:Shown when a model's geometry arrived but could not be read@@viewer3d.unreadable:This model's data could not be read. It may have been produced by an older version; try converting it again.`,
      );
      return;
    }
    this.progress.set(
      $localize`:Progress message while the 3D scene is being assembled@@viewer3d.building:Building 3D scene...`,
    );
    onGeometry(geometry);
  }

  /** The scene is up; stop saying it is being built. */
  finished(): void {
    this.loading.set(false);
  }

  /** Asks the JSON route why a document produced no geometry, and says so. */
  private explainUnopenableModel(documentId: number): void {
    this.service.get3DData(documentId).subscribe({
      next: (data: any) => {
        this.loading.set(false);
        this.errorMsg.set(reasonFor(data));
      },
      error: (err: unknown) => this.fail(err, couldNotFetchMessage()),
    });
  }

  private fail(err: unknown, fallback: string): void {
    this.loading.set(false);
    this.errorMsg.set(problemMessage(err, fallback));
  }
}

function startingUpMessage(): string {
  return $localize`:Progress message while the 3D renderer itself is loading@@viewer3d.startingRenderer:Loading the 3D viewer...`;
}

function couldNotFetchMessage(): string {
  return $localize`:Shown when a 3D model cannot be fetched at all@@viewer3d.fetchFailed:This model could not be opened. Try again, and quote any reference shown here to support.`;
}

/** What the JSON route's answer means, in words a reader can act on. */
function reasonFor(data: { type?: string; success?: boolean; error?: string }): string {
  if (data?.type === "revit_binary") {
    return $localize`:Shown for a Revit file, which must be exported to IFC before it can be viewed. "IFC" and the Revit menu path are identifiers, not words to translate.@@viewer3d.revitBinary:This is a Revit file, which cannot be opened directly. Export it to IFC first: File → Export → IFC.`;
  }
  if (data?.success === false) {
    // The converter's own sentence when it sent one — it knows which stage
    // failed and this does not.
    return (
      data.error ??
      $localize`:Shown when converting a model for viewing failed and nothing explained why@@viewer3d.conversionFailed:This model could not be prepared for viewing. Try uploading it again.`
    );
  }
  return $localize`:Shown for a 3D file in a format the viewer cannot open@@viewer3d.unsupportedFormat:This 3D format cannot be opened. Export the model to IFC and upload it again.`;
}
