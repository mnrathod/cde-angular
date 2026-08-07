// ── Auth ────────────────────────────────────────────────────────
export interface LoginRequest  { username: string; password: string; }
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
export type AnnotationType   = 'COMMENT' | 'MARKUP' | 'DIMENSION' | 'CLOUD' | 'ARROW' | 'STAMP' | 'HIGHLIGHT'
                              | 'UNDERLINE' | 'STRIKEOUT' | 'SQUIGGLY';
export type AnnotationStatus = 'OPEN' | 'RESOLVED' | 'CLOSED';

export interface Annotation {
  id:          number;
  documentId:  number;
  authorName:  string;
  type:        AnnotationType;
  shapeData:   string;
  comment:     string;
  status:      AnnotationStatus;
  pageNumber:  number;
  createdAt:   string;
}

export interface AnnotationRequest {
  documentId: number;
  type:       AnnotationType;
  shapeData:  string;
  comment:    string;
  pageNumber: number;
}

// ── Viewer ──────────────────────────────────────────────────────
export type ViewerType = 'pdf' | 'svg' | 'image' | 'ifc3d' | 'model3d' | 'office_error' | 'dwg_binary' | 'revit_binary' | 'unsupported' | 'error';

export interface ViewerData {
  type:          ViewerType;
  content?:      string;       // SVG content
  name?:         string;
  drawingNumber?: string;
  revision?:     string;
  renderedBy?:   string;
  error?:        string;
  fileName?:     string;
  ext?:          string;
  // IFC 3D
  gltfData?:     IFCGltfData;
  // DWG
  dwgVersion?:   string;
  odaInstalled?: boolean;
}

export interface IFCGltfData {
  positions:      string;   // base64
  normals:        string;
  indices:        string;
  colors:         string;
  vertexCount:    number;
  triangleCount:  number;
  elementCount:   number;
  schema:         string;
  bounds:         { min: number[]; max: number[] };
}

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
