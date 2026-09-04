// ── Auth ────────────────────────────────────────────────────────
export interface LoginRequest  { username: string; password: string; }
export interface RegisterRequest {
  username: string;
  email:    string;
  /** Backend enforces a 12-character minimum, and checks against breached sets. */
  password: string;
  /**
   * An invitation issued by an administrator of the organisation to join.
   * Omitted, the account gets a new organisation of its own and administers it.
   * The invited address must match `email`, so a forwarded invitation does not
   * admit whoever received it.
   */
  invitationToken?: string;
  /** Names the new organisation. Ignored when an invitation is presented. */
  organisationName?: string;
  // No role, and no tenant. Registration needs no credential, so either asked
  // for here would be granted to whoever asked. The role comes back on the
  // AuthResponse; the organisation comes from the invitation, or is created.
}
export interface AuthResponse  { token: string; username: string; role: string; }

// ── Project ─────────────────────────────────────────────────────
export type ProjectPhase = 'CONCEPT' | 'DESIGN' | 'CONSTRUCTION' | 'HANDOVER' | 'OPERATION';

export interface Project {
  id:          number;
  name:        string;
  description: string;
  phase:       ProjectPhase;
  location:    string;
  createdAt:   string;
  documentCount?: number;
}

// ── Document ────────────────────────────────────────────────────
export type DocumentType   = 'DRAWING' | 'SPECIFICATION' | 'REPORT' | 'SCHEDULE' | 'BIM_MODEL' | 'OTHER';
export type DocumentStatus = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'SUPERSEDED';

export interface Document {
  id:            number;
  name:          string;
  fileName:      string;
  fileType:      string;
  fileSize:      number;
  documentType:  DocumentType;
  status:        DocumentStatus;
  drawingNumber: string;
  revision:      string;
  projectId:     number;
  createdAt:     string;
}

// ── Annotation ──────────────────────────────────────────────────
import type { AnnotationType, Annotation } from '../../../viewer-core/models';
export type { AnnotationType, AnnotationStatus, Annotation } from '../../../viewer-core/models';

export interface AnnotationRequest {
  documentId: number;
  type:       AnnotationType;
  shapeData:  string;
  comment:    string;
  pageNumber: number;
}

// ── Viewer ──────────────────────────────────────────────────────
export type { ViewerType, ViewerData, IFCGltfData } from '../../../viewer-core/models';

// ── Compare ─────────────────────────────────────────────────────
export interface CompareRequest {
  documentId1: number;
  documentId2: number;
}

export type ChangeSeverity = 'high' | 'medium' | 'low';
export type ChangeType     = 'added' | 'removed' | 'modified';

export interface ChangeItem {
  category:  string;
  severity:  ChangeSeverity;
  type:      ChangeType;
  icon:      string;
  change:    string;
  detail?:   string;
}

export interface CompareResult {
  success:        boolean;
  error?:         string;
  warning?:       string;
  fileType:       string;
  overall:        string;
  totalChanges:   number;
  added:          number;
  removed:        number;
  changes:        ChangeItem[];
  stats?:         Record<string, unknown>;
  doc1Name:       string;
  doc2Name:       string;
  doc1Revision:   string;
  doc2Revision:   string;
}

// ── Annotation Threads ──────────────────────────────────────────
export interface AnnotationReply {
  id:          number;
  annotationId: number;
  authorName:  string;
  content:     string;
  createdAt:   string;
  mentions?:   string[];
}

export interface AnnotationThread {
  annotation: Annotation;
  replies:    AnnotationReply[];
}
