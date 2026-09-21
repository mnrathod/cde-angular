/**
 * Saying a signature's role and state in words a reader shares.
 *
 * <p>The list showed the server's own enum values — `VALID`, `TAMPERED`,
 * `Approver` — straight onto the screen. Two things were wrong with that.
 * They are untranslated English in shouting case, which §1.4 does not allow
 * anywhere user-facing; and the same role that reads "Approver" here is
 * already translated in the signing form's dropdown, so one document showed
 * one role under two different names.
 *
 * <p>The mapping lives here rather than in either component because both the
 * form and the list need it, and because a status the server adds later
 * should fail in one place rather than four.
 */
import { SignatureRecord } from "../../../core/services/signature.service";

/** A signature's state, as a reader should see it. */
export function signatureStatusName(status: SignatureRecord["status"]): string {
  switch (status) {
    case "VALID":
      return $localize`:A signature that still matches the document@@signatureStatus.valid:Valid`;
    case "TAMPERED":
      return $localize`:A signature whose document has been altered since it was signed@@signatureStatus.tampered:Document altered`;
    case "EXPIRED":
      return $localize`:A signature whose signing certificate is no longer in date@@signatureStatus.expired:Certificate expired`;
    case "INVALID":
      return $localize`:A signature that did not verify, for a reason other than alteration or expiry@@signatureStatus.invalid:Invalid`;
  }
}

/**
 * The capacity someone signed in.
 *
 * <p>The record types this as a plain string, so an unknown role is shown as
 * the server sent it rather than dropped. Losing a role would leave the
 * signature saying nothing about why it was applied.
 */
export function signatureRoleName(role: string): string {
  switch (role) {
    case "Author":
      return $localize`:Signing role — the person who produced the document@@signatureRole.author:Author`;
    case "Reviewer":
      return $localize`:Signing role — the person who checked the document@@signatureRole.reviewer:Reviewer`;
    case "Approver":
      return $localize`:Signing role — the person who authorised the document for use@@signatureRole.approver:Approver`;
    default:
      return role;
  }
}

/**
 * Colours for a status badge.
 *
 * <p>A second cue, never the only one: the badge carries the status in words
 * as well, because colour alone does not carry meaning (§1A.2).
 */
export function signatureStatusClass(status: SignatureRecord["status"]): string {
  switch (status) {
    case "VALID":
      return "bg-green-100 text-green-700";
    case "TAMPERED":
    case "INVALID":
      return "bg-red-100 text-red-700";
    case "EXPIRED":
      return "bg-amber-100 text-amber-700";
  }
}

/**
 * What re-checking a signature found.
 *
 * <p>The panel showed the server's own `message`, which is English prose
 * built in the service layer. The status it arrives with is the same small
 * enum the record carries, so the sentence can be said here instead — in the
 * reader's language, and saying what the finding means rather than only
 * naming it (§1.4).
 *
 * <p>`embedded` changes what a valid result is worth: a signature written
 * into the file can be checked by anyone holding the file, while a detached
 * one is only as good as our record of it. That distinction is the whole
 * point of embedding, so it belongs in the sentence.
 */
export function verificationMessage(
  status: SignatureRecord["status"],
  embedded: boolean,
): string {
  switch (status) {
    case "VALID":
      return embedded
        ? $localize`:Result of re-checking a signature written into the document itself@@signatures.verifiedEmbedded:This signature is valid and the document has not changed since it was signed. The signature travels with the file, so anyone holding it can check this.`
        : $localize`:Result of re-checking a signature held only in this application's records@@signatures.verifiedDetached:This signature matches our record of the document. It is not written into the file, so a recipient outside this application cannot check it.`;
    case "TAMPERED":
      return $localize`:Result of re-checking a signature whose document has since been altered@@signatures.verifiedTampered:The document has changed since this signature was applied, so the signature no longer covers what the file contains. Compare it against the version it was signed on in the history.`;
    case "EXPIRED":
      return $localize`:Result of re-checking a signature whose certificate has lapsed@@signatures.verifiedExpired:The certificate that made this signature is no longer in date. Sign the document again to replace it.`;
    // A status this build does not know is still a failed check, and saying
    // so is better than returning nothing and rendering a blank banner.
    case "INVALID":
    default:
      return $localize`:Result of re-checking a signature that could not be confirmed@@signatures.verifiedInvalid:This signature could not be confirmed. The document may have been altered, or the signed file may be unreadable — contact support if it should be valid.`;
  }
}

export function signatureRoleClass(role: string): string {
  switch (role) {
    case "Author":
      return "bg-blue-100 text-blue-700";
    case "Reviewer":
      return "bg-amber-100 text-amber-700";
    case "Approver":
      return "bg-green-100 text-green-700";
    default:
      return "bg-gray-100 text-gray-600";
  }
}
