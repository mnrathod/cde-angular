/**
 * Controls a reader can see, name and be allowed to press.
 *
 * <p>The delete control on a reply was `opacity-0 group-hover:opacity-100`
 * with no focus counterpart, so tabbing onto it moved focus to something
 * invisible; its whole content was `✕`, so that glyph was its accessible
 * name; and the permission check it sat behind has to stay per reply, or a
 * thread holding one of my replies sprouts a delete button on everyone's.
 */
import { ComponentFixture, TestBed } from "@angular/core/testing";

import { Annotation, AnnotationReply, AnnotationThread } from "../../../core/models";
import { AnnotationThreadCardComponent } from "./annotation-thread-card.component";

function annotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 1,
    documentId: 1,
    authorName: "A. Surveyor",
    type: "NOTE" as Annotation["type"],
    shapeData: "{}",
    comment: "Check this dimension",
    status: "OPEN",
    pageNumber: 2,
    createdAt: "2026-03-04T09:30:00Z",
    ...overrides,
  };
}

function reply(id: number, authorName: string): AnnotationReply {
  return {
    id,
    annotationId: 1,
    authorName,
    content: "Agreed",
    createdAt: "2026-03-04T10:00:00Z",
  };
}

async function cardFor(thread: AnnotationThread, inputs: Record<string, unknown> = {}) {
  TestBed.configureTestingModule({ imports: [AnnotationThreadCardComponent] });
  const fixture = TestBed.createComponent(AnnotationThreadCardComponent);
  fixture.componentRef.setInput("thread", thread);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

function host(fixture: ComponentFixture<AnnotationThreadCardComponent>) {
  return fixture.nativeElement as HTMLElement;
}

/** The delete buttons on the replies, by their accessible name. */
function deleteLabels(fixture: ComponentFixture<AnnotationThreadCardComponent>) {
  return Array.from(host(fixture).querySelectorAll("button"))
    .map((button) => button.getAttribute("aria-label"))
    .filter((label): label is string => !!label && /delete/i.test(label));
}

describe("one annotation and its replies", () => {
  it("offers delete only on the reader's own reply", () => {
    const thread: AnnotationThread = {
      annotation: annotation(),
      replies: [reply(1, "B. Engineer"), reply(2, "A. Surveyor")],
    };

    return cardFor(thread, { currentUser: "A. Surveyor" }).then((fixture) => {
      const labels = deleteLabels(fixture);
      expect(labels).toHaveLength(1);
      expect(labels[0]).toContain("A. Surveyor");
    });
  });

  it("offers delete on every reply to someone who may delete any", async () => {
    const thread: AnnotationThread = {
      annotation: annotation(),
      replies: [reply(1, "B. Engineer"), reply(2, "A. Surveyor")],
    };

    const fixture = await cardFor(thread, { canDeleteAnyReply: true, currentUser: null });

    expect(deleteLabels(fixture)).toHaveLength(2);
  });

  it("offers delete on nobody else's reply by default", async () => {
    const thread: AnnotationThread = {
      annotation: annotation(),
      replies: [reply(1, "B. Engineer")],
    };

    const fixture = await cardFor(thread, { currentUser: "A. Surveyor" });

    expect(deleteLabels(fixture)).toHaveLength(0);
  });

  it("names whose reply each delete control removes", async () => {
    const thread: AnnotationThread = {
      annotation: annotation(),
      replies: [reply(1, "B. Engineer")],
    };

    const fixture = await cardFor(thread, { canDeleteAnyReply: true });

    expect(deleteLabels(fixture)[0]).toContain("B. Engineer");
  });

  it("does not leave the delete control invisible under focus", async () => {
    // `opacity-0 group-hover:opacity-100` and nothing for focus: tabbing to
    // it moved focus somewhere the reader could not see (SC 2.4.7).
    const thread: AnnotationThread = {
      annotation: annotation(),
      replies: [reply(1, "B. Engineer")],
    };
    // Read from the emitted stylesheet rather than from computed style:
    // jsdom resolves the static cascade only and never applies a :focus
    // rule, so a computed-style assertion here would fail whether the rule
    // existed or not. This asserts the rule ships; that a browser honours
    // it was checked by hand in Chromium.
    await cardFor(thread, { canDeleteAnyReply: true });

    const focusRules = Array.from(document.styleSheets)
      .flatMap((sheet) => {
        try { return Array.from(sheet.cssRules); } catch { return []; }
      })
      .filter((rule): rule is CSSStyleRule => "selectorText" in rule)
      .filter((rule) => rule.selectorText.includes(".remove")
        && rule.selectorText.includes(":focus"));

    expect(focusRules.length).toBeGreaterThan(0);
    expect(focusRules.some((rule) => rule.style.opacity === "1")).toBe(true);
  });

  it("does not put the server's status enum on the screen", async () => {
    const fixture = await cardFor({ annotation: annotation({ status: "RESOLVED" }), replies: [] });

    expect(host(fixture).textContent).not.toContain("RESOLVED");
    expect(host(fixture).textContent).toContain("Resolved");
  });

  it("hides the avatar initial, which only abbreviates the name beside it", async () => {
    const fixture = await cardFor({ annotation: annotation(), replies: [] });
    const avatar = Array.from(host(fixture).querySelectorAll("div"))
      .find((element) => element.textContent?.trim() === "A");

    expect(avatar?.getAttribute("aria-hidden")).toBe("true");
  });

  it("gives each reply box a label of its own", async () => {
    const fixture = await cardFor({ annotation: annotation({ id: 7 }), replies: [] });
    const input = host(fixture).querySelector("input");
    const label = host(fixture).querySelector(`label[for="${input!.id}"]`);

    expect(label).not.toBeNull();
    expect(input!.id).toContain("7");
  });
});
