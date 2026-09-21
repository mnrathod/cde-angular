/**
 * What the list of a document's signatures announces.
 *
 * <p>Each row carried a status icon with no accessible text and no
 * `aria-hidden`, so a screen reader read "white heavy check mark" beside a
 * badge already stating the status; the badge itself showed the server's
 * enum; and every Verify button was announced identically, so a reader could
 * not tell which signature they were about to re-check.
 */
import { ComponentFixture, TestBed } from "@angular/core/testing";

import { SignatureRecord } from "../../../core/services/signature.service";
import { SignatureListComponent } from "./signature-list.component";

function signature(overrides: Partial<SignatureRecord> = {}): SignatureRecord {
  return {
    id: 1,
    signatureId: "ab12cd34-0000-0000-0000-000000000000",
    signerName: "A. Surveyor",
    signerEmail: "surveyor@example.invalid",
    role: "Approver",
    reason: "Approved for construction",
    status: "VALID",
    signedAt: "2026-03-04T09:30:00Z",
    version: 3,
    ...overrides,
  };
}

async function listOf(signatures: SignatureRecord[], busy = false) {
  TestBed.configureTestingModule({ imports: [SignatureListComponent] });
  const fixture = TestBed.createComponent(SignatureListComponent);
  fixture.componentRef.setInput("signatures", signatures);
  fixture.componentRef.setInput("busy", busy);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

function host(fixture: ComponentFixture<SignatureListComponent>) {
  return fixture.nativeElement as HTMLElement;
}

describe("the signatures already on a document", () => {
  it("does not show the server's status enum", async () => {
    const fixture = await listOf([signature({ status: "TAMPERED" })]);

    expect(host(fixture).textContent).not.toContain("TAMPERED");
  });

  it("states the status in words, not only as a colour", async () => {
    const fixture = await listOf([signature({ status: "TAMPERED" })]);

    expect(host(fixture).textContent?.toLowerCase()).toContain("altered");
  });

  it("hides the status icon from assistive technology", async () => {
    // The badge beside it already says the status; announcing the glyph as
    // well is noise a reader cannot act on (§1A.2).
    const fixture = await listOf([signature()]);
    const icon = Array.from(host(fixture).querySelectorAll("span"))
      .find(element => (element.textContent ?? "").includes("✅"));

    expect(icon?.getAttribute("aria-hidden")).toBe("true");
  });

  it("names the signature each Verify button checks", async () => {
    const fixture = await listOf([
      signature({ signatureId: "a", signerName: "A. Surveyor" }),
      signature({ signatureId: "b", signerName: "B. Engineer" }),
    ]);
    const labels = Array.from(host(fixture).querySelectorAll("button"))
      .map(button => button.getAttribute("aria-label") ?? "");

    expect(labels[0]).toContain("A. Surveyor");
    expect(labels[1]).toContain("B. Engineer");
  });

  it("asks for a signature to be checked when its button is pressed", async () => {
    const wanted = signature();
    const fixture = await listOf([wanted]);
    let asked: SignatureRecord | null = null;
    fixture.componentInstance.verifyRequested.subscribe(s => (asked = s));

    host(fixture).querySelector("button")?.click();

    expect(asked).toBe(wanted);
  });

  it("teaches an empty document rather than apologising", async () => {
    const fixture = await listOf([]);

    expect(host(fixture).textContent).toContain("No signatures");
  });

  it("says it is still loading rather than claiming there are none", async () => {
    const fixture = await listOf([], true);

    expect(host(fixture).textContent).not.toContain("No signatures");
  });
});
