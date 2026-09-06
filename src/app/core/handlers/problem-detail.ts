/**
 * The human-readable text from an RFC 9457 problem document.
 *
 * The API returns `detail`; `message` was the field name before the error
 * envelope became RFC 9457, and reading it now yields undefined — which
 * showed as a generic fallback rather than the message the server actually
 * sent. Kept in one place so the next rename is one edit.
 */
export function problemDetail(err: unknown, fallback: string): string {
  const body = (err as { error?: { detail?: unknown; title?: unknown } } | null)?.error;
  if (body && typeof body.detail === 'string' && body.detail.trim()) return body.detail;
  if (body && typeof body.title === 'string' && body.title.trim()) return body.title;
  return fallback;
}

/**
 * The trace identifier a user can quote to support. Present on every problem
 * document, and also returned in the `X-Trace-Id` header.
 */
export function problemTraceId(err: unknown): string | null {
  const traceId = (err as { error?: { traceId?: unknown } } | null)?.error?.traceId;
  return typeof traceId === 'string' ? traceId : null;
}

/**
 * What to show the user when a request fails: what actually happened, and the
 * reference they can quote to support (§1.4).
 *
 * <p>Three statuses arrive with no problem document to read, because the
 * request never reached the code that would have written one — 0 when it never
 * reached the server at all (API down, proxy not forwarding, DNS, or a
 * cross-origin block), 401 when the session has gone, 403 when the caller
 * lacks the permission. Callers that fall straight through to their own
 * fallback render these as "OCR failed." or "Could not load version history.",
 * which is wrong in the most expensive direction: it names the feature, so the
 * reader goes and investigates OCR when nothing was ever asked of it. An
 * expired session reads as a broken converter.
 *
 * <p>`GlobalErrorHandler.httpMessage` maps the same three, and deliberately
 * stays separate: it writes toast text for errors nobody caught, while this
 * writes panel text for errors a component handled itself. Both surfaces need
 * the knowledge; folding them together means one wording serving two contexts.
 * If a fourth status needs the same treatment, that is the third caller and
 * the point to extract one mapping.
 *
 * <p>The trace identifier is appended only when the server actually sent one.
 * A reference support cannot find is worse than no reference.
 */
export function problemMessage(err: unknown, fallback: string): string {
  switch ((err as { status?: number } | null)?.status) {
    case 0:   return 'Cannot connect to server. Check your network connection.';
    case 401: return 'Your session has expired. Please sign in again.';
    case 403: return 'You do not have permission to perform this action.';
    default:  break;
  }
  const text = problemDetail(err, fallback);
  const traceId = problemTraceId(err);
  return traceId ? `${text} Reference ${traceId}.` : text;
}
