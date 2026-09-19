/**
 * The middle of the viewer: the document, or what is happening instead.
 *
 * <p>Three states and four kinds of document, which between them were most
 * of the shell's template. They belong together because they are exactly one
 * choice — a reader sees a spinner, a failure, or one of the viewers, never
 * two of them — and keeping that choice in one place is what stops a later
 * edit from showing a stale document behind an error.
 */
import {
  ChangeDetectionStrategy, Component, inject,
} from "@angular/core";

import { CadViewerComponent } from "../../../viewer-core/cad-viewer.component";
import { IconComponent } from "../../../viewer-core/icon.component";
import { PdfViewerComponent } from "./pdf-viewer/pdf-viewer.component";
import { ViewerStateService } from "../../../viewer-core/viewer-state.service";

@Component({
  selector: "app-viewer-canvas",
  standalone: true,
  imports: [CadViewerComponent, IconComponent, PdfViewerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: "flex-1 overflow-hidden flex flex-col min-w-0" },
  template: `
    @if (state.loading()) {
      <div class="flex-1 flex flex-col items-center justify-center bg-gray-800 text-white/60">
        <div class="w-8 h-8 border-2 border-white/20 border-t-white/70 rounded-full animate-spin mb-3"></div>
        <div class="text-sm">{{ state.loadingMsg() }}</div>
      </div>
    } @else if (state.errorMsg()) {
      <div class="flex-1 flex items-center justify-center" style="background:#0a0c14">
        <div class="max-w-md p-6 bg-red-900/30 rounded-lg border border-red-500/30
                    text-red-300 text-sm flex items-start gap-2.5"
             role="alert">
          <app-icon name="warning" [size]="18" class="mt-px flex-shrink-0" />
          <span>{{ state.errorMsg() }}</span>
        </div>
      </div>
    } @else if (isPdf()) {
      <app-pdf-viewer class="flex-1 overflow-hidden flex flex-col"></app-pdf-viewer>
    } @else if (isDrawing()) {
      <app-cad-viewer
        class="flex-1 flex overflow-hidden min-h-0"
        [svgContent]="state.viewerData()?.content || ''"
        [dxfVersion]="state.viewerData()?.dwgVersion || ''"
        [entityCount]="entityCount">
      </app-cad-viewer>
    } @else {
      <div class="flex-1 flex items-center justify-center text-gray-400">
        <div class="text-center">
          <div class="text-5xl mb-3" aria-hidden="true">📄</div>
          <div i18n="Shown for a file the viewer cannot render@@viewerShell.noPreview">Preview not available for this file type</div>
          <div class="text-sm mt-1 text-gray-500">{{ state.viewerData()?.fileName }}</div>
        </div>
      </div>
    }
  `,
})
export class ViewerCanvasComponent {
  state = inject(ViewerStateService);

  /** Reported by the CAD viewer's own status line; not yet supplied. */
  readonly entityCount = 0;

  isPdf(): boolean {
    return this.state.pdfDoc() !== null;
  }

  isDrawing(): boolean {
    return this.state.viewerData()?.type === "svg";
  }
}
