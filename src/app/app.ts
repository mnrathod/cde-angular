import { Component, ChangeDetectionStrategy } from "@angular/core";
import { RouterOutlet } from "@angular/router";
import { ErrorToastComponent } from "./shared/components/error-toast.component";
import { UploadProgressComponent } from "./shared/components/upload-progress.component";
import { OfflineBannerComponent } from "./shared/components/offline-banner.component";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [
    RouterOutlet,
    ErrorToastComponent,
    UploadProgressComponent,
    OfflineBannerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <!-- Skip link for keyboard users -->
    <a
      href="#main-content"
      class="sr-only focus:not-sr-only focus:fixed focus:top-0 focus:left-0 focus:z-50
              focus:px-4 focus:py-2 focus:bg-accent focus:text-white focus:text-sm"
    >
      Skip to content
    </a>

    <!-- Main app -->
    <main id="main-content">
      <router-outlet />
    </main>

    <!-- Global overlays (render above everything) -->
    <app-offline-banner />
    <app-error-toast />
    <app-upload-progress />
  `,
})
export class App {}
