/**
 * Opening a document, and what a reader is told when it will not open.
 *
 * <p>The failure path is the reason this file exists. It used to read
 * `'Failed to load document: ' + err.message`, which puts an implementation
 * detail on screen in English and gives a reader nothing to quote to support
 * — the two things §1.4 says an error message must not do.
 */
import { HttpClient } from "@angular/common/http";
import { TestBed } from "@angular/core/testing";
import { of, throwError } from "rxjs";

import { AnnotationService } from "../../core/services/viewer/annotation.service";
import { PdfEngineService } from "../../../viewer-core/pdf-engine.service";
import { ViewerDocumentLoader } from "./viewer-document-loader";
import { ViewerStateService } from "../../../viewer-core/viewer-state.service";

/** An RFC 9457 problem document, as the API returns one. */
function problem(detail: string, traceId?: string) {
  return {
    status: 404,
    error: { type: "about:blank", title: "Not Found", status: 404, detail, ...(traceId ? { traceId } : {}) },
  };
}

interface Stubs {
  get: (url: string, options?: unknown) => unknown;
  annotations: unknown[];
  saved: { id: number; shapeData: string }[];
}

function loaderWith(stubs: Partial<Stubs> = {}) {
  const requested: string[] = [];
  const http = {
    get: (url: string, options?: unknown) => {
      requested.push(url);
      return stubs.get ? stubs.get(url, options) : of({ type: "svg", content: "<svg/>" });
    },
  };
  const annotations = {
    loadAnnotations: () => of(stubs.annotations ?? []),
    annotationsToShapes: () => [],
    saveShapes: () => of(stubs.saved ?? []),
  };

  TestBed.configureTestingModule({
    providers: [
      ViewerDocumentLoader,
      ViewerStateService,
      { provide: HttpClient, useValue: http },
      { provide: AnnotationService, useValue: annotations },
      { provide: PdfEngineService, useValue: { openDocument: async () => ({ numPages: 1 }) } },
    ],
  });

  return {
    loader: TestBed.inject(ViewerDocumentLoader),
    state: TestBed.inject(ViewerStateService),
    requested,
  };
}

describe("opening a document", () => {
  it("shows a drawing it was handed", () => {
    const { loader, state } = loaderWith();

    loader.load(7);

    expect(state.viewerData()?.type).toBe("svg");
    expect(state.loading()).toBe(false);
  });

  it("stops showing the spinner once the load finishes", () => {
    const { loader, state } = loaderWith();

    loader.load(7);

    expect(state.loading()).toBe(false);
  });

  describe("when it will not open", () => {
    it("shows the server's own explanation, not the exception", () => {
      const { loader, state } = loaderWith({
        get: () => throwError(() => problem("This revision has been superseded.")),
      });

      loader.load(7);

      expect(state.errorMsg()).toContain("This revision has been superseded.");
    });

    it("gives the reader a reference to quote to support", () => {
      const traceId = "4f8a1c2e9b7d6a5f3e2d1c0b9a8f7e6d";
      const { loader, state } = loaderWith({
        get: () => throwError(() => problem("Not found.", traceId)),
      });

      loader.load(7);

      expect(state.errorMsg()).toContain(traceId);
    });

    it("says what to do next when the server explained nothing", () => {
      const { loader, state } = loaderWith({
        get: () => throwError(() => ({ status: 500, error: null })),
      });

      loader.load(7);

      expect(state.errorMsg()).toContain("could not be opened");
      expect(state.errorMsg()).not.toContain("undefined");
    });

    it("leaks no exception text to the screen", () => {
      // The old wording pasted err.message straight in.
      const { loader, state } = loaderWith({
        get: () =>
          throwError(() => ({
            status: 500,
            error: null,
            message: "Http failure response for /api/viewer/7: 500 Internal Server Error",
          })),
      });

      loader.load(7);

      expect(state.errorMsg()).not.toContain("Http failure response");
    });

    it("clears the spinner, so a failure is not a load that never ends", () => {
      const { loader, state } = loaderWith({
        get: () => throwError(() => problem("Gone.")),
      });

      loader.load(7);

      expect(state.loading()).toBe(false);
    });
  });
});

describe("saving the shapes drawn on a document", () => {
  it("keeps the id the server gave each shape", () => {
    const { loader, state } = loaderWith({
      saved: [{ id: 99, shapeData: JSON.stringify({ id: "local-1" }) }],
    });
    state.documentId.set(7);
    state.shapes.set([{ id: "local-1", tool: "rect", pageNumber: 1 } as never]);

    loader.saveShapes();

    expect(state.shapes()[0]?.savedId).toBe(99);
  });

  it("keeps going past an annotation it cannot read", () => {
    // One unreadable payload must not lose the ids of all the others.
    const { loader, state } = loaderWith({
      saved: [
        { id: 98, shapeData: "not json" },
        { id: 99, shapeData: JSON.stringify({ id: "local-2" }) },
      ],
    });
    state.documentId.set(7);
    state.shapes.set([{ id: "local-2", tool: "rect", pageNumber: 1 } as never]);

    expect(() => loader.saveShapes()).not.toThrow();
    expect(state.shapes()[0]?.savedId).toBe(99);
  });

  it("asks for nothing when there is nothing drawn", () => {
    const { loader, state } = loaderWith();
    state.shapes.set([]);
    const saved = state.annotations();

    loader.saveShapes();

    expect(state.annotations()).toBe(saved);
  });
});
