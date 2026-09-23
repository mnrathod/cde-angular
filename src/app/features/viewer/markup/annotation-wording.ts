/**
 * Saying an annotation's state in words a reader shares.
 *
 * <p>The panel rendered `OPEN` and `RESOLVED` straight onto the screen —
 * the server's enum, untranslated, in shouting case. Same defect as the
 * signature statuses beside them, and the same fix (§1.4).
 */
import { AnnotationStatus } from "../../../../viewer-core/models";

export function annotationStatusName(status: AnnotationStatus): string {
  switch (status) {
    case "OPEN":
      return $localize`:An annotation still awaiting a response@@annotationStatus.open:Open`;
    case "RESOLVED":
      return $localize`:An annotation someone has marked as dealt with@@annotationStatus.resolved:Resolved`;
    case "CLOSED":
      return $localize`:An annotation closed without being resolved@@annotationStatus.closed:Closed`;
  }
}

/**
 * Colours for a status badge.
 *
 * <p>A second cue, never the only one: the badge carries the status in words
 * as well, because colour alone does not carry meaning (§1A.2).
 */
export function annotationStatusClass(status: AnnotationStatus): string {
  return status === "OPEN"
    ? "bg-amber-100 text-amber-700"
    : "bg-green-100 text-green-700";
}
