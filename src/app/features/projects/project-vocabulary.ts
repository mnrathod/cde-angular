/**
 * The words and the chip colours for the two enumerations the project screens
 * show: what stage a project is at, and where a document sits in review.
 *
 * <p>These live outside the components because three of them need the same
 * answer — the sidebar chip, the document card, and the dialogs' dropdowns —
 * and a label that reads one way in the list and another on the card is the
 * kind of drift nobody notices until a translator asks which is right.
 *
 * <p>Plain functions over a service: there is no state, nothing to inject and
 * nothing to configure, so a service would only add a constructor.
 */
import { DocumentStatus, DocumentType, ProjectPhase } from "../../core/models";

/** Phases offered in the project dialog, in the order a project moves. */
export const PROJECT_PHASES: readonly ProjectPhase[] = [
  "CONCEPT",
  "DESIGN",
  "CONSTRUCTION",
  "HANDOVER",
  "OPERATION",
];

/** Statuses offered on a document card, in review order. */
export const DOCUMENT_STATUSES: readonly DocumentStatus[] = [
  "DRAFT",
  "IN_REVIEW",
  "APPROVED",
  "SUPERSEDED",
];

/** Types offered on upload, commonest first. */
export const DOCUMENT_TYPES: readonly DocumentType[] = [
  "BIM_MODEL",
  "DRAWING",
  "SPECIFICATION",
  "REPORT",
  "SCHEDULE",
  "OTHER",
];

const TYPE_LABELS: Record<string, string> = {
  BIM_MODEL: $localize`:Document type — a three-dimensional building information model. BIM is an industry term and usually stays as it is.@@documentType.bimModel:BIM Model`,
  DRAWING: $localize`:Document type — a technical drawing@@documentType.drawing:Drawing`,
  SPECIFICATION: $localize`:Document type — a written specification@@documentType.specification:Specification`,
  REPORT: $localize`:Document type — a report@@documentType.report:Report`,
  SCHEDULE: $localize`:Document type — a tabulated list, such as a door or window schedule. Not a timetable.@@documentType.schedule:Schedule`,
  OTHER: $localize`:Document type — anything not covered by the other options@@documentType.other:Other`,
};

const PHASE_LABELS: Record<string, string> = {
  CONCEPT: $localize`:Project phase — early ideas, before design proper@@projectPhase.concept:Concept`,
  DESIGN: $localize`:Project phase — the design is being produced@@projectPhase.design:Design`,
  CONSTRUCTION: $localize`:Project phase — the asset is being built@@projectPhase.construction:Construction`,
  HANDOVER: $localize`:Project phase — the finished asset is being handed to its owner@@projectPhase.handover:Handover`,
  OPERATION: $localize`:Project phase — the asset is in use and being maintained@@projectPhase.operation:Operation`,
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: $localize`:Document status — not yet issued for review@@documentStatus.draft:Draft`,
  IN_REVIEW: $localize`:Document status — issued and being reviewed@@documentStatus.inReview:In review`,
  APPROVED: $localize`:Document status — reviewed and authorised for use@@documentStatus.approved:Approved`,
  SUPERSEDED: $localize`:Document status — replaced by a later revision@@documentStatus.superseded:Superseded`,
};

/** Neutral grey, for a value this table has not been told about yet. */
const UNRECOGNISED_CHIP = "background:#f1f5f9;color:#475569";

const PHASE_CHIP_STYLES: Record<string, string> = {
  CONCEPT: "background:#ede9fe;color:#6d28d9",
  DESIGN: "background:#dbeafe;color:#1d4ed8",
  CONSTRUCTION: "background:#fef3c7;color:#b45309",
  HANDOVER: "background:#dcfce7;color:#15803d",
  OPERATION: "background:#f1f5f9;color:#475569",
};

const STATUS_CHIP_STYLES: Record<string, string> = {
  DRAFT: "background:#f1f5f9;color:#64748b",
  IN_REVIEW: "background:#fef3c7;color:#b45309",
  APPROVED: "background:#dcfce7;color:#15803d",
  SUPERSEDED: "background:#fee2e2;color:#b91c1c",
};

/**
 * What a person should read for a stored phase.
 *
 * <p>The server stores `CONSTRUCTION`; this used to be rendered by swapping
 * the underscore for a space, which is legible in English and meaningless
 * anywhere else. Falling back to the stored value matters: the server may add
 * a phase before this table knows about it, and an untidy chip beats an empty
 * one, which reads as missing data.
 */
export function phaseLabel(phase: string): string {
  return PHASE_LABELS[phase] ?? phase;
}

/** What a person should read for a stored document status. */
export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

/** What a person should read for a stored document type. */
export function documentTypeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

/**
 * Chip colours for a phase.
 *
 * <p>Colour is never the only cue here — every chip carries its label too
 * (§1A.2), so this is decoration rather than meaning.
 */
export function phaseChipStyle(phase: string): string {
  return PHASE_CHIP_STYLES[phase] ?? UNRECOGNISED_CHIP;
}

/** Chip colours for a document status, alongside its label. */
export function statusChipStyle(status: string): string {
  return STATUS_CHIP_STYLES[status] ?? UNRECOGNISED_CHIP;
}
