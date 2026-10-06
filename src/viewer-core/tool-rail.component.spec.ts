/**
 * The vertical tool rail down the left edge of the viewer.
 *
 * <p>A rail rather than a ribbon for the reason every drawing-review product
 * settles on one: a document is taller than it is wide relative to the screen,
 * so horizontal chrome is charged against the thing being read while vertical
 * chrome is nearly free. The previous tabbed ribbon spent two stacked rows and
 * still hid two thirds of the tools behind tabs.
 *
 * <p>Three things here are rules rather than layout.
 *
 * <p>**Every tool is named and says whether it is held.** A rail of eighteen
 * icons with no accessible names is eighteen controls that announce as "button",
 * and `aria-pressed` is what makes each one a toggle rather than a button that
 * does something different each time — which §1A.2 requires because the held
 * tool is otherwise carried only by a background colour.
 *
 * <p>**A tool that cannot work here is disabled with a reason, not hidden.**
 * Redaction and form fields rewrite PDF structure, so they have nothing to act
 * on in a DWG or an image. Hiding them would make the rail change length with
 * the document and leave the reader wondering where a tool went; §1.1's
 * exception applies — the disabled state teaches, as long as the tooltip says
 * why.
 *
 * <p>**The completion hint comes from the engine that implements the drawing.**
 * Area, Length and Radius are built by clicking a series of points and need to
 * say how to finish; a list of hints kept in this component is what previously
 * left all three silently unexplained.
 */
import { ComponentFixture, TestBed } from "@angular/core/testing";

import { MarkupEngineService } from "./markup-engine.service";
import { TOOL_SECTIONS } from "./tool-catalog";
import { ToolRailComponent } from "./tool-rail.component";
import { ViewerStateService } from "./viewer-state.service";

const everyTool = TOOL_SECTIONS.flatMap((section) => section.tools);

describe("ToolRailComponent", () => {
  let fixture: ComponentFixture<ToolRailComponent>;
  let rail: ToolRailComponent;
  let state: ViewerStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ViewerStateService, MarkupEngineService],
    });
    state = TestBed.inject(ViewerStateService);
    state.viewerData.set({ type: "pdf", name: "plan.pdf" } as never);
    fixture = TestBed.createComponent(ToolRailComponent);
    rail = fixture.componentInstance;
    fixture.detectChanges();
  });

  function buttons(): HTMLButtonElement[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll("button") as NodeListOf<HTMLButtonElement>,
    );
  }

  function buttonFor(label: string): HTMLButtonElement | undefined {
    return buttons().find((button) => button.getAttribute("aria-label") === label);
  }

  /** Re-renders the rail for a document that is not a PDF. */
  function asDrawing(): void {
    state.viewerData.set({ type: "svg", name: "plan.dxf" } as never);
    fixture.detectChanges();
  }

  describe("what it offers", () => {
    it("shows every tool in the catalogue at once", () => {
      // The point of the rail over the ribbon. A tool behind a tab is a tool
      // most readers never find.
      expect(buttons()).toHaveLength(everyTool.length);
    });

    it("groups them, and names each group", () => {
      // §1A.2: the dividers between groups are decorative, so the grouping has
      // to be in the markup as well — otherwise a screen-reader user hears
      // eighteen buttons in a row with no structure.
      const groups = fixture.nativeElement.querySelectorAll('[role="group"]');

      expect(groups).toHaveLength(TOOL_SECTIONS.length);
      for (const group of Array.from(groups as NodeListOf<HTMLElement>)) {
        expect(group.getAttribute("aria-label")?.trim()).not.toBe("");
      }
    });

    it("names the rail itself, so it is one landmark rather than loose buttons", () => {
      const nav = fixture.nativeElement.querySelector("nav");

      expect(nav).not.toBeNull();
      expect(nav.getAttribute("aria-label")?.trim()).not.toBe("");
    });

    it("every tool is announced", () => {
      for (const tool of everyTool) {
        expect(buttonFor(tool.label)).not.toBeUndefined();
      }
    });

    it("no two tools announce the same", () => {
      // Two tools with one name is two controls a screen-reader user cannot
      // choose between.
      const labels = everyTool.map((tool) => tool.label);

      expect(new Set(labels).size).toBe(labels.length);
    });
  });

  describe("which tool is held", () => {
    it("says so on the held tool, and on no other", () => {
      // §1A.2: the held tool is otherwise carried by a background colour alone.
      state.activeTool.set("rect");
      fixture.detectChanges();

      const pressed = buttons().filter(
        (button) => button.getAttribute("aria-pressed") === "true",
      );

      expect(pressed).toHaveLength(1);
      expect(pressed[0]!.getAttribute("aria-label")).toBe(
        everyTool.find((tool) => tool.id === "rect")!.label,
      );
    });

    it("every tool carries the attribute, pressed or not", () => {
      // Present-and-false is what makes it a toggle. Absent means the browser
      // announces a plain button, so the reader cannot tell a held tool from an
      // unheld one until they press it.
      for (const button of buttons()) {
        expect(button.getAttribute("aria-pressed")).toMatch(/^(true|false)$/);
      }
    });

    it("picking one up puts the previous one down", () => {
      state.activeTool.set("rect");
      fixture.detectChanges();

      buttonFor(everyTool.find((tool) => tool.id === "ellipse")!.label)!.click();
      fixture.detectChanges();

      expect(state.activeTool()).toBe("ellipse");
      expect(
        buttons().filter((button) => button.getAttribute("aria-pressed") === "true"),
      ).toHaveLength(1);
    });

    it("can be picked up from the keyboard map in the command bar", () => {
      // setTool is the shared entry point, so the rail and the shortcut cannot
      // disagree about what being held means.
      rail.setTool("circle");

      expect(state.activeTool()).toBe("circle");
    });
  });

  describe("a tool that cannot work on this document", () => {
    const pdfOnly = everyTool.find((tool) => tool.pdfOnly)!;

    it("is disabled on a drawing rather than hidden", () => {
      // Hiding it would make the rail change length with the document, and the
      // reader who used it yesterday would think it had been removed.
      asDrawing();

      expect(buttonFor(pdfOnly.label)!.disabled).toBe(true);
    });

    it("says why, which is the only thing that makes disabling acceptable", () => {
      // §1.1 allows a disabled control exactly when the disabled state teaches.
      asDrawing();

      expect(buttonFor(pdfOnly.label)!.title.toLowerCase()).toContain("pdf");
    });

    it("cannot be picked up even if the click arrives anyway", () => {
      // The attribute is the UI half. A script or keyboard path reaching
      // selectTool must not leave the reader holding a tool that silently
      // refuses to draw.
      asDrawing();
      state.activeTool.set("pan");

      rail.selectTool(pdfOnly);

      expect(state.activeTool()).toBe("pan");
    });

    it("is operable again on a PDF", () => {
      // The other half: without this, disabling every PDF-only tool everywhere
      // would pass the assertions above and nobody could redact anything.
      expect(buttonFor(pdfOnly.label)!.disabled).toBe(false);
    });

    it("the tools that work anywhere stay operable on a drawing", () => {
      // Markup on a converted drawing is most of what this product is for.
      asDrawing();

      const anywhere = everyTool.filter((tool) => !tool.pdfOnly);
      for (const tool of anywhere) {
        expect(buttonFor(tool.label)!.disabled).toBe(false);
      }
    });

    it("is disabled when the document's kind is not known yet", () => {
      // Before the viewer has loaded there is no type. Treating absent as "PDF"
      // would offer a tool that fails the moment it is used.
      state.viewerData.set(null);
      fixture.detectChanges();

      expect(buttonFor(pdfOnly.label)!.disabled).toBe(true);
    });
  });

  describe("what each tooltip says", () => {
    it("names the tool and its shortcut", () => {
      // The shortcut is how anyone drawing for an hour actually works, and a
      // rail of icons is where they look it up.
      const rect = everyTool.find((tool) => tool.id === "rect")!;

      expect(rail.hintFor(rect)).toContain(rect.label);
      expect(rail.hintFor(rect)).toContain(rect.key);
    });

    it("tells a click-built tool how to finish the shape", () => {
      // Area, Length and Radius are built by clicking a series of points and
      // were silently unexplained — a reader could start one and had no way to
      // learn how to end it.
      const engine = TestBed.inject(MarkupEngineService);
      const multiClick = everyTool.find((tool) => engine.completionHint(tool.id));

      expect(multiClick).not.toBeUndefined();
      expect(rail.hintFor(multiClick!)).toContain(engine.completionHint(multiClick!.id));
    });

    it("says nothing about finishing a tool that is finished by releasing", () => {
      // A dragged shape has no completion step, and inventing one would be
      // instructions for something that does not happen.
      const engine = TestBed.inject(MarkupEngineService);
      const dragged = everyTool.find((tool) => !engine.completionHint(tool.id) && !tool.pdfOnly)!;

      expect(rail.hintFor(dragged)).toBe(rail.hintFor(dragged));
      expect(rail.hintFor(dragged)).toContain(dragged.key);
    });

    it("replaces the hint entirely when the tool is unavailable", () => {
      // A tooltip reading "Redact (K) — click to finish" on a drawing where it
      // cannot be used is worse than no tooltip.
      asDrawing();
      const pdfOnly = everyTool.find((tool) => tool.pdfOnly)!;

      expect(rail.hintFor(pdfOnly)).not.toContain(`(${pdfOnly.key})`);
    });

    it("every tool has a tooltip", () => {
      for (const tool of everyTool) {
        expect(buttonFor(tool.label)!.title.trim()).not.toBe("");
      }
    });
  });
});
