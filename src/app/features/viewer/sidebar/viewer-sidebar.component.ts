import { Component, inject, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ViewerStateService } from '../../../core/services/viewer/viewer-state.service';
import { AnnotationService } from '../../../core/services/viewer/annotation.service';
import { AnnotationThreadComponent } from '../markup/annotation-thread.component';
import { DocumentSignatureComponent } from '../markup/document-signature.component';
import { Annotation } from '../../../core/models';

@Component({
  selector: 'app-viewer-sidebar',
  standalone: true,
  imports: [CommonModule, FormsModule, AnnotationThreadComponent, DocumentSignatureComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="w-60 bg-white border-l border-gray-200 flex flex-col flex-shrink-0">

      <!-- Tab bar -->
      <div class="flex border-b border-gray-200 flex-shrink-0">
        @for (tab of tabs; track tab.id) {
          <button (click)="state.sidebarTab.set(tab.id)"
            class="flex-1 py-2 text-xs font-medium transition-colors border-b-2"
            [class]="state.sidebarTab() === tab.id
              ? 'border-accent text-accent'
              : 'border-transparent text-gray-500 hover:text-gray-700'">
            {{ tab.icon }} {{ tab.label }}
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
        <div class="flex-1 overflow-y-auto p-2 grid gap-2" style="grid-template-columns:1fr">
          @if (state.thumbnails().length === 0) {
            <div class="text-center text-gray-400 text-xs py-8">Generating thumbnails...</div>
          }
          @for (thumb of state.thumbnails(); track thumb.pageNumber) {
            <div (click)="goToPage(thumb.pageNumber)"
              class="cursor-pointer rounded overflow-hidden border-2 transition-all"
              [class]="state.currentPage() === thumb.pageNumber
                ? 'border-accent shadow-md'
                : 'border-gray-200 hover:border-gray-400'">
              <img [src]="thumb.dataUrl" class="w-full block" [alt]="'Page ' + thumb.pageNumber" />
              <div class="text-center text-xs text-gray-500 py-1">{{ thumb.pageNumber }}</div>
            </div>
          }
        </div>
      }

      <!-- Signatures tab -->
      @if (state.sidebarTab() === 'signatures') {
        <div class="flex-1 overflow-y-auto">
          <app-document-signature [documentId]="state.documentId()"></app-document-signature>
        </div>
      }

      <!-- Search tab -->
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
              <div (click)="goToSearchResult(result)"
                class="px-3 py-2 text-xs border-b border-gray-100 cursor-pointer hover:bg-blue-50">
                <div class="font-medium text-gray-600 mb-0.5">Page {{ result.pageIndex }}</div>
                <div class="text-gray-500">...{{ result.text }}...</div>
              </div>
            }
            @if (state.searchQuery() && state.searchResults().length === 0) {
              <div class="text-center text-gray-400 text-xs py-8">No matches found</div>
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

  readonly tabs = [
    { id: 'annotations' as const, icon: '✍', label: 'Notes' },
    { id: 'threads'     as const, icon: '💬', label: 'Threads' },
    { id: 'signatures'  as const, icon: '🔏', label: 'Sign' },
    { id: 'thumbnails'  as const, icon: '⊞', label: 'Pages' },
    { id: 'search'      as const, icon: '🔍', label: 'Search' },
  ];

  goToPage(page: number) {
    this.state.navigateTo(page);
    this.pageSelected.emit(page);
  }

  goToSearchResult(result: any) {
    this.goToPage(result.pageIndex);
    this.state.searchIndex.set(result.matchIndex);
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
