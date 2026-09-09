/**
 * The `cde.viewer.v1` wire vocabulary, as types and validators.
 *
 * Specified in `docs/viewer-embed-protocol.md`, which is the authority; this
 * file is that document expressed so the compiler can check it. Where the two
 * disagree the document wins and this file is the defect.
 *
 * Everything here is pure — no DOM, no Angular, no I/O — so the validators can
 * be tested against adversarial input directly. The channel that uses them
 * lives in `host-channel.service.ts`.
 */

/** The major version this build speaks. §10: a change here is a new major. */
export const PROTOCOL = 'cde.viewer.v1';

/** Every version this deployment can serve, reported in `viewer.ready`. */
export const SUPPORTED_PROTOCOLS = [PROTOCOL] as const;

export type ViewerMessageType =
  | 'viewer.ready' | 'viewer.loaded' | 'viewer.error'
  | 'viewer.markupCreated' | 'viewer.markupUpdated' | 'viewer.markupDeleted'
  | 'viewer.operationRequest' | 'viewer.selectionChanged'
  | 'viewer.viewChanged' | 'viewer.resized';

export type HostMessageType =
  | 'host.init' | 'host.loadDocument' | 'host.setIdentity'
  | 'host.loadMarkup' | 'host.command' | 'host.operationResult';

export interface Envelope<TType extends string = string> {
  protocol: typeof PROTOCOL;
  type: TType;
  id: string;
  replyTo?: string;
  payload: Record<string, unknown>;
}

/** RFC 9457 Problem Details — the same envelope as the HTTP API (§8). */
export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail: string;
  traceId?: string;
}

export interface DocumentDescriptor {
  url: string;
  mediaType: string;
  displayName: string;
  externalId?: string;
}

/**
 * What the host says about the user.
 *
 * Untrusted and presentational, always. §7: `capabilities` decides which
 * controls render and never whether an operation may proceed — the host
 * re-checks server-side when the operation is requested, and is expected to
 * refuse operations whose capability it granted here.
 */
export interface Identity {
  displayName?: string;
  subjectId?: string;
  capabilities?: string[];
}

export interface Markup {
  markupId: string;
  externalId?: string;
  page: number;
  type: string;
  /** The viewer's own geometry encoding. Opaque to the host by contract. */
  shapeData: string;
  comment?: string;
  createdAt?: string;
}

export type OperationStatus = 'applied' | 'refused' | 'failed';

/** Operations that are host callbacks whatever else changes (§6.1). */
export const ALWAYS_HOST_OPERATIONS = [
  'document.sign', 'version.create', 'version.restore',
] as const;

// ── Validation ──────────────────────────────────────────────────────────────
//
// Rule 4 of §3: every payload is untrusted in both directions. These check
// shape, not intent — a message that passes is well-formed, not trustworthy.

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Is this an envelope we should even look at?
 *
 * §4: a message whose `protocol` does not match is ignored **silently**. The
 * host page may contain other frames using postMessage for their own reasons,
 * and logging their traffic as malformed trains people to ignore the log. So
 * this returns a plain boolean and never throws or reports.
 */
export function isOurEnvelope(value: unknown): value is Envelope {
  return isObject(value)
    && value['protocol'] === PROTOCOL
    && isNonEmptyString(value['type'])
    && isNonEmptyString(value['id'])
    && (value['replyTo'] === undefined || isNonEmptyString(value['replyTo']))
    && isObject(value['payload']);
}

/**
 * An absolute origin, as `parentOrigin` must be.
 *
 * Rejects `"*"`, `"null"`, paths, and anything the URL parser will not accept.
 * §2: this is addressing rather than authorisation — `frame-ancestors` is what
 * stops an unlisted origin framing us — but an origin we cannot parse is one we
 * cannot address, and the alternative to failing here is a wildcard target,
 * which rule 1 of §3 forbids outright.
 */
export function isUsableOrigin(candidate: string | null | undefined): candidate is string {
  if (!isNonEmptyString(candidate) || candidate === '*' || candidate === 'null') return false;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return false;
  }
  // `new URL('https://a.example/x').origin` drops the path, so a caller passing
  // a full URL would get a *different* origin than they wrote and never know.
  return (parsed.protocol === 'https:' || parsed.protocol === 'http:')
    && parsed.origin === candidate;
}

export function isDocumentDescriptor(value: unknown): value is DocumentDescriptor {
  return isObject(value)
    && isNonEmptyString(value['url'])
    && isNonEmptyString(value['mediaType'])
    && isNonEmptyString(value['displayName'])
    && (value['externalId'] === undefined || typeof value['externalId'] === 'string');
}

export function isIdentity(value: unknown): value is Identity {
  if (!isObject(value)) return false;
  const capabilities = value['capabilities'];
  return (value['displayName'] === undefined || typeof value['displayName'] === 'string')
    && (value['subjectId'] === undefined || typeof value['subjectId'] === 'string')
    && (capabilities === undefined
      || (Array.isArray(capabilities) && capabilities.every((item) => typeof item === 'string')));
}

export function isMarkup(value: unknown): value is Markup {
  return isObject(value)
    && isNonEmptyString(value['markupId'])
    && typeof value['page'] === 'number'
    && Number.isFinite(value['page'])
    && isNonEmptyString(value['type'])
    && typeof value['shapeData'] === 'string';
}

export function isOperationStatus(value: unknown): value is OperationStatus {
  return value === 'applied' || value === 'refused' || value === 'failed';
}

/**
 * A document URL we are willing to dereference.
 *
 * The host mints this with its own credentials, so it is not ours to second
 * guess — but `javascript:` and `data:` are not documents, they are script
 * delivery, and a host that has been tricked into sending one should not be
 * able to make the viewer run it.
 */
export function isFetchableDocumentUrl(candidate: string): boolean {
  try {
    const parsed = new URL(candidate, 'https://invalid.example');
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function problem(
  slug: string, title: string, status: number, detail: string, traceId?: string,
): ProblemDetail {
  return {
    type: `https://cde.example/problems/${slug}`,
    title, status, detail,
    ...(traceId ? { traceId } : {}),
  };
}
