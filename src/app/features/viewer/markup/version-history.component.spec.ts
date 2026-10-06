/**
 * The document's processing history.
 *
 * <p>Redaction, OCR, flattening and form-filling each commit a version rather
 * than handing back a download, which is what lets them be combined. This panel
 * is where that chain becomes visible and where a step that went wrong can be
 * undone — so it is the viewer's only route back, and that makes three things
 * here load-bearing.
 *
 * <p>**It reloads whenever an operation commits.** The panel is the record of
 * those commits, so a stale list is stale at exactly the moment it matters most:
 * the reader has just redacted something and is looking here to confirm it
 * happened.
 *
 * <p>**Restoring copies forward rather than rewinding.** Nothing in the history
 * is lost, and the confirmation says so — a reader who thinks "restore" discards
 * the intervening versions reasonably hesitates over the one control that would
 * recover from a bad step.
 *
 * <p>**Only the version being restored shows progress.** A single boolean would
 * disable and relabel every row's button at once, which reads as all of them
 * being restored.
 */
import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { NEVER, of, throwError } from "rxjs";

import { ViewerStateService } from "../../../../viewer-core/viewer-state.service";
import {
  DocumentVersion,
  DocumentVersionService,
} from "../../../core/services/document-version.service";
import { VersionHistoryComponent } from "./version-history.component";

function version(overrides: Partial<DocumentVersion> = {}): DocumentVersion {
  return {
    version: 1,
    operation: "UPLOAD",
    summary: "Original upload",
    fileName: "plan.pdf",
    fileSize: 2048,
    contentHash: null,
    createdBy: "sam.okonkwo",
    createdAt: "2026-02-01T09:00:00Z",
    current: false,
    ...overrides,
  } as DocumentVersion;
}

describe("VersionHistoryComponent", () => {
  let fixture: ComponentFixture<VersionHistoryComponent>;
  let panel: VersionHistoryComponent;
  let state: ViewerStateService;
  let versions: DocumentVersionService;

  let listed: DocumentVersion[];
  let listFails: unknown;
  let listCalls: number[];

  beforeEach(() => {
    listed = [];
    listFails = null;
    listCalls = [];

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), ViewerStateService],
    });
    state = TestBed.inject(ViewerStateService);
    versions = TestBed.inject(DocumentVersionService);

    vi.spyOn(versions, "listVersions").mockImplementation((documentId: number) => {
      listCalls.push(documentId);
      return listFails ? throwError(() => listFails) : of(listed);
    });

    fixture = TestBed.createComponent(VersionHistoryComponent);
    panel = fixture.componentInstance;
  });

  afterEach(() => vi.restoreAllMocks());

  /** Opens the panel for a document whose history is `history`. */
  function openWith(history: DocumentVersion[]): void {
    listed = history;
    state.documentId.set(42);
    state.viewerData.set({ name: "foundation-plan.pdf", type: "pdf" } as never);
    fixture.detectChanges();
  }

  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? "";
  }

  /**
   * Captures the anchor the download path builds, without replacing
   * createElement wholesale.
   *
   * <p>A blanket mock on document.createElement breaks Angular's own rendering,
   * which runs through the same function — so this intercepts only the one tag
   * the download uses and lets every other call through.
   */
  function captureDownloadLink(): HTMLAnchorElement {
    const link = globalThis.document.createElement("a");
    link.click = vi.fn();
    const real = globalThis.document.createElement.bind(globalThis.document);
    vi.spyOn(globalThis.document, "createElement").mockImplementation(
      ((tag: string, options?: ElementCreationOptions) =>
        tag === "a" ? link : real(tag, options)) as never,
    );
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:x");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(versions, "downloadVersion").mockReturnValue(of(new Blob(["%PDF"])));
    return link;
  }

  function buttonsSaying(label: string): HTMLButtonElement[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll("button") as NodeListOf<HTMLButtonElement>,
    ).filter((button) => button.textContent?.includes(label));
  }

  describe("loading the history", () => {
    it("fetches it when a document is open", () => {
      openWith([version()]);

      expect(listCalls).toEqual([42]);
    });

    it("fetches nothing before a document is open", () => {
      // Document zero is a request that cannot succeed, and its failure would
      // paint an error over a panel the reader has not opened.
      fixture.detectChanges();

      expect(listCalls).toEqual([]);
    });

    it("reloads when an operation commits", () => {
      // The panel is the record of those commits. A list that does not reload is
      // stale at the moment it matters most — the reader has just redacted
      // something and is looking here to confirm it happened.
      openWith([version()]);

      state.reloadToken.set(1);
      fixture.detectChanges();

      expect(listCalls).toEqual([42, 42]);
    });

    it("can be refreshed by hand", () => {
      openWith([version()]);

      const refresh = fixture.nativeElement.querySelector(
        'button[aria-label="Refresh history"]',
      ) as HTMLButtonElement;
      refresh.click();

      expect(listCalls).toHaveLength(2);
    });

    it("the refresh control is named, not left as a bare glyph", () => {
      // §1A.2: "↻" announces as nothing useful.
      openWith([version()]);

      expect(
        fixture.nativeElement.querySelector('button[aria-label="Refresh history"]'),
      ).not.toBeNull();
    });
  });

  describe("a document with no history", () => {
    it("says so rather than showing an empty panel", () => {
      openWith([]);

      expect(text()).toContain("No history");
    });

    it("says nothing about being empty while it is still loading", () => {
      // "No history" during the first fetch tells the reader their versions are
      // gone. A request that never settles is what holds the panel in that
      // state long enough to look at — the stub above answers synchronously, so
      // setting the flag afterwards would be overwritten by the response.
      vi.mocked(versions.listVersions).mockReturnValue(NEVER);
      state.documentId.set(42);
      fixture.detectChanges();

      expect(panel.loading()).toBe(true);
      expect(text()).not.toContain("No history");
    });
  });

  describe("what each version says", () => {
    it("numbers it the way the history lists it", () => {
      openWith([version({ version: 3 })]);

      expect(text()).toContain("v3");
    });

    it("names the operation that produced it", () => {
      openWith([version({ operation: "REDACT" })]);

      expect(text()).not.toContain("REDACT");
      expect(text().length).toBeGreaterThan(0);
    });

    it("carries the summary the server wrote", () => {
      openWith([version({ summary: "2 regions redacted on page 4" })]);

      expect(text()).toContain("2 regions redacted on page 4");
    });

    it("omits the summary line entirely when there is none", () => {
      // An empty paragraph leaves a gap that reads as a value still loading.
      openWith([version({ summary: "" })]);

      expect(text()).not.toContain("undefined");
    });

    it("names who made it", () => {
      openWith([version({ createdBy: "sam.okonkwo" })]);

      expect(text()).toContain("sam.okonkwo");
    });

    it("survives a version whose author's record has gone", () => {
      // A user removed with the document retained for the audit trail. The
      // version still has to list, because it is the contractual record of what
      // the document was.
      openWith([version({ createdBy: null })]);

      expect(text()).toContain("v1");
      expect(text()).not.toContain("null");
    });

    it("survives a version with no recorded size", () => {
      openWith([version({ fileSize: null })]);

      expect(text()).toContain("v1");
      expect(text()).not.toContain("null");
    });

    it("marks the version in use, and marks only that one", () => {
      // §1A.2: the badge is words, not only the green border — a reader who
      // cannot distinguish the border colours still needs to know which version
      // they are looking at.
      openWith([
        version({ version: 1 }),
        version({ version: 2, current: true }),
      ]);

      expect(text()).toContain("current");
      expect(text().match(/current/g)).toHaveLength(1);
    });
  });

  describe("restoring an earlier version", () => {
    it("is offered on every version except the one in use", () => {
      // §1.1: restoring the current version is a no-op, so the control does not
      // belong on that row.
      openWith([
        version({ version: 1 }),
        version({ version: 2, current: true }),
      ]);

      expect(buttonsSaying("Restore")).toHaveLength(1);
    });

    it("asks first, and says that nothing will be lost", () => {
      // The question a reader actually has. Without it, the one control that
      // recovers from a bad step looks like the one that would destroy the
      // evidence of it.
      const asked: string[] = [];
      vi.stubGlobal("confirm", (question: string) => {
        asked.push(question);
        return false;
      });
      openWith([version({ version: 1 }), version({ version: 2, current: true })]);

      buttonsSaying("Restore")[0]!.click();

      expect(asked[0]).toContain("1");
      expect(asked[0]!.toLowerCase()).toContain("nothing in the history is lost");
      vi.unstubAllGlobals();
    });

    it("does nothing when the reader says no", () => {
      vi.stubGlobal("confirm", () => false);
      const restore = vi.spyOn(versions, "restore");
      openWith([version({ version: 1 }), version({ version: 2, current: true })]);

      buttonsSaying("Restore")[0]!.click();

      expect(restore).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it("commits the restored version so the viewer reloads", () => {
      // Restoring that left the viewer showing the old bytes would be worse than
      // not restoring: the reader would believe it had not worked and do it again.
      vi.stubGlobal("confirm", () => true);
      vi.spyOn(versions, "restore").mockReturnValue(
        of(version({ version: 3, summary: "Restored from v1" })),
      );
      openWith([version({ version: 1 }), version({ version: 2, current: true })]);

      buttonsSaying("Restore")[0]!.click();
      fixture.detectChanges();

      expect(state.reloadToken()).toBeGreaterThan(0);
      vi.unstubAllGlobals();
    });

    it("shows progress on the row being restored and no other", () => {
      // A single boolean would disable and relabel every row at once, which
      // reads as all of them being restored.
      vi.stubGlobal("confirm", () => true);
      vi.spyOn(versions, "restore").mockReturnValue(new (class {
        subscribe() {
          return { unsubscribe() {} };
        }
      })() as never);
      openWith([
        version({ version: 1 }),
        version({ version: 2 }),
        version({ version: 3, current: true }),
      ]);

      buttonsSaying("Restore")[0]!.click();
      fixture.detectChanges();

      expect(panel.restoring()).toBe(1);
      expect(text()).toContain("Restoring");
      expect(text().match(/Restoring/g)).toHaveLength(1);
      vi.unstubAllGlobals();
    });

    it("locks the other rows while one restore is in flight", () => {
      // Two restores at once would race to be the newest version, and whichever
      // lost would silently not happen.
      vi.stubGlobal("confirm", () => true);
      vi.spyOn(versions, "restore").mockReturnValue(new (class {
        subscribe() {
          return { unsubscribe() {} };
        }
      })() as never);
      openWith([
        version({ version: 1 }),
        version({ version: 2 }),
        version({ version: 3, current: true }),
      ]);

      buttonsSaying("Restore")[0]!.click();
      fixture.detectChanges();

      expect(
        Array.from(
          fixture.nativeElement.querySelectorAll("button") as NodeListOf<HTMLButtonElement>,
        ).filter((button) => /Restor/.test(button.textContent ?? "")).every((button) => button.disabled),
      ).toBe(true);
      vi.unstubAllGlobals();
    });

    it("says so when the restore failed, and in the reader's own language", () => {
      // This sentence was a plain English literal set on the error signal, which
      // §1.4 does not allow anywhere user-facing — and it reached the reader at
      // the moment something had just gone wrong.
      vi.stubGlobal("confirm", () => true);
      vi.spyOn(versions, "restore").mockReturnValue(throwError(() => new Error("500")));
      openWith([version({ version: 1 }), version({ version: 2, current: true })]);

      buttonsSaying("Restore")[0]!.click();
      fixture.detectChanges();

      expect(panel.error()).toBe(panel.restoreFailedMessage);
      expect(panel.error()).not.toBe("Restore failed.");
      vi.unstubAllGlobals();
    });

    it("says the document is unchanged, so the reader knows where they stand", () => {
      // "Restore failed." leaves open whether the document was half-restored.
      expect(panel.restoreFailedMessage.toLowerCase()).toContain("unchanged");
    });

    it("releases the row when the restore fails, so it can be tried again", () => {
      vi.stubGlobal("confirm", () => true);
      vi.spyOn(versions, "restore").mockReturnValue(throwError(() => new Error("500")));
      openWith([version({ version: 1 }), version({ version: 2, current: true })]);

      buttonsSaying("Restore")[0]!.click();
      fixture.detectChanges();

      expect(panel.restoring()).toBeNull();
      vi.unstubAllGlobals();
    });
  });

  describe("downloading a version", () => {
    it("names the file after the document and the version", () => {
      // A folder of files all called "download.pdf" is a folder nobody can use,
      // and these are the versions of one drawing.
      openWith([version({ version: 3 })]);
      const link = captureDownloadLink();

      buttonsSaying("Download")[0]!.click();

      expect(link.download).toBe("foundation-plan_v3.pdf");
      expect(link.click).toHaveBeenCalled();
    });

    it("drops the original extension rather than doubling it", () => {
      // "foundation-plan.pdf_v3.pdf" is what naive concatenation gives.
      openWith([version({ version: 3 })]);
      const link = captureDownloadLink();

      buttonsSaying("Download")[0]!.click();

      expect(link.download).not.toContain(".pdf_v");
    });

    it("releases the blob url once the download has started", () => {
      // Each one holds the whole file in memory until revoked, and this panel
      // hands out a version at a time on a document that may be hundreds of
      // megabytes (§7.7).
      openWith([version({ version: 3 })]);
      captureDownloadLink();

      buttonsSaying("Download")[0]!.click();

      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:x");
    });

    it("falls back to a usable name for a document with none", () => {
      listed = [version({ version: 2 })];
      state.documentId.set(42);
      state.viewerData.set(null);
      fixture.detectChanges();
      const link = captureDownloadLink();

      buttonsSaying("Download")[0]!.click();

      expect(link.download).toBe("document_v2.pdf");
    });
  });

  describe("when the history cannot be loaded", () => {
    it("says so in the reader's own language", () => {
      // The fallback was a plain English literal passed to problemMessage.
      listFails = new Error("500");
      state.documentId.set(42);
      fixture.detectChanges();

      expect(panel.error()).toBe(panel.loadFailedMessage);
      expect(panel.error()).not.toBe("Could not load version history.");
    });

    it("names something the reader can do about it", () => {
      // §1.4: what happened, why, and what to do next, with a correlation id to
      // quote.
      expect(panel.loadFailedMessage.toLowerCase()).toContain("trace id");
    });

    it("stops saying it is loading", () => {
      listFails = new Error("500");
      state.documentId.set(42);
      fixture.detectChanges();

      expect(panel.loading()).toBe(false);
    });

    it("shows the failure instead of the empty state", () => {
      // "No history for this document" after a failed fetch is a lie about the
      // document rather than a report about the request.
      listFails = new Error("500");
      state.documentId.set(42);
      fixture.detectChanges();

      expect(text()).not.toContain("No history");
    });

    it("clears a previous failure when a later load succeeds", () => {
      // An error left on screen after a successful refresh makes the reader
      // distrust the list they are looking at.
      listFails = new Error("500");
      state.documentId.set(42);
      fixture.detectChanges();
      expect(panel.error()).not.toBe("");

      listFails = null;
      listed = [version()];
      state.reloadToken.set(1);
      fixture.detectChanges();

      expect(panel.error()).toBe("");
    });
  });
});
