/**
 * Fetching the two documents a visual comparison shows.
 *
 * <p>The first test is the one that matters. The PDF bytes were being
 * requested from `/api/viewer/{id}`, which returns the document's JSON
 * metadata; the bytes are at `/api/viewer/{id}/pdf`. pdf.js was being handed
 * a JSON document to open, so the comparison never rendered a PDF. Asserting
 * the URL is how that stays fixed, because the symptom — two blank canvases
 * — looks identical to a drawing that simply has nothing on it.
 */
import { HttpClient } from "@angular/common/http";
import { TestBed } from "@angular/core/testing";
import { of, throwError } from "rxjs";

import { CompareDocumentsLoader } from "./compare-documents-loader";
import { PdfEngineService } from "../../../../viewer-core/pdf-engine.service";

function loaderWith(responses: Record<string, unknown>, failOn?: string) {
  const requested: string[] = [];
  const http = {
    get: (url: string, _options?: unknown) => {
      requested.push(url);
      if (failOn && url.includes(failOn)) {
        return throwError(() => ({
          status: 404,
          error: { detail: "That revision has been superseded.", traceId: "abc123" },
        }));
      }
      return of(responses[url] ?? {});
    },
  };
  const engine = {
    ensureLoaded: async () => {},
    openDocument: async () => ({ numPages: 3 }),
  };

  TestBed.configureTestingModule({
    providers: [
      CompareDocumentsLoader,
      { provide: HttpClient, useValue: http },
      { provide: PdfEngineService, useValue: engine },
    ],
  });
  return { loader: TestBed.inject(CompareDocumentsLoader), requested };
}

const PDF_METADATA = { type: "pdf", name: "Ground floor plan", revision: "P02" };

describe("loading two documents to compare", () => {
  it("asks for the PDF bytes from the route that serves bytes", async () => {
    const { loader, requested } = loaderWith({
      "/api/viewer/1": PDF_METADATA,
      "/api/viewer/2": PDF_METADATA,
    });

    await loader.load(1, 2);

    expect(requested).toContain("/api/viewer/1/pdf");
    expect(requested).toContain("/api/viewer/2/pdf");
  });

  it("prefers the URL the server named, when it named one", async () => {
    const { loader, requested } = loaderWith({
      "/api/viewer/1": { ...PDF_METADATA, pdfUrl: "/api/viewer/1/pdf?v=3" },
      "/api/viewer/2": PDF_METADATA,
    });

    await loader.load(1, 2);

    expect(requested).toContain("/api/viewer/1/pdf?v=3");
  });

  it("opens both documents and reports their pages", async () => {
    const { loader } = loaderWith({
      "/api/viewer/1": PDF_METADATA,
      "/api/viewer/2": PDF_METADATA,
    });

    const pair = await loader.load(1, 2);

    expect(pair?.[0].pdfDoc?.numPages).toBe(3);
    expect(pair?.[1].document.revision).toBe("P02");
  });

  it("asks for no bytes at all for a document that is not a PDF", async () => {
    const { loader, requested } = loaderWith({
      "/api/viewer/1": { type: "svg", name: "Site plan" },
      "/api/viewer/2": { type: "svg", name: "Site plan rev B" },
    });

    const pair = await loader.load(1, 2);

    expect(requested.filter((url) => url.includes("/pdf"))).toEqual([]);
    expect(pair?.[0].pdfDoc).toBeUndefined();
  });

  describe("when a document will not load", () => {
    it("shows the server's explanation", async () => {
      const { loader } = loaderWith({ "/api/viewer/1": PDF_METADATA }, "/api/viewer/2");

      await loader.load(1, 2);

      expect(loader.errorMsg()).toContain("superseded");
    });

    it("gives a reference to quote to support", async () => {
      const { loader } = loaderWith({ "/api/viewer/1": PDF_METADATA }, "/api/viewer/2");

      await loader.load(1, 2);

      expect(loader.errorMsg()).toContain("abc123");
    });

    it("stops the spinner, so a failed comparison does not look busy", async () => {
      // It used to leave loading true, so the failure message appeared
      // beside a spinner that kept turning.
      const { loader } = loaderWith({ "/api/viewer/1": PDF_METADATA }, "/api/viewer/2");

      await loader.load(1, 2);

      expect(loader.loading()).toBe(false);
    });

    it("returns nothing, so the caller does not draw half a comparison", async () => {
      const { loader } = loaderWith({ "/api/viewer/1": PDF_METADATA }, "/api/viewer/2");

      expect(await loader.load(1, 2)).toBeNull();
    });

    it("clears an earlier failure when asked again", async () => {
      const { loader } = loaderWith({
        "/api/viewer/1": PDF_METADATA,
        "/api/viewer/2": PDF_METADATA,
      });
      loader.errorMsg.set("something from last time");

      await loader.load(1, 2);

      expect(loader.errorMsg()).toBe("");
    });
  });
});
