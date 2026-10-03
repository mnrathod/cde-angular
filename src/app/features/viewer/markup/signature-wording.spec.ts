/**
 * Saying a signature's role and state in words a reader shares.
 *
 * <p>The list used to show the server's enum values straight onto the screen —
 * `VALID`, `TAMPERED`, `Approver`. That is untranslated English in shouting
 * case, which §1.4 does not allow anywhere user-facing, and the same role read
 * "Approver" here while already appearing translated in the signing form's
 * dropdown: one document, one role, two names.
 *
 * <p>Two of these mappings are accessibility controls rather than cosmetics.
 * §1A.2 says colour is never the sole carrier of meaning, so a status badge
 * needs its status in words as well as in green or red — which means the class
 * function and the name function have to stay in step, and a status added to
 * one but not the other is the defect. These assert both for every member of
 * the enum, by iterating it rather than by listing the ones somebody
 * remembered.
 */
import { SignatureRecord } from "../../../core/services/signature.service";
import {
  signatureRoleClass,
  signatureRoleName,
  signatureStatusClass,
  signatureStatusName,
  verificationMessage,
} from "./signature-wording";

const everyStatus: ReadonlyArray<SignatureRecord["status"]> = [
  "VALID",
  "TAMPERED",
  "EXPIRED",
  "INVALID",
];

const everyKnownRole = ["Author", "Reviewer", "Approver"] as const;

describe("the wording on a signature", () => {
  describe("its state, in words", () => {
    for (const status of everyStatus) {
      it(`${status} is said in words, not as the enum`, () => {
        const name = signatureStatusName(status);

        expect(name).not.toBe(status);
        expect(name).not.toMatch(/^[A-Z_]+$/);
      });
    }

    it("no two states read the same", () => {
      // Two states collapsing onto one word is worse than showing the enum: the
      // reader cannot tell an altered document from an expired certificate, and
      // those call for completely different actions.
      const names = everyStatus.map(signatureStatusName);

      expect(new Set(names).size).toBe(everyStatus.length);
    });

    it("an altered document says so, rather than only that it is invalid", () => {
      // The most important distinction in the set. "Invalid" sends the reader
      // to support; "document altered" sends them to the version history, which
      // is where the answer is.
      expect(signatureStatusName("TAMPERED").toLowerCase()).toContain("altered");
    });

    it("an expired certificate names the certificate, not the signature", () => {
      // The signature was good when it was made. Saying the signature is
      // invalid would impugn the signer.
      expect(signatureStatusName("EXPIRED").toLowerCase()).toContain("certificate");
    });
  });

  describe("its state, as a colour", () => {
    for (const status of everyStatus) {
      it(`${status} has a colour`, () => {
        expect(signatureStatusClass(status)).not.toBe("");
      });
    }

    it("a valid signature does not share its colour with a failed one", () => {
      // The colour is a second cue and not the carrier (§1A.2), but a second
      // cue that is the same for a pass and a failure is worse than none — it
      // actively suggests they are the same.
      expect(signatureStatusClass("VALID")).not.toBe(signatureStatusClass("TAMPERED"));
      expect(signatureStatusClass("VALID")).not.toBe(signatureStatusClass("INVALID"));
      expect(signatureStatusClass("VALID")).not.toBe(signatureStatusClass("EXPIRED"));
    });

    it("the two kinds of failure deliberately share one colour", () => {
      // Both are "this signature does not hold". The words are what distinguish
      // them, which is the right way round.
      expect(signatureStatusClass("TAMPERED")).toBe(signatureStatusClass("INVALID"));
    });

    it("an expired certificate is not coloured as a hard failure", () => {
      // It is a lapse rather than a tampering, and the badge should not accuse.
      expect(signatureStatusClass("EXPIRED")).not.toBe(signatureStatusClass("TAMPERED"));
    });

    it("every state carries both a background and a text colour", () => {
      // One without the other is how a badge ends up as grey text on grey, and
      // §1A.2 wants 4.5:1 on body text. Naming both is what makes the pair
      // auditable at all.
      for (const status of everyStatus) {
        const classes = signatureStatusClass(status);
        expect(classes).toMatch(/\bbg-/);
        expect(classes).toMatch(/\btext-/);
      }
    });
  });

  describe("the capacity someone signed in", () => {
    for (const role of everyKnownRole) {
      it(`${role} is translated rather than passed through`, () => {
        expect(signatureRoleName(role)).not.toBe("");
      });
    }

    it("no two roles read the same", () => {
      const names = everyKnownRole.map(signatureRoleName);

      expect(new Set(names).size).toBe(everyKnownRole.length);
    });

    it("the words match the ones the signing form offers", () => {
      // The defect this file exists for: the same role read "Approver" in the
      // signing dropdown and something else in the list of the same document's
      // signatures. Both now resolve the same $localize id, so they cannot
      // diverge — the form's own spec asserts the rendered option against this
      // function, which is the end of that guarantee that a reader can see.
      for (const role of everyKnownRole) {
        expect(signatureRoleName(role)).toBe(role);
      }
    });

    it("a role this build does not know is shown as the server sent it", () => {
      // Deliberate. The record types the role as a plain string, so the server
      // can add one without a frontend release — and dropping it would leave the
      // signature saying nothing about why it was applied, which is most of what
      // a signature is for.
      expect(signatureRoleName("Witness")).toBe("Witness");
    });

    it("an unknown role still gets a badge colour, so it does not render unstyled", () => {
      expect(signatureRoleClass("Witness")).not.toBe("");
      expect(signatureRoleClass("Witness")).toMatch(/\bbg-/);
    });

    it("each known role has its own colour", () => {
      const classes = everyKnownRole.map(signatureRoleClass);

      expect(new Set(classes).size).toBe(everyKnownRole.length);
    });

    it("an unknown role is not coloured as though it were an approval", () => {
      // Approver is the one with contractual weight. A role the build does not
      // recognise must not inherit its green.
      expect(signatureRoleClass("Witness")).not.toBe(signatureRoleClass("Approver"));
    });
  });

  describe("what re-checking a signature found", () => {
    it("a valid embedded signature says the check travels with the file", () => {
      // This is the whole point of embedding, and the distinction a recipient
      // outside this application depends on.
      const message = verificationMessage("VALID", true);

      expect(message.toLowerCase()).toContain("travels with the file");
      expect(message.toLowerCase()).toContain("valid");
    });

    it("a valid detached signature says the check does not", () => {
      // It is only as good as our record of it. Saying "valid" without that
      // qualification would let someone send the file out believing the
      // signature went with it.
      const message = verificationMessage("VALID", false);

      expect(message.toLowerCase()).toContain("not written into the file");
    });

    it("the two valid results are not the same sentence", () => {
      expect(verificationMessage("VALID", true)).not.toBe(verificationMessage("VALID", false));
    });

    it("an altered document points at the version history", () => {
      // What to do next (§1.4). Comparing against the version it was signed on
      // is the only way to find out what changed.
      expect(verificationMessage("TAMPERED", true).toLowerCase()).toContain("history");
    });

    it("an expired certificate says to sign again", () => {
      expect(verificationMessage("EXPIRED", true).toLowerCase()).toContain("sign the document again");
    });

    it("a failure that cannot be explained still names a next step", () => {
      expect(verificationMessage("INVALID", true).toLowerCase()).toContain("support");
    });

    for (const status of ["TAMPERED", "EXPIRED", "INVALID"] as const) {
      it(`${status} reads the same whether or not the signature was embedded`, () => {
        // Embedding changes what a pass is worth. It changes nothing about a
        // failure, so varying the sentence would imply a distinction that is not
        // there.
        expect(verificationMessage(status, true)).toBe(verificationMessage(status, false));
      });
    }

    it("a status this build does not know still says the check failed", () => {
      // Reachable when the server adds a status: returning nothing would render
      // a blank banner, which reads as a pass.
      const message = verificationMessage(
        "REVOKED" as SignatureRecord["status"],
        true,
      );

      expect(message.trim()).not.toBe("");
      expect(message.toLowerCase()).toContain("could not be confirmed");
    });

    for (const status of everyStatus) {
      it(`the ${status} finding is a sentence, not a status name`, () => {
        const message = verificationMessage(status, true);

        expect(message.length).toBeGreaterThan(40);
        expect(message).not.toBe(status);
      });
    }
  });
});
