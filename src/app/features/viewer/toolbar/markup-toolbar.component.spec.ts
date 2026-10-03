/**
 * The command bar above the document, and its keyboard map.
 *
 * <p>The keyboard map is the part that has already been a defect twice, and
 * both defects were silent.
 *
 * <p>**`ctrlKey` alone meant none of the shortcuts worked on a Mac**, where the
 * convention is Command — so a Mac reader had no keyboard route to save, undo
 * or print from the viewer at all. Nothing failed; the keys simply did nothing.
 * Every shortcut here is therefore asserted on both modifiers.
 *
 * <p>**A single-letter tool shortcut fired while typing.** The note and callout
 * bodies are `textarea` and contenteditable rather than `input`, so a guard that
 * checked only for `INPUT` let every letter typed into a comment also switch
 * tool — the reader would type "area" and find themselves holding the rectangle,
 * the ellipse, the eraser and the arrow in turn.
 *
 * <p>Two controls on this bar are destructive and ask first. "Delete all markup"
 * sits immediately beside undo and redo, which are not, so a misclick would
 * otherwise cost a whole markup session; flattening cannot be undone at all.
 * §1.3 prefers undo over confirmation for reversible actions, which is exactly
 * why the two irreversible ones are the ones that get a dialog.
 */
import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { ComponentFixture, TestBed } from "@angular/core/testing";

import { ViewerStateService } from "../../../../viewer-core/viewer-state.service";
import { DocumentOperationsService } from "./document-operations.service";
import { MarkupToolbarComponent } from "./markup-toolbar.component";

describe("MarkupToolbarComponent", () => {
  let fixture: ComponentFixture<MarkupToolbarComponent>;
  let toolbar: MarkupToolbarComponent;
  let state: ViewerStateService;

  let confirmed: boolean;
  let questionsAsked: string[];
  let operations: DocumentOperationsService;

  beforeEach(() => {
    confirmed = true;
    questionsAsked = [];

    vi.stubGlobal("confirm", (question: string) => {
      questionsAsked.push(question);
      return confirmed;
    });

    TestBed.resetTestingModule();
    // The real operations service rather than a stub. The command bar renders
    // the document actions and the context bar, which between them read half a
    // dozen of its signals, and a stub that satisfies the three this file
    // asserts on leaves the others undefined — which fails as a template error
    // rather than as anything to do with the behaviour under test.
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ViewerStateService,
        DocumentOperationsService,
      ],
    });
    state = TestBed.inject(ViewerStateService);
    operations = TestBed.inject(DocumentOperationsService);
    state.viewerData.set({ type: "pdf", name: "Plan" } as never);
    fixture = TestBed.createComponent(MarkupToolbarComponent);
    toolbar = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => vi.unstubAllGlobals());

  /**
   * A keypress arriving the way the host binding delivers one.
   *
   * <p>The target matters: the handler asks whether the reader is typing, which
   * it answers from the element the event came from. A synthetic event that was
   * never dispatched has no target at all, which no real keydown does — so the
   * helper supplies the body, as a press with nothing focused would.
   */
  function press(key: string, modifiers: Partial<KeyboardEventInit> = {}): void {
    pressInto(globalThis.document.body, key, modifiers);
  }

  /** A keypress whose target is the given element, as a focused field would be. */
  function pressInto(
    target: HTMLElement,
    key: string,
    modifiers: Partial<KeyboardEventInit> = {},
  ): void {
    const event = new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
      ...modifiers,
    });
    Object.defineProperty(event, "target", { value: target });
    toolbar.onKey(event);
    fixture.detectChanges();
  }

  function byLabel(label: string): HTMLButtonElement | null {
    return fixture.nativeElement.querySelector(`button[aria-label="${label}"]`);
  }

  /** Puts a shape on the document so there is markup to undo or discard. */
  function drawSomething(): void {
    state.shapes.set([{ id: 1, tool: "rect", pageNumber: 1 }] as never);
    state.undoStack.set([[]] as never);
    fixture.detectChanges();
  }

  describe("undo and redo", () => {
    it("are offered but not operable with nothing to undo", () => {
      // Disabled rather than hidden: these two never move, and a reader who has
      // learned where undo is should not find it gone on a fresh document.
      expect(byLabel("Undo")!.disabled).toBe(true);
      expect(byLabel("Redo")!.disabled).toBe(true);
    });

    it("undo becomes operable once something has been drawn", () => {
      drawSomething();

      expect(byLabel("Undo")!.disabled).toBe(false);
    });

    it("each is announced, not left as a bare icon", () => {
      // §1A.2: an icon-only button announces as "button".
      for (const label of ["Undo", "Redo", "Delete all markup"]) {
        expect(byLabel(label)).not.toBeNull();
      }
    });

    it("undo runs from the button", () => {
      drawSomething();

      byLabel("Undo")!.click();

      expect(state.shapes()).toEqual([]);
    });
  });

  describe("the keyboard shortcuts", () => {
    for (const modifier of ["ctrlKey", "metaKey"] as const) {
      it(`undo works with ${modifier}, so the Mac convention is not left out`, () => {
        // The defect: ctrlKey alone meant a Mac reader had no keyboard route to
        // undo, save or print at all, and nothing failed to say so.
        drawSomething();

        press("z", { [modifier]: true });

        expect(state.shapes()).toEqual([]);
      });

      it(`redo works with ${modifier} and Y`, () => {
        drawSomething();
        press("z", { [modifier]: true });

        press("y", { [modifier]: true });

        expect(state.shapes()).toHaveLength(1);
      });

      it(`redo works with ${modifier}, Shift and Z — the spelling most editors use`, () => {
        drawSomething();
        press("z", { [modifier]: true });

        press("Z", { [modifier]: true, shiftKey: true });

        expect(state.shapes()).toHaveLength(1);
      });

      it(`save works with ${modifier}`, () => {
        let asked = 0;
        toolbar.saveRequested.subscribe(() => (asked += 1));

        press("s", { [modifier]: true });

        expect(asked).toBe(1);
      });

      it(`print works with ${modifier}`, () => {
        let asked = 0;
        toolbar.printRequested.subscribe(() => (asked += 1));

        press("p", { [modifier]: true });

        expect(asked).toBe(1);
      });
    }

    it("the redo spelling is matched whatever case the browser reports", () => {
      // Shift+Z reports `key` as "Z", so a comparison against 'z' misses it.
      drawSomething();
      press("z", { ctrlKey: true });

      press("z", { ctrlKey: true, shiftKey: true });

      expect(state.shapes()).toHaveLength(1);
    });

    it("a plain letter picks up a tool", () => {
      press("r");

      expect(state.activeTool()).not.toBe("pan");
    });

    it("a letter typed into a text box does not switch tool", () => {
      // The defect this is here for. A note body is a textarea, so a guard
      // checking only for INPUT let every letter also change tool — typing
      // "area" would leave the reader holding four tools in turn.
      const textarea = globalThis.document.createElement("textarea");
      state.activeTool.set("pan");

      pressInto(textarea, "r");

      expect(state.activeTool()).toBe("pan");
    });

    it("a letter typed into an input does not switch tool", () => {
      const input = globalThis.document.createElement("input");
      state.activeTool.set("pan");

      pressInto(input, "r");

      expect(state.activeTool()).toBe("pan");
    });

    it("a letter typed into a contenteditable does not switch tool", () => {
      // A callout body. Neither INPUT nor TEXTAREA, so a tag-name check alone
      // misses it.
      const editable = globalThis.document.createElement("div");
      editable.contentEditable = "true";
      Object.defineProperty(editable, "isContentEditable", { value: true });
      state.activeTool.set("pan");

      pressInto(editable, "r");

      expect(state.activeTool()).toBe("pan");
    });

    it("save still works from inside a text box", () => {
      // The modifier shortcuts are checked before the typing guard, and they
      // have to be: a reader editing a long note is exactly who needs Ctrl+S.
      const textarea = globalThis.document.createElement("textarea");
      let asked = 0;
      toolbar.saveRequested.subscribe(() => (asked += 1));

      const event = new KeyboardEvent("keydown", { key: "s", ctrlKey: true, cancelable: true });
      Object.defineProperty(event, "target", { value: textarea });
      toolbar.onKey(event);

      expect(asked).toBe(1);
    });

    it("a key no tool claims is ignored", () => {
      state.activeTool.set("pan");

      press("§");

      expect(state.activeTool()).toBe("pan");
    });

    it("a PDF-only tool's shortcut does nothing on a drawing", async () => {
      // Redaction and form fields rewrite PDF structure, so they have nothing
      // to act on in a DWG. Selecting one anyway would leave the reader holding
      // a tool that silently refuses to draw, with no explanation.
      state.viewerData.set({ type: "svg", name: "Plan" } as never);
      state.activeTool.set("pan");
      fixture.detectChanges();

      const pdfOnly = (
        await import("../../../../viewer-core/tool-catalog")
      ).TOOL_SECTIONS.flatMap((section) => section.tools).find((tool) => tool.pdfOnly);

      press(pdfOnly!.key);

      expect(state.activeTool()).toBe("pan");
    });

    it("the shortcut takes over the key, so the browser does not also act on it", () => {
      // Ctrl+S would otherwise open the browser's save dialog on top of ours,
      // and Ctrl+P its print dialog without the markup layer.
      const event = new KeyboardEvent("keydown", { key: "s", ctrlKey: true, cancelable: true });
      Object.defineProperty(event, "target", { value: globalThis.document.body });

      toolbar.onKey(event);

      expect(event.defaultPrevented).toBe(true);
    });
  });

  describe("discarding every annotation", () => {
    it("asks first, because undo cannot reach past its own depth", () => {
      drawSomething();

      byLabel("Delete all markup")!.click();

      expect(questionsAsked).toHaveLength(1);
      expect(state.shapes()).toEqual([]);
    });

    it("says how many will go", () => {
      // "Delete all markup?" on a document with forty comments on it is not
      // enough information to answer.
      state.shapes.set([{ id: 1 }, { id: 2 }, { id: 3 }] as never);
      fixture.detectChanges();

      byLabel("Delete all markup")!.click();

      expect(questionsAsked[0]).toContain("3");
    });

    it("keeps the markup when the reader says no", () => {
      confirmed = false;
      drawSomething();

      byLabel("Delete all markup")!.click();

      expect(state.shapes()).toHaveLength(1);
    });

    it("does not ask when there is nothing to delete", () => {
      // A confirmation for a no-op teaches the reader to dismiss confirmations.
      byLabel("Delete all markup")!.click();

      expect(questionsAsked).toEqual([]);
    });
  });

  describe("flattening", () => {
    it("asks before it starts, because it cannot be undone", () => {
      // The bar hands the service the asking function rather than asking
      // itself, so the service can refuse without a dialog when there is
      // nothing to flatten — but the question has to reach the reader, and this
      // is the end of that chain that can be seen.
      const flatten = vi.spyOn(operations, "flattenToPage");

      toolbar.flattenToPage();

      expect(flatten).toHaveBeenCalled();
      expect(typeof flatten.mock.calls[0]![0]).toBe("function");
    });

    it("the function it hands over is the one that asks the reader", () => {
      const flatten = vi
        .spyOn(operations, "flattenToPage")
        .mockImplementation((ask) => void ask("Flatten the markup into the page?"));

      toolbar.flattenToPage();

      expect(questionsAsked).toHaveLength(1);
    });
  });

  describe("applying redaction", () => {
    it("is offered only once regions have been drawn", () => {
      // §1.1: a control with nothing to act on does not belong on screen, and
      // this one destroys content.
      expect(fixture.nativeElement.textContent).not.toContain("Apply redaction");

      state.redactionRegions.set([{ pageNumber: 1, x: 0, y: 0, width: 10, height: 10 }] as never);
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain("Apply redaction");
    });

    it("says how many regions it will destroy", () => {
      state.redactionRegions.set([{ pageNumber: 1 }, { pageNumber: 2 }] as never);
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain("2");
    });

    it("warns that it is permanent in the tooltip", () => {
      state.redactionRegions.set([{ pageNumber: 1 }] as never);
      fixture.detectChanges();

      const button = Array.from(
        fixture.nativeElement.querySelectorAll("button") as NodeListOf<HTMLButtonElement>,
      ).find((each) => each.textContent?.includes("Apply redaction"));

      expect(button!.title.toLowerCase()).toContain("permanently");
    });
  });

  describe("a commit finishing", () => {
    it("is announced, not just shown", () => {
      // The one thing on this bar that happens without the reader asking for it
      // just then. It used to appear silently beside controls they were already
      // using, which for a screen-reader user is no announcement at all.
      const live = fixture.nativeElement.querySelector('[role="status"]');

      expect(live).not.toBeNull();
      expect(live.getAttribute("aria-live")).toBe("polite");
    });

    it("the announcement region exists before there is anything to announce", () => {
      // A live region added at the same moment as its content is not announced:
      // the screen reader has to have been watching it already.
      expect(state.processingMessage()).toBe("");
      expect(fixture.nativeElement.querySelector('[role="status"]')).not.toBeNull();
    });

    it("offers a way to the new version rather than only saying it exists", () => {
      state.processingMessage.set("Redaction applied — version 4 created");
      fixture.detectChanges();

      const notice = Array.from(
        fixture.nativeElement.querySelectorAll("button") as NodeListOf<HTMLButtonElement>,
      ).find((each) => each.textContent?.includes("version 4"));

      notice!.click();
      fixture.detectChanges();

      expect(state.sidebarTab()).toBe("versions");
    });

    it("clears the notice once it has been followed", () => {
      // Otherwise it stays on the bar for the rest of the session, and the next
      // commit's message is indistinguishable from the last one's.
      state.processingMessage.set("Redaction applied");
      fixture.detectChanges();

      Array.from(
        fixture.nativeElement.querySelectorAll("button") as NodeListOf<HTMLButtonElement>,
      )
        .find((each) => each.textContent?.includes("Redaction applied"))!
        .click();
      fixture.detectChanges();

      expect(state.processingMessage()).toBe("");
    });
  });

  describe("importing annotations", () => {
    it("leaves the file input in the tab order", () => {
      // It was a <label> wrapping <input type="file" class="hidden">.
      // `hidden` is display:none, which takes an input out of the tab order,
      // and a label is not focusable — so the control had no keyboard route at
      // all (SC 2.1.1, and §1A.4 names file upload specifically). `sr-only`
      // hides it visually without removing it.
      const input = fixture.nativeElement.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement | null;

      expect(input).not.toBeNull();
      expect(input!.classList.contains("hidden")).toBe(false);
    });

    it("gives the file input a label that names it", () => {
      const input = fixture.nativeElement.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      const label = fixture.nativeElement.querySelector(
        `label[for="${input.id}"]`,
      ) as HTMLLabelElement | null;

      expect(label).not.toBeNull();
      expect(label!.textContent!.trim().length).toBeGreaterThan(0);
    });
  });

  describe("the zoom reading", () => {
    it("shows the zoom as a percentage", () => {
      state.zoom.set(1.5);
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain("150");
    });

    it("formats it for the reader's locale rather than concatenating a symbol", () => {
      // The template read `{{ (zoom * 100).toFixed(0) }}%` — a bare symbol the
      // markup sweep cannot see and a translator never receives, and where the
      // symbol goes is not the same in every locale. Digit grouping is the part
      // of that difference this locale can show: the old expression gave
      // "1234%", a formatter gives "1,234%".
      state.zoom.set(12.34);
      fixture.detectChanges();

      // Read from the page rather than from a method: the reading moved to the
      // view controls, and a test calling the old method would have kept passing
      // while nothing reached the screen.
      expect(fixture.nativeElement.textContent).not.toContain("1234");
      expect(fixture.nativeElement.textContent).toMatch(/%|percent/i);
    });
  });

  describe("the command row itself", () => {
    it("claims no toolbar role it does not implement", () => {
      // role="toolbar" promises arrow-key navigation over a single tab stop. A
      // row of plain buttons is already conformant without it — each is
      // reachable and named — and declaring the role without the behaviour is
      // the defect the sign-in tabs had (§1A.2: bad ARIA is worse than none).
      expect(fixture.nativeElement.querySelector('[role="toolbar"]')).toBeNull();
    });
  });
});
