/**
 * The document shapes the viewer works in.
 *
 * <p>Moved here from the application's model index because these are the
 * viewer's own vocabulary, not the platform's: a viewer embedded in another
 * CDE still has annotations, still has a rendered payload, and still has an
 * IFC geometry envelope. Leaving them behind would have meant the extracted
 * services importing types from an application they are meant to be
 * independent of.
 *
 * <p>The application still imports them from `core/models`, which re-exports
 * this file. One definition, so the two cannot drift.
 *
 * <p>`Annotation` carries `documentId: number`, which is the platform's
 * identifier shape rather than a universal one. That is a wire-contract
 * decision to revisit when the integration contract is written — recorded
 * here rather than silently generalised.
 */

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
