/**
 * The 3D viewer's command bar.
 *
 * <p>Written for one assertion it did not have: the model viewer's route had
 * no heading of any level, so a reader navigating by headings arrived at the
 * 3D viewer and found nothing naming the model that was open (SC 2.4.6). The
 * element that already carried the title now carries the semantics too.
 *
 * <p>The facts list is asserted alongside it because §1A.4 is the reason it
 * exists: a WebGL canvas cannot be made conformant on its own, so the model's
 * metadata has to be reachable as text. A regression there would be invisible
 * on screen — the canvas would still draw.
 */
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it } from "vitest";

import { Viewer3dToolbarComponent } from "./viewer3d-toolbar.component";

describe("Viewer3dToolbarComponent", () => {
  let fixture: ComponentFixture<Viewer3dToolbarComponent>;
  let toolbar: Viewer3dToolbarComponent;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [Viewer3dToolbarComponent] });
    fixture = TestBed.createComponent(Viewer3dToolbarComponent);
    toolbar = fixture.componentInstance;
  });

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  describe("the page's heading", () => {
    it("names the model as a heading, not just as text", () => {
      toolbar.title = "Plant room — mechanical";
      fixture.detectChanges();

      const heading = host().querySelector("h1");
      expect(heading?.textContent).toContain("Plant room — mechanical");
    });

    it("is the only heading at that level, so the page has one subject", () => {
      // Two h1s in one route is the other way to fail SC 2.4.6: a reader
      // navigating by headings cannot tell which names the page.
      toolbar.title = "Plant room";
      fixture.detectChanges();

      expect(host().querySelectorAll("h1")).toHaveLength(1);
    });
  });

  describe("what the model is", () => {
    it("shows each fact as a term and its value", () => {
      // §1A.4: the canvas is not an accessible route to the model, so these
      // are the route. They were computed and thrown away before.
      toolbar.facts = [
        { label: "Elements", value: "4,812" },
        { label: "Schema", value: "IFC4" },
      ];
      fixture.detectChanges();

      expect(host().textContent).toContain("Elements");
      expect(host().textContent).toContain("4,812");
      expect(host().textContent).toContain("IFC4");
    });

    it("renders no empty list when there are no facts to show", () => {
      // An empty description list announces as a list with nothing in it,
      // which reads as a model whose metadata failed to load.
      toolbar.facts = [];
      fixture.detectChanges();

      expect(host().querySelector("dl")).toBeNull();
    });
  });
});
