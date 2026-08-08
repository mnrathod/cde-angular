import {
  Component, input, inject, signal, effect, ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';

import { OutlineService, PageLink } from '../../../core/services/viewer/outline.service';
import { ViewerStateService } from '../../../core/services/viewer/viewer-state.service';

/**
 * Link annotations on a page, made clickable.
 *
 * <p>Every cross-reference and URL in every document was dead: pdf.js reports
 * link annotations and nothing rendered them.
 *
 * <p>Positions arrive in PDF coordinates with a bottom-left origin and are
 * flipped and scaled here, so a link stays over its text at any zoom.
 */
@Component({
  selector: 'app-page-links',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="absolute top-0 left-0 w-full h-full" style="z-index:3; pointer-events:none">
      @for (link of links(); track $index) {
        <a [attr.href]="link.url ?? null"
           [attr.target]="link.url ? '_blank' : null"
           [attr.rel]="link.url ? 'noopener noreferrer' : null"
           [title]="link.url ?? 'Go to page ' + link.page"
           (click)="follow(link, $event)"
           class="absolute block rounded-sm cursor-pointer
                  hover:bg-blue-400/20 hover:outline hover:outline-1 hover:outline-blue-500/60"
           style="pointer-events:auto"
           [style.left.px]="link.x * zoom()"
           [style.top.px]="topOf(link)"
           [style.width.px]="link.width * zoom()"
           [style.height.px]="link.height * zoom()">
        </a>
      }
    </div>
  `
})
export class PageLinksComponent {
  readonly pageNumber = input.required<number>();
  readonly zoom       = input.required<number>();
  readonly pageHeight = input.required<number>();

  private outline = inject(OutlineService);
  private state   = inject(ViewerStateService);

  readonly links = signal<PageLink[]>([]);

  constructor() {
    effect(() => {
      // Reloading replaces the document, and page manipulation can change
      // which page this is — both invalidate the links held here.
      this.state.reloadToken();
      const pdfDoc = this.state.pdfDoc();
      const page   = this.pageNumber();
      if (pdfDoc) this.load(pdfDoc, page);
    });
  }

  /** PDF coordinates start at the bottom; CSS starts at the top. */
  topOf(link: PageLink): number {
    return (this.pageHeight() - link.y - link.height) * this.zoom();
  }

  follow(link: PageLink, event: MouseEvent) {
    if (link.url) return;   // the anchor's href handles it
    event.preventDefault();
    if (link.page) this.state.navigateTo(link.page);
  }

  private load(pdfDoc: any, pageNumber: number) {
    pdfDoc.getPage(pageNumber)
      .then((page: unknown) => this.outline.getPageLinks(pdfDoc, page))
      .then((links: PageLink[]) => this.links.set(links))
      .catch(() => this.links.set([]));
  }
}
