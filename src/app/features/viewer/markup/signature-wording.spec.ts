/**
 * Saying a signature's state in words rather than in the server's enum.
 *
 * <p>The list rendered `VALID`, `TAMPERED` and `Approver` straight onto the
 * screen, and the verify banner rendered the server's English sentence. Both
 * are untranslated text in a product that ships translations (§1.4), and the
 * role in particular read one way in the signing dropdown and another way in
 * the list of the same document's signatures.
 */
import {
  signatureRoleName, signatureStatusClass, signatureStatusName, verificationMessage,
} from "./signature-wording";

describe("naming a signature's state", () => {
  it("does not put the server's enum on the screen", () => {
    expect(signatureStatusName("VALID")).not.toBe("VALID");
    expect(signatureStatusName("TAMPERED")).not.toBe("TAMPERED");
    expect(signatureStatusName("EXPIRED")).not.toBe("EXPIRED");
    expect(signatureStatusName("INVALID")).not.toBe("INVALID");
  });

  it("says what an altered document means, not just that it is tampered", () => {
    expect(signatureStatusName("TAMPERED").toLowerCase()).toContain("altered");
  });

  it("gives every status its own words", () => {
    const said = (["VALID", "TAMPERED", "EXPIRED", "INVALID"] as const)
      .map(signatureStatusName);

    expect(new Set(said).size).toBe(4);
  });

  it("colours a valid and an altered signature differently", () => {
    // Colour is a second cue beside the words, so it still has to differ.
    expect(signatureStatusClass("VALID")).not.toBe(signatureStatusClass("TAMPERED"));
  });
});

describe("naming a signing role", () => {
  it("uses the same words the signing form offers", () => {
    expect(signatureRoleName("Approver")).toBe("Approver");
  });

  it("keeps a role it does not recognise rather than dropping it", () => {
    // Losing the role would leave the signature saying nothing about why it
    // was applied.
    expect(signatureRoleName("Witness")).toBe("Witness");
  });
});

describe("reporting what re-checking a signature found", () => {
  it("distinguishes a signature in the file from one only in our records", () => {
    expect(verificationMessage("VALID", true))
      .not.toBe(verificationMessage("VALID", false));
  });

  it("says a detached signature cannot be checked elsewhere", () => {
    expect(verificationMessage("VALID", false).toLowerCase())
      .toContain("not written into the file");
  });

  it("tells someone what to do when the document has changed", () => {
    expect(verificationMessage("TAMPERED", true).toLowerCase()).toContain("history");
  });

  it("always says something, even for a status this build does not know", () => {
    const unknown = "REVOKED" as Parameters<typeof verificationMessage>[0];

    expect(verificationMessage(unknown, true)).not.toBe("");
    expect(verificationMessage(unknown, true)).toBeDefined();
  });
});
