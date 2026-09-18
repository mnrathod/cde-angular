/**
 * Choosing a file and the metadata it is filed under.
 *
 * <p>The drop handler and the file picker have to agree — they are the two
 * halves of SC 2.5.7's single-pointer alternative, and a drop that skipped the
 * name-proposing step would leave a keyboard user and a mouse user with
 * different forms in front of them.
 */
import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { of, throwError } from "rxjs";

import { ChunkedUploadService } from "../../core/services/chunked-upload.service";
import { DocumentUploadDialogComponent } from "./document-upload-dialog.component";

/** A file whose contents are irrelevant — only its name is ever read. */
function file(name: string): File {
  return new File(["synthetic"], name, { type: "application/pdf" });
}

/** A change event as the file input would raise it. */
function selectionOf(chosen: File): Event {
  const input = Object.assign(document.createElement("input"), {
    type: "file",
  });
  Object.defineProperty(input, "files", { value: [chosen] });
  return { target: input } as unknown as Event;
}

/** A drop event as the drop zone would receive it. */
function dropOf(chosen: File | null): DragEvent {
  return {
    preventDefault: () => undefined,
    dataTransfer: { files: chosen ? [chosen] : [] },
  } as unknown as DragEvent;
}

describe("DocumentUploadDialogComponent", () => {
  let fixture: ComponentFixture<DocumentUploadDialogComponent>;
  let dialog: DocumentUploadDialogComponent;
  let uploads: ChunkedUploadService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    uploads = TestBed.inject(ChunkedUploadService);
    fixture = TestBed.createComponent(DocumentUploadDialogComponent);
    fixture.componentRef.setInput("projectId", 7);
    dialog = fixture.componentInstance;
    fixture.detectChanges();
  });

  it("proposes the file's name without its extension", () => {
    // Saves retyping what the person already named the file, and ".pdf" in a
    // document title is noise once it is in a document library.
    dialog.onFileSelect(selectionOf(file("site-plan.pdf")));

    expect(dialog.metadata.name).toBe("site-plan");
  });

  it("proposes the same name for a dropped file", () => {
    dialog.onDrop(dropOf(file("site-plan.pdf")));

    expect(dialog.metadata.name).toBe("site-plan");
  });

  it("keeps the dots inside a name and drops only the last part", () => {
    dialog.onDrop(dropOf(file("plan.rev.b.pdf")));

    expect(dialog.metadata.name).toBe("plan.rev.b");
  });

  it("ignores a drop that carried no file", () => {
    // Dragging selected text onto the zone raises a drop with no files.
    dialog.onDrop(dropOf(null));

    expect(dialog.chosenFile()).toBeNull();
  });

  it("does nothing when asked to upload with no file chosen", () => {
    const upload = vi.spyOn(uploads, "upload");

    dialog.upload();

    expect(upload).not.toHaveBeenCalled();
  });

  it("files the upload under the project it was opened for", () => {
    const upload = vi.spyOn(uploads, "upload").mockReturnValue(of({} as never));
    dialog.onDrop(dropOf(file("site-plan.pdf")));

    dialog.upload();

    expect(upload).toHaveBeenCalledWith(
      expect.any(File),
      7,
      expect.objectContaining({ name: "site-plan", documentType: "DRAWING" }),
    );
  });

  it("sends the name the user typed over the one derived from the file", () => {
    const upload = vi.spyOn(uploads, "upload").mockReturnValue(of({} as never));
    dialog.onDrop(dropOf(file("scan0042.pdf")));
    dialog.metadata.name = "Ground floor plan";

    dialog.upload();

    expect(upload).toHaveBeenCalledWith(
      expect.any(File),
      7,
      expect.objectContaining({ name: "Ground floor plan" }),
    );
  });

  it("closes once the file is sent", () => {
    vi.spyOn(uploads, "upload").mockReturnValue(of({} as never));
    const closed = vi.fn();
    dialog.closed.subscribe(closed);
    dialog.onDrop(dropOf(file("site-plan.pdf")));

    dialog.upload();

    expect(closed).toHaveBeenCalled();
  });

  it("keeps the chosen file after a failure, so it need not be picked again", () => {
    vi.spyOn(uploads, "upload").mockReturnValue(throwError(() => ({})));
    const closed = vi.fn();
    dialog.closed.subscribe(closed);
    dialog.onDrop(dropOf(file("site-plan.pdf")));

    dialog.upload();

    expect(closed).not.toHaveBeenCalled();
    expect(dialog.chosenFile()?.name).toBe("site-plan.pdf");
    expect(dialog.uploading()).toBe(false);
  });

  it("refuses to send the same file twice while the first is in flight", () => {
    // The submit button is disabled while uploading, but a double-press
    // before change detection runs would otherwise get through.
    const upload = vi.spyOn(uploads, "upload").mockReturnValue(of({} as never));
    dialog.onDrop(dropOf(file("site-plan.pdf")));
    dialog.uploading.set(true);

    dialog.upload();

    expect(upload).not.toHaveBeenCalled();
  });
});
