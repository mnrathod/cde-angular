import { Component, inject, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ViewerStateService, SidebarTab, SearchResult } from '../../../core/services/viewer/viewer-state.service';
import { DrawingMatch } from '../../../core/services/viewer/drawing-search.service';
import { IconComponent, IconName } from '../../../shared/components/icon.component';
import { AnnotationService } from '../../../core/services/viewer/annotation.service';
import { AnnotationThreadComponent } from '../markup/annotation-thread.component';
import { DocumentSignatureComponent } from '../markup/document-signature.component';
import { PdfFormComponent } from '../markup/pdf-form.component';
import { VersionHistoryComponent } from '../markup/version-history.component';
import { PageOrganiserComponent } from '../markup/page-organiser.component';
import { RedactionPanelComponent } from '../markup/redaction-panel.component';
import { OutlinePanelComponent } from '../markup/outline-panel.component';
import { Annotation } from '../../../core/models';

@Component({
  selector: 'app-viewer-sidebar',
  standalone: true,
  imports: [
    CommonModule, FormsModule, AnnotationThreadComponent,
    DocumentSignatureComponent, PdfFormComponent, VersionHistoryComponent,
    PageOrganiserComponent, RedactionPanelComponent, OutlinePanelComponent,
    IconComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="w-60 bg-white border-l border-gray-200 flex flex-col flex-shrink-0">

      <!--
        A fixed 5-column grid rather than flex-wrap. Wrapping flex items sized
        by content produced ragged rows and left the last tab stretched alone
        across the full width; a grid gives every panel an identical cell, so
        the strip reads as one control and the row count never changes.
      -->
      <div class="grid grid-cols-5 border-b border-gray-200 flex-shrink-0">
        @for (tab of tabs; track tab.id) {
          <button type="button" (click)="state.sidebarTab.set(tab.id)"
            [title]="tab.label"
            [attr.aria-current]="state.sidebarTab() === tab.id ? 'page' : null"
            class="flex flex-col items-center justify-center gap-0.5 py-1.5 px-0.5
                   transition-colors border-b-2"
            [class]="state.sidebarTab() === tab.id
              ? 'border-accent text-accent bg-blue-50/60'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'">
            <app-icon [name]="tab.icon" [size]="16" />
            <span class="text-[9px] leading-none font-medium w-full text-center truncate">
              {{ tab.label }}
            </span>
          </button>
        }
      </div>

      <!-- Annotations tab -->
      @if (state.sidebarTab() === 'annotations') {
        <div class="flex-1 overflow-y-auto">
          @if (state.annotations().length === 0 && state.shapes().length === 0) {
            <div class="text-center text-gray-400 text-xs py-10 px-3">
              No annotations yet.<br>Use the toolbar to add markup.
            </div>
          }

          <!-- Unsaved shapes -->
          @if (state.dirty() && state.shapes().length > 0) {
            <div class="px-3 pt-2">
              <div class="text-xs font-semibold text-amber-600 mb-1.5 flex items-center gap-1">
                <span class="w-2 h-2 rounded-full bg-amber-400 inline-block"></span>
                Unsaved ({{ state.shapes().length }})
              </div>
              @for (s of state.shapes(); track s.id) {
                <div class="flex items-center gap-2 p-1.5 rounded hover:bg-gray-50 group mb-1">
                  <div class="w-3 h-3 rounded-sm flex-shrink-0" [style.background]="s.color"></div>
                  <span class="text-xs text-gray-600 flex-1 capitalize">{{ s.tool }}{{ s.text ? ': ' + s.text : '' }}</span>
                  <span class="text-xs text-gray-400">p{{ s.pageNumber }}</span>
                  <button (click)="state.removeShape(s.id)"
                    class="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-xs ml-1">✕</button>
                </div>
              }
            </div>
          }

          <!-- Saved annotations -->
          @if (state.annotations().length > 0) {
            <div class="px-3 pt-2">
              <div class="text-xs font-semibold text-gray-500 mb-1.5">
                Saved ({{ state.annotations().length }})
              </div>
              @for (ann of state.annotations(); track ann.id) {
                <div class="p-2 rounded border-l-2 mb-1.5 text-xs hover:bg-gray-50 cursor-pointer"
                     [style.border-left-color]="getAnnotationColor(ann)"
                     (click)="goToPage(ann.pageNumber)">
                  <div class="flex items-center justify-between gap-1">
                    <span class="font-medium text-gray-700">{{ ann.authorName }}</span>
                    <span class="text-gray-400">p{{ ann.pageNumber }}</span>
                  </div>
                  @if (ann.comment) {
                    <div class="text-gray-500 mt-0.5 truncate">{{ ann.comment }}</div>
                  }
                  <div class="flex items-center justify-between mt-1">
                    <span class="px-1.5 py-0.5 rounded text-xs font-semibold"
                      [class]="ann.status === 'OPEN' ? 'bg-amber-100 text-amber-700'
                               : ann.status === 'RESOLVED' ? 'bg-green-100 text-green-700'
                               : 'bg-gray-100 text-gray-500'">
                      {{ ann.status }}
                    </span>
                    @if (ann.status === 'OPEN') {
                      <button (click)="resolve(ann); $event.stopPropagation()"
                        class="text-xs text-green-600 hover:text-green-700">✓ Resolve</button>
                    }
                  </div>
                </div>
              }
            </div>
          }
        </div>
      }

      <!-- Threads tab -->
      @if (state.sidebarTab() === 'threads') {
        <div class="flex-1 overflow-hidden flex flex-col min-h-0">
          <app-annotation-thread
            [annotations]="state.annotations()"
            [selectedAnnotationId]="state.selectedId">
          </app-annotation-thread>
        </div>
      }

      <!-- Thumbnails tab -->
      @if (state.sidebarTab() === 'thumbnails') {
        <div class="flex-1 overflow-hidden">
          <app-page-organiser></app-page-organiser>
        </div>
      }

      <!-- Signatures tab -->
      @if (state.sidebarTab() === 'signatures') {
        <div class="flex-1 overflow-y-auto">
          <app-document-signature [documentId]="state.documentId()"></app-document-signature>
        </div>
      }

      <!-- Measurements tab -->
      @if (state.sidebarTab() === 'measure') {
        <div class="flex-1 overflow-y-auto p-3">
          <div class="flex items-center justify-between mb-1">
            <span class="text-sm font-semibold text-gray-800">Measurements</span>
            @if (state.measurements().length > 0) {
              <button (click)="state.clearMeasurements()"
                class="text-xs text-red-500 hover:text-red-700">Clear</button>
            }
          </div>

          <div class="flex items-center justify-between text-xs mb-3 p-2 rounded border"
               [class]="state.isCalibrated()
                 ? 'bg-green-50 border-green-200 text-green-800'
                 : 'bg-amber-50 border-amber-200 text-amber-800'">
            <span>Scale</span>
            <span class="font-mono">
              {{ state.isCalibrated()
                   ? '1px = ' + state.measurementScale().unitsPerPixel.toFixed(5) + ' ' + state.measurementScale().unit
                   : 'uncalibrated' }}
            </span>
          </div>

          @if (!state.isCalibrated()) {
            <p class="text-xs text-gray-500 mb-3">
              Results are in pixels. Use <span class="font-medium">Calibrate</span> in the
              toolbar and draw a line over a known distance to read real units.
            </p>
          }

          @if (state.measurements().length === 0) {
            <div class="text-center text-gray-400 text-xs py-6">
              No measurements yet. Use Measure, Area or Radius.
            </div>
          } @else {
            @for (m of state.measurements(); track m.id) {
              <div class="p-2 rounded border border-gray-100 mb-1.5 group hover:bg-gray-50">
                <div class="flex items-start gap-2">
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-mono font-semibold text-gray-800">{{ m.value }}</div>
                    <div class="text-xs text-gray-500">{{ m.kind }} · {{ m.detail }} · p{{ m.page }}</div>
                  </div>
                  <button (click)="state.removeMeasurement(m.id)"
                    class="opacity-0 group-hover:opacity-100 text-xs text-gray-400 hover:text-red-600"
                    title="Remove from list">✕</button>
                </div>
              </div>
            }
          }
        </div>
      }

      <!-- Form fields tab -->
      @if (state.sidebarTab() === 'form') {
        <div class="flex-1 overflow-y-auto">
          <app-pdf-form
            [documentId]="state.documentId()"
            [documentName]="state.viewerData()?.name || 'document'">
          </app-pdf-form>
        </div>
      }

      <!-- Outline tab -->
      @if (state.sidebarTab() === 'outline') {
        <app-outline-panel class="flex-1 overflow-hidden flex flex-col"></app-outline-panel>
      }

      <!-- Version history tab -->
      @if (state.sidebarTab() === 'versions') {
        <div class="flex-1 overflow-y-auto">
          <app-version-history></app-version-history>
        </div>
      }

      <!-- Redact tab -->
      @if (state.sidebarTab() === 'redact') {
        <app-redaction-panel class="flex-1 overflow-hidden flex flex-col"></app-redaction-panel>
      }

      @if (state.sidebarTab() === 'search') {
        <div class="flex flex-col h-full">
          <div class="p-3 border-b border-gray-200">
            <div class="flex gap-1">
              <input
                [ngModel]="state.searchQuery()"
                (ngModelChange)="state.searchQuery.set($event)"
                (keydown.enter)="doSearch()"
                placeholder="Search document..."
                class="flex-1 px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-accent" />
              <button (click)="doSearch()"
                class="px-2 py-1.5 text-xs bg-accent text-white rounded hover:bg-blue-700">Go</button>
            </div>
            @if (state.searchResults().length > 0) {
              <div class="text-xs text-gray-500 mt-1">
                {{ state.searchResults().length }} matches
              </div>
            }
          </div>
          <div class="flex-1 overflow-y-auto">
            @for (result of state.searchResults(); track $index) {
              <!-- A search hit navigates the document, so it is a button.
                   Keyboard users search more than most, and a result list that
                   cannot be reached by Tab makes search itself unusable. -->
              <button type="button" (click)="goToSearchResult(result)"
                class="w-full text-left px-3 py-2 text-xs border-b border-gray-100 cursor-pointer hover:bg-blue-50">
                @if (state.totalPages() > 1) {
                  <div class="font-medium text-gray-600 mb-0.5">Page {{ result.pageIndex }}</div>
                }
                <div class="text-gray-500">{{ snippetOf(result) }}</div>
              </button>
            }
            <!--
              "No matches found" is only true when there was something to look
              through. A drawing whose text has not been indexed, or an image,
              has nothing to search, and saying so is the difference between a
              document that holds no match and a viewer that cannot look.
            -->
            @if (state.searchQuery() && state.searchResults().length === 0) {
              @if (state.searchable()) {
                <div class="text-center text-gray-400 text-xs py-8">No matches found</div>
              } @else {
                <div class="text-center text-gray-400 text-xs py-8 px-4">
                  This document has no text to search.
                </div>
              }
            }
          </div>
        </div>
      }
    </div>
  `
})
export class ViewerSidebarComponent {
  state      = inject(ViewerStateService);
  annService = inject(AnnotationService);

  @Output() pageSelected = new EventEmitter<number>();

  readonly tabs: ReadonlyArray<{ id: SidebarTab; icon: IconName; label: string }> = [
    { id: 'annotations', icon: 'pen',        label: 'Notes' },
    { id: 'threads',     icon: 'comment',    label: 'Threads' },
    { id: 'signatures',  icon: 'signature',  label: 'Sign' },
    { id: 'redact',      icon: 'redact',     label: 'Redact' },
    { id: 'form',        icon: 'form-field', label: 'Form' },
    { id: 'measure',     icon: 'length',     label: 'Measure' },
    { id: 'thumbnails',  icon: 'pages',      label: 'Pages' },
    { id: 'search',      icon: 'search',     label: 'Search' },
    { id: 'outline',     icon: 'outline',    label: 'Outline' },
    { id: 'versions',    icon: 'history',    label: 'History' },
  ];

  goToPage(page: number) {
    this.state.navigateTo(page);
    this.pageSelected.emit(page);
  }

  /**
   * How a result reads in the list.
   *
   * A PDF match is a window cut out of the page's text, so it usually begins
   * and ends mid-sentence and is bracketed to say so. A drawing match is a
   * whole label, and bracketing it would suggest text that is not there.
   */
  snippetOf(result: SearchResult): string {
    return (result as DrawingMatch).item ? result.text : `…${result.text}…`;
  }

  /**
   * Show the match. A PDF scrolls to the page; a drawing has one sheet, so it
   * marks the hit where it sits and brings that into view instead.
   */
  goToSearchResult(result: SearchResult) {
    this.state.searchIndex.set(result.matchIndex);

    const hit = (result as DrawingMatch).item;
    if (hit) {
      this.state.searchFocus.set(hit);
      return;
    }
    this.goToPage(result.pageIndex);
  }

  doSearch() {
    // Trigger search — PdfEngineService called by parent ViewerShellComponent
    this.pageSelected.emit(-1);  // signal "run search"
  }

  resolve(ann: Annotation) {
    this.annService.resolveAnnotation(ann.id).subscribe(updated => {
      this.state.annotations.update(anns =>
        anns.map(a => a.id === updated.id ? updated : a)
      );
    });
  }

  getAnnotationColor(ann: Annotation): string {
    try {
      const data = JSON.parse(ann.shapeData);
      return data.color || '#1e5fbe';
    } catch { return '#1e5fbe'; }
  }
}
