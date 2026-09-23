/**
 * Taking pages from another document in the project.
 *
 * <p>Where the pages land is the part worth guarding: selecting pages 1 and 2
 * and inserting has to land after 2, and taking the first selected page
 * instead would bury the inserted block inside the selection — the opposite
 * of what the gesture means.
 */
import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";

import { ViewerStateService } from "../../../../viewer-core/viewer-state.service";
import { InsertPagesPanelComponent } from "./insert-pages-panel.component";

describe("InsertPagesPanelComponent", () => {
  let fixture: ComponentFixture<InsertPagesPanelComponent>;
  let panel: InsertPagesPanelComponent;
  let http: HttpTestingController;
  let state: ViewerStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ViewerStateService,
      ],
    });
    state = TestBed.inject(ViewerStateService);
    state.documentId.set(7);
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(InsertPagesPanelComponent);
    panel = fixture.componentInstance;
  });

  /** Answers the two requests the panel makes when it opens. */
  function offerSiblings(): void {
    http.expectOne("/api/documents/7").flush({ id: 7, projectId: 4 });
    http
      .expectOne((request) => request.url === "/api/documents/project/4")
      .flush([
        { id: 7, name: "This one", fileName: "a.pdf", fileType: "application/pdf", projectId: 4 },
        { id: 8, name: "Sibling", fileName: "b.pdf", fileType: "application/pdf", projectId: 4 },
        { id: 9, name: "A drawing", fileName: "c.dwg", fileType: "image/vnd.dwg", projectId: 4 },
      ]);
  }

  it("offers only the other PDFs in the same project", () => {
    // The document being edited would be a self-insert, and a DWG has no
    // pages to take.
    offerSiblings();

    expect(panel.insertion.candidates().map((candidate) => candidate.id)).toEqual([8]);
  });

  it("asks the donor for its page count and inserts all of them", () => {
    offerSiblings();

    panel.insertFrom(8);

    http.expectOne("/api/documents/8/pages").flush({
      success: true,
      pageCount: 3,
      pages: [{ page: 1 }, { page: 2 }, { page: 3 }],
    });
    const request = http.expectOne("/api/documents/7/pages/insert");
    expect(request.request.body.pages).toEqual([1, 2, 3]);
    expect(request.request.body.sourceDocumentId).toBe(8);

    request.flush({
      success: true,
      documentId: 7,
      version: 2,
      summary: 'Inserted 3 page(s) from "Sibling"',
      pageCount: 5,
      createdAt: "2026-08-08T10:00:00",
    });

    expect(state.currentVersion()).toBe(2);
  });

  it("inserts at the position it was given", () => {
    fixture.componentRef.setInput("insertPosition", 3);
    offerSiblings();

    panel.insertFrom(8);
    http
      .expectOne("/api/documents/8/pages")
      .flush({ success: true, pageCount: 1, pages: [{ page: 1 }] });

    expect(
      http.expectOne("/api/documents/7/pages/insert").request.body.position,
    ).toBe(3);
  });

  it("appends when it was given no position", () => {
    offerSiblings();

    panel.insertFrom(8);
    http
      .expectOne("/api/documents/8/pages")
      .flush({ success: true, pageCount: 1, pages: [{ page: 1 }] });

    expect(
      http.expectOne("/api/documents/7/pages/insert").request.body.position,
    ).toBeUndefined();
  });

  it("says so when the donor has no pages, without calling insert", () => {
    // The server refuses an empty selection and is right to — "insert
    // nothing" is never what someone meant.
    offerSiblings();
    const failures: string[] = [];
    panel.failed.subscribe((message) => failures.push(message));

    panel.insertFrom(8);
    http
      .expectOne("/api/documents/8/pages")
      .flush({ success: true, pageCount: 0, pages: [] });

    http.expectNone("/api/documents/7/pages/insert");
    expect(failures[0]).toContain("no pages to insert");
    expect(panel.insertion.busy()).toBe(false);
  });

  it("names the converter when the converter is what is down", () => {
    offerSiblings();
    const failures: string[] = [];
    panel.failed.subscribe((message) => failures.push(message));

    panel.insertFrom(8);
    http
      .expectOne("/api/documents/8/pages")
      .flush({ success: true, pageCount: 1, pages: [{ page: 1 }] });
    http
      .expectOne("/api/documents/7/pages/insert")
      .flush("", { status: 503, statusText: "Service Unavailable" });

    expect(failures[0]).toContain("conversion service");
    expect(panel.insertion.busy()).toBe(false);
  });

  it("refuses a second insert while the first is in flight", () => {
    offerSiblings();
    panel.insertFrom(8);
    http.expectOne("/api/documents/8/pages");

    panel.insertFrom(9);

    http.expectNone("/api/documents/9/pages");
  });

  it("says where the pages will land", () => {
    offerSiblings();
    const atEnd = panel.insertAtLabel();

    fixture.componentRef.setInput("insertPosition", 3);

    expect(panel.insertAtLabel()).toContain("3");
    expect(panel.insertAtLabel()).not.toBe(atEnd);
  });

  afterEach(() => http.verify());
});
