import { Component, computed, inject, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ViewerStateService, SidebarTab } from '../../../../viewer-core/viewer-state.service';
import { IconComponent, IconName } from '../../../../viewer-core/icon.component';
import { AnnotationThreadComponent } from '../markup/annotation-thread.component';
import { DocumentSignatureComponent } from '../markup/document-signature.component';
import { PdfFormComponent } from '../markup/pdf-form.component';
import { VersionHistoryComponent } from '../markup/version-history.component';
import { PageOrganiserComponent } from '../markup/page-organiser.component';
import { RedactionPanelComponent } from '../markup/redaction-panel.component';
import { OutlinePanelComponent } from '../../../../viewer-core/outline-panel.component';
import { AnnotationsPanelComponent } from './annotations-panel.component';
import { DocumentSearchPanelComponent } from './document-search-panel.component';
import { MeasurementsPanelComponent } from './measurements-panel.component';
import { Annotation } from '../../../core/models';

@Component({
  selector: 'app-viewer-sidebar',
  standalone: true,
  imports: [
    CommonModule, AnnotationThreadComponent,
    DocumentSignatureComponent, PdfFormComponent, VersionHistoryComponent,
    PageOrganiserComponent, RedactionPanelComponent, OutlinePanelComponent,
    IconComponent, AnnotationsPanelComponent, DocumentSearchPanelComponent,
    MeasurementsPanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="w-60 bg-white border-s border-gray-200 flex flex-col flex-shrink-0">

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

      <!--
        Names the panel that is showing.

        Two things were wrong without it. Seven of the ten panels carry no
        heading of their own, and this region has no landmark role and no
        accessible name either — so a reader who chose Measure or Outline
        arrived at content with nothing saying which panel they were in. And
        the two panels that do have a heading use h3, directly under the top
        bar's h1, so the route skipped a level (SC 2.4.6).

        One h2 fixes both, and fixes the skip the right way round: the panels
        keep the level they chose, because with this above them h3 is now
        correct rather than being renumbered to paper over a gap.

        The label comes from the tabs table, so there is no new string to
        translate and the heading cannot disagree with the tab that selected
        it. Hidden, because that tab already shows the same word on screen.
      -->
      <h2 class="sr-only">{{ activePanelLabel() }}</h2>

      @if (state.sidebarTab() === 'annotations') {
        <app-annotations-panel (pageRequested)="goToPage($event)" />
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

      @if (state.sidebarTab() === 'measure') {
        <app-measurements-panel />
      }

      <!-- Form fields tab -->
      @if (state.sidebarTab() === 'form') {
        <div class="flex-1 overflow-y-auto">
          <app-pdf-form [documentId]="state.documentId()"></app-pdf-form>
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
        <app-document-search-panel
          (searchRequested)="doSearch()"
          (pageRequested)="goToPage($event)"
        />
      }
    </div>
  `
})
export class ViewerSidebarComponent {
  state      = inject(ViewerStateService);

  @Output() pageSelected = new EventEmitter<number>();

  /**
   * The sidebar panels, in the order they appear.
   *
   * <p>`$localize` rather than plain strings: these are in a lookup table, so
   * the template markup guard cannot see them, and each label is also the
   * tab's tooltip and its accessible name. They render in a cell about seven
   * characters wide and truncate past that, which is why the descriptions say
   * to keep the translation short.
   */
  readonly tabs: ReadonlyArray<{ id: SidebarTab; icon: IconName; label: string }> = [
    { id: 'annotations', icon: 'pen',        label: $localize`:Sidebar tab — markup notes on the document. Very short; truncates past about seven characters.@@sidebarTab.annotations:Notes` },
    { id: 'threads',     icon: 'comment',    label: $localize`:Sidebar tab — comment conversations. Very short; truncates past about seven characters.@@sidebarTab.threads:Threads` },
    { id: 'signatures',  icon: 'signature',  label: $localize`:Sidebar tab — digital signatures. Very short; truncates past about seven characters.@@sidebarTab.signatures:Sign` },
    { id: 'redact',      icon: 'redact',     label: $localize`:Sidebar tab — permanently removing content. Very short; truncates past about seven characters.@@sidebarTab.redact:Redact` },
    { id: 'form',        icon: 'form-field', label: $localize`:Sidebar tab — PDF form fields. Very short; truncates past about seven characters.@@sidebarTab.form:Form` },
    { id: 'measure',     icon: 'length',     label: $localize`:Sidebar tab — distance and area measurement. Very short; truncates past about seven characters.@@sidebarTab.measure:Measure` },
    { id: 'thumbnails',  icon: 'pages',      label: $localize`:Sidebar tab — page thumbnails and reordering. Very short; truncates past about seven characters.@@sidebarTab.thumbnails:Pages` },
    { id: 'search',      icon: 'search',     label: $localize`:Sidebar tab — full-text search. Very short; truncates past about seven characters.@@sidebarTab.search:Search` },
    { id: 'outline',     icon: 'outline',    label: $localize`:Sidebar tab — the document's bookmarks. Very short; truncates past about seven characters.@@sidebarTab.outline:Outline` },
    { id: 'versions',    icon: 'history',    label: $localize`:Sidebar tab — version history. Very short; truncates past about seven characters.@@sidebarTab.versions:History` },
  ];

  /**
   * The showing panel's label, for the heading above it.
   *
   * <p>Falls back to empty rather than to a guess: an `h2` with the wrong
   * panel's name in it is worse than one with none, because a reader has no
   * way to tell it is wrong.
   */
  readonly activePanelLabel = computed(
    () => this.tabs.find((tab) => tab.id === this.state.sidebarTab())?.label ?? '',
  );

  goToPage(page: number) {
    this.state.navigateTo(page);
    this.pageSelected.emit(page);
  }

  doSearch() {
    // Trigger search — PdfEngineService called by parent ViewerShellComponent
    this.pageSelected.emit(-1);  // signal "run search"
  }

}
