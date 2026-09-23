/**
 * Reaching the command bar without a pointer, and on a Mac.
 *
 * <p>Two things here could not be done from a keyboard at all. Import was a
 * `<label>` wrapping `<input type="file" class="hidden">` — `display: none`
 * takes an input out of the tab order and a label is not focusable, so the
 * control had no keyboard route (SC 2.1.1, and §1A.4 says so of file upload
 * specifically). And every shortcut tested `ctrlKey` alone, so on a Mac,
 * where the convention is Command, none of save, undo, redo or print worked.
 */
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";

import { ViewerStateService } from "../../../../viewer-core/viewer-state.service";
import { MarkupToolbarComponent } from "./markup-toolbar.component";
import { DocumentOperationsService } from "./document-operations.service";

describe("the command bar", () => {
  let fixture: ComponentFixture<MarkupToolbarComponent>;
  let toolbar: MarkupToolbarComponent;
  let state: ViewerStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MarkupToolbarComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ViewerStateService,
        DocumentOperationsService,
      ],
    });
    fixture = TestBed.createComponent(MarkupToolbarComponent);
    toolbar = fixture.componentInstance;
    state = TestBed.inject(ViewerStateService);
    fixture.detectChanges();
  });

  function host() {
    return fixture.nativeElement as HTMLElement;
  }

  function press(key: string, modifiers: Partial<KeyboardEventInit> = {}) {
    toolbar.onKey(new KeyboardEvent("keydown", { key, ...modifiers }));
  }

  describe("importing annotations", () => {
    it("leaves the file input in the tab order", () => {
      // `hidden` is display:none, which removes it. `sr-only` does not.
      const input = host().querySelector<HTMLInputElement>('input[type="file"]');

      expect(input).not.toBeNull();
      expect(input!.classList.contains("hidden")).toBe(false);
    });

    it("gives the file input a label that names it", () => {
      const input = host().querySelector<HTMLInputElement>('input[type="file"]');
      const label = host().querySelector<HTMLLabelElement>(`label[for="${input!.id}"]`);

      expect(label).not.toBeNull();
      expect(label!.textContent!.trim().length).toBeGreaterThan(0);
    });
  });

  describe("the shortcuts", () => {
    it("undoes on Ctrl+Z", () => {
      const undo = vi.spyOn(state, "undo");

      press("z", { ctrlKey: true });

      expect(undo).toHaveBeenCalled();
    });

    it("undoes on Cmd+Z, because a Mac has no Ctrl convention", () => {
      const undo = vi.spyOn(state, "undo");

      press("z", { metaKey: true });

      expect(undo).toHaveBeenCalled();
    });

    it("redoes on Ctrl+Shift+Z, the spelling most editors use", () => {
      const redo = vi.spyOn(state, "redo");

      press("Z", { ctrlKey: true, shiftKey: true });

      expect(redo).toHaveBeenCalled();
    });

    it("still redoes on Ctrl+Y", () => {
      const redo = vi.spyOn(state, "redo");

      press("y", { ctrlKey: true });

      expect(redo).toHaveBeenCalled();
    });

    it("asks to save on Cmd+S", () => {
      let asked = false;
      toolbar.saveRequested.subscribe(() => (asked = true));

      press("s", { metaKey: true });

      expect(asked).toBe(true);
    });

    it("does not switch tool while someone is typing a note", () => {
      // Every letter typed into a callout body would otherwise change tool.
      // Dispatched from a real element in the document rather than assigned
      // onto the event: `target` is read-only, and the bar reads it.
      const before = state.activeTool();
      const textarea = document.createElement("textarea");
      document.body.appendChild(textarea);

      textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "r", bubbles: true }));

      expect(state.activeTool()).toBe(before);
      textarea.remove();
    });
  });

  describe("the zoom reading", () => {
    it("shows the zoom as a percentage", () => {
      state.zoom.set(1.5);
      fixture.detectChanges();

      expect(host().textContent).toContain("150");
    });

    it("formats it for the reader's locale rather than concatenating a symbol", () => {
      // The template read `{{ (zoom * 100).toFixed(0) }}%` — a bare symbol
      // the markup sweep cannot see and a translator never receives, and
      // where the symbol goes is not the same in every locale. Digit
      // grouping is the part of that difference this locale can show: the
      // old expression gave "1234%", a formatter gives "1,234%".
      state.zoom.set(12.34);
      fixture.detectChanges();

      // Read from the page rather than from a method, because the reading
      // moved to the view controls and a test calling the old method would
      // have kept passing while nothing reached the screen.
      expect(host().textContent).not.toContain("1234");
      expect(host().textContent).toMatch(/%|percent/i);
    });
  });

  describe("what the bar announces", () => {
    it("announces a finished operation rather than only showing it", () => {
      state.processingMessage.set("Saved as version 4");
      fixture.detectChanges();

      const region = host().querySelector('[role="status"]');
      expect(region?.getAttribute("aria-live")).toBe("polite");
      expect(region?.textContent).toContain("version 4");
    });
  });
});
