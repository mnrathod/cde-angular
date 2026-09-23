/**
 * The organiser under test, with the things every case reaches for.
 *
 * <p>Shared because both suites — what the component does with a draft, and
 * what editing a draft does to it — need the same component, the same HTTP
 * double and the same way of loading pages into it. Two copies of a setup
 * this size is how two suites come to be testing two subtly different
 * components while reading as though they agree.
 *
 * <p>Returned as an object rather than assigned to outer `let`s so that each
 * suite names what it uses, and a case that quietly starts depending on the
 * HTTP double has to say so.
 */
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DraftPage } from './page-draft';
import { PageOrganiserComponent } from './page-organiser.component';
import { ViewerStateService } from '../../../../viewer-core/viewer-state.service';
import { definitely } from '../../../../testing/definitely';

/** Click with no modifier — replaces the selection. */
export const click = new MouseEvent('click');
/** Ctrl-click — adds to the selection. */
export const ctrlClick = new MouseEvent('click', { ctrlKey: true });

/**
 * A drop event carrying only what `onDrop` reads.
 *
 * <p>The tests previously cast a two-field object to `CdkDragDrop<never>`,
 * which strict mode refuses because `never` is not assignable to the element
 * type the component declares. Naming the two fields the component actually
 * uses is both what makes it type-check and a statement of the dependency —
 * if `onDrop` starts reading `container` or `item`, this stops compiling
 * rather than passing `undefined` into it.
 */
export function dropBetween(previousIndex: number,
                            currentIndex: number): CdkDragDrop<DraftPage[]> {
  return { previousIndex, currentIndex } as unknown as CdkDragDrop<DraftPage[]>;
}

export interface OrganiserHarness {
  readonly fixture: ComponentFixture<PageOrganiserComponent>;
  readonly organiser: PageOrganiserComponent;
  readonly state: ViewerStateService;
  readonly httpMock: HttpTestingController;
  /** Puts `count` thumbnails into the viewer and renders them. */
  loadPages(count: number): void;
  /** Ids of the draft pages, which the selection is keyed on. */
  ids(): number[];
  /**
   * The id of the nth draft page.
   *
   * <p>A named accessor rather than `ids()[n]` at each call site: indexing
   * yields `number | undefined`, and every use follows a setup that
   * guarantees the page exists. Asserting once, here, keeps a genuine absence
   * a loud failure naming the index rather than a `TypeError` deep inside the
   * component.
   */
  idAt(index: number): number;
  sourceOrder(): number[];
}

export function createOrganiser(): OrganiserHarness {
  TestBed.configureTestingModule({
    imports: [PageOrganiserComponent],
    providers: [provideHttpClient(), provideHttpClientTesting(), ViewerStateService]
  });
  const fixture   = TestBed.createComponent(PageOrganiserComponent);
  const organiser = fixture.componentInstance;
  const state     = TestBed.inject(ViewerStateService);
  const httpMock  = TestBed.inject(HttpTestingController);
  state.documentId.set(7);
  fixture.detectChanges();

  const ids = () => organiser.pages.pages().map(page => page.id);

  return {
    fixture, organiser, state, httpMock,
    loadPages(count: number) {
      state.thumbnails.set(
        Array.from({ length: count }, (_, index) => ({
          pageNumber: index + 1,
          dataUrl: `data:image/jpeg;base64,page${index + 1}`
        }))
      );
      fixture.detectChanges();
    },
    ids,
    idAt: (index: number) => definitely(ids()[index], `draft page ${index}`),
    sourceOrder: () => organiser.pages.pages().map(page => page.sourcePage),
  };
}
