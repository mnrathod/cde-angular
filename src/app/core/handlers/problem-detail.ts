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
 * <p>A caller's fallback names the feature the user pressed — "OCR failed.",
 * "The upload could not be completed." That is right when the request reached
 * the feature and the feature refused, and wrong in the most expensive
 * direction otherwise: it sends the reader to investigate OCR when nothing was
 * ever asked of it, and an expired session reads as a broken converter. Some
 * failures never reach the code that would have written a problem document,
 * and those are the ones handled here.
 *
 * <p>Order matters, and it is the opposite of what it first appears. The
 * server's own sentence wins wherever there is one, because a 403 can mean
 * "this organisation is invitation-only" as readily as "you lack the
 * permission" and only the server knows which. A status-derived sentence is a
 * last resort, used only when the body is empty — otherwise this would discard
 * the one useful explanation, which is the fault it exists to fix. Status 0 is
 * the single exception, and only because no response arrived to carry a body.
 *
 * <p>`GlobalErrorHandler.httpMessage` maps these statuses too and stays
 * separate on purpose: it writes toast text for errors nobody caught, while
 * this writes in-place text for errors a component handled itself. Folding
 * them together would make one wording serve two contexts. It is the only
 * remaining caller of `problemDetail` — every component now comes through
 * here — so if its wording and this ever need to agree, that is the moment to
 * extract one mapping rather than keep two in step by hand.
 *
 * <p>The trace identifier is appended only when the server actually sent one.
 * A reference support cannot find is worse than no reference.
 */
export function problemMessage(err: unknown, fallback: string): string {
  const status = (err as { status?: number } | null)?.status;

  // Status 0 is the one case that cannot carry a body: no response arrived.
  if (status === 0) return 'Cannot connect to server. Check your network connection.';

  // The server's own sentence always wins. A 403 can mean "registration is by
  // invitation only" as easily as "you lack the permission", and only the
  // server knows which — replacing that with a generic sentence would repeat
  // the very fault this function exists to fix.
  const detail = problemDetail(err, '');
  if (detail) {
    const traceId = problemTraceId(err);
    return traceId ? `${detail} Reference ${traceId}.` : detail;
  }

  // Nothing to read. Only now is a status-derived sentence better than the
  // caller's fallback, because the fallback names the feature.
  switch (status) {
    case 401: return 'Your session has expired. Please sign in again.';
    case 403: return 'You do not have permission to perform this action.';
    default:  return fallback;
  }
}
