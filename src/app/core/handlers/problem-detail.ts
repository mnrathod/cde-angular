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
