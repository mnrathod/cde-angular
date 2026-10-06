/**
 * The page a host frames.
 *
 * <p>This is the surface a customer's own product shows inside an iframe, which
 * makes it the most exposed component in the codebase in two different senses.
 *
 * <p>**It has no session and must not acquire one.** There is no auth guard on
 * the route deliberately: a login redirect inside someone else's iframe is both
 * a broken integration and an invitation to type a password into a frame whose
 * origin the reader cannot see.
 *
 * <p>**Its capabilities are presentation, never authorisation.** `canDo()`
 * decides which controls appear and nothing else — the host still refuses what
 * it will refuse, and §6.1 of the embed protocol says the two are allowed to
 * disagree. So a refusal is a notice rather than an alert, and the assertions
 * here are about which controls are offered, not about what they are permitted
 * to achieve.
 *
 * <p>The four phases are the other half. A framed viewer that shows nothing
 * while it waits is indistinguishable from one that has crashed, and the host's
 * integrator is the person who has to tell those apart.
 */
import { ComponentFixture, TestBed } from "@angular/core/testing";

import { ViewerStateService } from "../../../viewer-core/viewer-state.service";
import { EmbedSession } from "./embed-session.service";
import { EmbedViewerComponent } from "./embed-viewer.component";

describe("EmbedViewerComponent", () => {
  let fixture: ComponentFixture<EmbedViewerComponent>;
  let viewer: EmbedViewerComponent;
  let session: EmbedSession;
  let state: ViewerStateService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    // Nothing provided: the component's own `providers` are what the router
    // relies on, and listing the services here would exercise the code while
    // stepping over the wiring (see embed-wiring.spec.ts).
    TestBed.configureTestingModule({ imports: [EmbedViewerComponent] });
    fixture = TestBed.createComponent(EmbedViewerComponent);
    viewer = fixture.componentInstance;
    session = fixture.debugElement.injector.get(EmbedSession);
    state = fixture.debugElement.injector.get(ViewerStateService);
    // The conversation is held open rather than started. A test page is not in a
    // frame, so a real `start()` finds `window.parent === window`, fails, and
    // puts the viewer straight into its not-embedded state — which is correct
    // behaviour and asserted on its own below, but it would make every phase
    // here unreachable.
    vi.spyOn(session, "start").mockReturnValue(true);
  });

  afterEach(() => vi.restoreAllMocks());

  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? "";
  }

  function buttons(): HTMLButtonElement[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll("button") as NodeListOf<HTMLButtonElement>,
    );
  }

  /** Puts the viewer in its ready phase with the given host capabilities. */
  function ready(capabilities: string[] = [], pages = 3): void {
    session.identity.set({ displayName: "Sam Okonkwo", capabilities } as never);
    session.documentName.set("Foundation plan");
    session.phase.set("ready");
    state.totalPages.set(pages);
    fixture.detectChanges();
  }

  describe("while it is waiting for the host", () => {
    it("says so, rather than showing an empty frame", () => {
      // An empty iframe is indistinguishable from one that crashed, and the
      // host's integrator is the person who has to tell those apart.
      fixture.detectChanges();

      expect(text()).toContain("Waiting for the host application");
    });

    it("announces the wait rather than only drawing it", () => {
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[role="status"]')).not.toBeNull();
    });

    it("offers no controls, since there is no document to act on", () => {
      fixture.detectChanges();

      expect(buttons()).toHaveLength(0);
    });
  });

  describe("while the document is loading", () => {
    it("says it is opening the document, which is a different wait", () => {
      // The reader can act on one of these and not the other: waiting for the
      // host means the integration is not talking, waiting for the document
      // means it is.
      session.phase.set("loading");
      fixture.detectChanges();

      expect(text()).toContain("Opening the document");
      expect(text()).not.toContain("Waiting for the host");
    });
  });

  describe("when it could not open the document", () => {
    it("says what went wrong, in the host's own words", () => {
      session.phase.set("failed");
      session.problem.set({
        title: "Document not available",
        detail: "The host did not grant access to this document.",
        traceId: "abc123",
      } as never);
      fixture.detectChanges();

      expect(text()).toContain("Document not available");
      expect(text()).toContain("did not grant access");
    });

    it("interrupts, because a failure is not something to find later", () => {
      // role="alert" rather than status: this is the end of the road for the
      // frame, and a polite announcement would be read after whatever else was
      // queued.
      session.phase.set("failed");
      session.problem.set({ title: "Failed", detail: "No" } as never);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    });

    it("gives the reader something to quote to support", () => {
      // §1.4. Inside a frame the reader has no other handle on the request — no
      // URL they can see, no console they will open.
      session.phase.set("failed");
      session.problem.set({ title: "Failed", detail: "No", traceId: "abc123" } as never);
      fixture.detectChanges();

      expect(text()).toContain("abc123");
      expect(text().toLowerCase()).toContain("reference");
    });

    it("says nothing about a reference when there is none", () => {
      // A bare "Reference:" with nothing after it reads as a value that failed
      // to load.
      session.phase.set("failed");
      session.problem.set({ title: "Failed", detail: "No" } as never);
      fixture.detectChanges();

      expect(text()).not.toContain("Reference:");
    });
  });

  describe("once it is ready", () => {
    it("names the document", () => {
      ready();

      expect(text()).toContain("Foundation plan");
    });

    it("says where in the document the reader is", () => {
      ready([], 12);
      state.currentPage.set(3);
      fixture.detectChanges();

      expect(text()).toContain("3");
      expect(text()).toContain("12");
    });

    it("renders one page host per page", () => {
      ready([], 4);

      expect(fixture.nativeElement.querySelectorAll("app-embed-page")).toHaveLength(4);
    });

    it("renders nothing before the document reports its page count", () => {
      ready([], 0);

      expect(fixture.nativeElement.querySelectorAll("app-embed-page")).toHaveLength(0);
    });
  });

  describe("the controls the host's capabilities allow", () => {
    it("offers no markup tools without markup:create", () => {
      // §1.1: a control the reader cannot use is not rendered. Here it is also a
      // courtesy to the host — a Box button that produces nothing makes the
      // integration look broken rather than restricted.
      ready([]);

      expect(buttons().some((button) => /Box|Cloud|Arrow/.test(button.textContent ?? ""))).toBe(
        false,
      );
    });

    it("offers them once the host grants markup:create", () => {
      ready(["markup:create"]);

      for (const tool of viewer.tools) {
        expect(buttons().some((button) => button.textContent?.trim() === tool.label)).toBe(true);
      }
    });

    it("offers no signing control without document:sign", () => {
      ready(["markup:create"]);

      expect(buttons().some((button) => button.textContent?.includes("Sign"))).toBe(false);
    });

    it("offers it once the host grants document:sign", () => {
      ready(["document:sign"]);

      expect(buttons().some((button) => button.textContent?.includes("Sign"))).toBe(true);
    });

    it("is not fooled by some other capability", () => {
      // A capability list is not a boolean. Reading "any capability at all" as
      // permission is the shape this has to refuse.
      ready(["document:download"]);

      expect(buttons().some((button) => button.textContent?.includes("Sign"))).toBe(false);
    });

    it("treats a host that sent no capabilities as granting none", () => {
      session.identity.set({} as never);
      session.phase.set("ready");
      state.totalPages.set(1);
      fixture.detectChanges();

      expect(buttons().some((button) => button.textContent?.includes("Sign"))).toBe(false);
    });
  });

  describe("the markup tools", () => {
    beforeEach(() => ready(["markup:create"]));

    it("picks one up", () => {
      buttons().find((button) => button.textContent?.trim() === "Box")!.click();
      fixture.detectChanges();

      expect(state.activeTool()).toBe("rect");
    });

    it("says which one is held, and not only by colouring it", () => {
      // §1A.2. The held tool is otherwise carried by a background colour alone,
      // and inside a host's frame the reader may well be looking at it in a
      // high-contrast mode we did not choose.
      state.activeTool.set("rect");
      fixture.detectChanges();

      const pressed = buttons().filter(
        (button) => button.getAttribute("aria-pressed") === "true",
      );

      expect(pressed).toHaveLength(1);
      expect(pressed[0]!.textContent?.trim()).toBe("Box");
    });

    it("every tool carries the attribute, pressed or not", () => {
      for (const button of buttons().filter((each) =>
        viewer.tools.some((tool) => tool.label === each.textContent?.trim()),
      )) {
        expect(button.getAttribute("aria-pressed")).toMatch(/^(true|false)$/);
      }
    });

    it("each tool has its own label, so no two announce the same", () => {
      const labels = viewer.tools.map((tool) => tool.label);

      expect(new Set(labels).size).toBe(labels.length);
    });

    it("abbreviates, because the embedded toolbar is narrower than the full rail", () => {
      // And the message ids differ from the full viewer's for that reason:
      // sharing an id between two different source strings makes the extractor
      // pick one arbitrarily, so one of the two ships the wrong words in every
      // translated language.
      expect(viewer.tools.find((tool) => tool.id === "rect")!.label).toBe("Box");
    });
  });

  describe("the row of tools", () => {
    it("claims no toolbar role it does not implement", () => {
      // role="toolbar" promises arrow-key navigation over a single tab stop, and
      // this row does not implement it. A screen-reader user pressing arrows
      // that do nothing is worse off than one told it is a group of buttons
      // (§1A.2: bad ARIA is worse than none). The full viewer's command bar
      // reaches the same conclusion.
      ready(["markup:create"]);

      expect(fixture.nativeElement.querySelector('[role="toolbar"]')).toBeNull();
    });

    it("is still named, so it reads as one control rather than loose buttons", () => {
      ready(["markup:create"]);

      const group = fixture.nativeElement.querySelector('[role="group"]') as HTMLElement;

      expect(group).not.toBeNull();
      expect(group.getAttribute("aria-label")?.trim()).not.toBe("");
    });
  });

  describe("asking the host to sign", () => {
    beforeEach(() => ready(["document:sign"]));

    it("says it is asking, so the wait is not silent", async () => {
      // The host may take as long as it likes — it is another application, and
      // possibly another person.
      let settle: (value: unknown) => void = () => undefined;
      vi.spyOn(session, "requestOperation").mockReturnValue(
        new Promise((resolve) => {
          settle = resolve;
        }) as never,
      );

      const asking = viewer.requestSignature();
      expect(viewer.notice()).toContain("Asking the host");

      settle({ status: "applied" });
      await asking;
    });

    it("says so when the host signed", async () => {
      vi.spyOn(session, "requestOperation").mockResolvedValue({ status: "applied" } as never);

      await viewer.requestSignature();

      expect(viewer.notice()).toBe(viewer.signedLabel);
    });

    it("reports a refusal as a notice, not as a failure", async () => {
      // §6.1: the host granting a capability and then declining a particular
      // request is expected rather than an error. Showing it as an alert would
      // teach the integrator to chase a fault that is not there.
      vi.spyOn(session, "requestOperation").mockResolvedValue({ status: "refused" } as never);

      await viewer.requestSignature();
      fixture.detectChanges();

      expect(viewer.notice()).toBe(viewer.refusedLabel);
      expect(fixture.nativeElement.querySelector(".notice")?.getAttribute("role")).toBe("status");
    });

    it("prefers the host's own reason when it gave one", async () => {
      // The host knows why it refused and we do not. Replacing its sentence with
      // ours loses the only information the reader could act on.
      vi.spyOn(session, "requestOperation").mockResolvedValue({
        status: "refused",
        problem: { title: "Not your turn", detail: "This drawing is awaiting a check first." },
      } as never);

      await viewer.requestSignature();

      expect(viewer.notice()).toBe("This drawing is awaiting a check first.");
    });

    it("says something for an outcome it does not recognise", async () => {
      // A host on a newer protocol version. Leaving the notice on "Asking the
      // host to sign…" for ever is the one outcome that cannot be read at all.
      vi.spyOn(session, "requestOperation").mockResolvedValue({ status: "deferred" } as never);

      await viewer.requestSignature();

      expect(viewer.notice()).toBe(viewer.couldNotCompleteLabel);
    });

    it("shows the notice on the page, not only in a field", async () => {
      vi.spyOn(session, "requestOperation").mockResolvedValue({ status: "applied" } as never);

      await viewer.requestSignature();
      fixture.detectChanges();

      expect(text()).toContain(viewer.signedLabel);
    });

    it("shows no notice before anything has been asked", () => {
      // An empty notice bar is a strip of colour with nothing in it.
      expect(fixture.nativeElement.querySelector(".notice")).toBeNull();
    });
  });

  describe("every sentence it says", () => {
    it("is a sentence rather than a code", () => {
      for (const sentence of [
        viewer.openingLabel,
        viewer.waitingLabel,
        viewer.askingToSignLabel,
        viewer.signedLabel,
        viewer.refusedLabel,
        viewer.couldNotCompleteLabel,
      ]) {
        expect(sentence.trim().length).toBeGreaterThan(12);
      }
    });

    it("does not repeat another, which would make two states look like one", () => {
      const sentences = [
        viewer.openingLabel,
        viewer.waitingLabel,
        viewer.askingToSignLabel,
        viewer.signedLabel,
        viewer.refusedLabel,
        viewer.couldNotCompleteLabel,
      ];

      expect(new Set(sentences).size).toBe(sentences.length);
    });
  });

  describe("opened outside a frame", () => {
    it("says what it is for rather than waiting for a host that cannot answer", () => {
      // Somebody has opened /embed directly — a developer checking a URL, or a
      // host whose integration lost the frame. A permanently blank page is
      // indistinguishable from a broken deployment, so the session refuses and
      // says which it is.
      vi.restoreAllMocks();
      const fresh = TestBed.createComponent(EmbedViewerComponent);

      fresh.detectChanges();

      const shown = (fresh.nativeElement as HTMLElement).textContent ?? "";
      expect(shown).toContain("meant to be embedded");
      expect(shown.toLowerCase()).toContain("parentorigin");
    });

    it("reports it as a failure, not as a wait", () => {
      vi.restoreAllMocks();
      const fresh = TestBed.createComponent(EmbedViewerComponent);

      fresh.detectChanges();

      expect(fresh.debugElement.injector.get(EmbedSession).phase()).toBe("failed");
    });
  });

  describe("starting and stopping the conversation", () => {
    it("reads the host's origin from the URL, which is the only channel there is", () => {
      // §2: parentOrigin is addressing, not authorisation. It is read here
      // because nothing else is available before the first message, and
      // frame-ancestors is what actually decides who may frame us — a header,
      // not a query parameter.
      viewer.ngOnInit();

      expect(session.start).toHaveBeenCalledWith(
        expect.objectContaining({ self: window, parent: window.parent }),
      );
    });

    it("starts with an empty origin rather than refusing when the URL carries none", () => {
      // The session validates it. Throwing here would leave the frame blank with
      // no message, which is the one failure the host cannot diagnose.
      viewer.ngOnInit();

      expect(vi.mocked(session.start).mock.calls[0]![0]).toHaveProperty("parentOrigin");
    });

    it("stops the conversation when the frame goes away", () => {
      // A listener left on window after the component is gone keeps answering
      // the host on behalf of a viewer that no longer exists.
      const stop = vi.spyOn(session, "stop");

      fixture.destroy();

      expect(stop).toHaveBeenCalled();
    });
  });
});
