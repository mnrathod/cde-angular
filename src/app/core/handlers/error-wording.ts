/**
 * What a reader is told when a request fails.
 *
 * <p>Every sentence here was hardcoded English inside a `.ts` file, where
 * neither the template sweep nor the message catalogue could see it. The
 * application is translated; its error messages were not, so the one moment
 * a reader most needs to understand what happened was the one moment the
 * product spoke to them in a language they may not read (§1.4).
 *
 * <p>In a file of its own because two callers need the same wording —
 * `GlobalErrorHandler`, which writes the toast for errors nobody caught, and
 * `problemMessage`, which writes in-place text for errors a component
 * handled itself. They had two copies of these sentences, kept in step by
 * hand, and a comment admitting it.
 */

/** Said when no response arrived at all, so there is no body to read. */
export function offlineMessage(): string {
  return $localize`:Shown when the browser could not reach the server at all@@error.offline:Cannot connect to the server. Check your network connection.`;
}

export function sessionExpiredMessage(): string {
  return $localize`:Shown when the session is no longer valid@@error.sessionExpired:Your session has expired. Please sign in again.`;
}

export function forbiddenMessage(): string {
  return $localize`:Shown when the account may not do what it asked@@error.forbidden:You do not have permission to do this.`;
}

export function notFoundMessage(): string {
  return $localize`:Shown when the thing requested does not exist@@error.notFound:That could not be found. It may have been moved or deleted.`;
}

export function invalidRequestMessage(): string {
  return $localize`:Fallback when the server rejected a request without explaining@@error.invalidRequest:That request could not be processed. Check the details and try again.`;
}

export function conflictMessage(): string {
  return $localize`:Fallback when a request collided with someone else's change@@error.conflict:Someone else changed this first. Reload and try again.`;
}

export function tooLargeMessage(): string {
  return $localize`:Shown when an upload exceeds the size the server accepts@@error.tooLarge:That file is too large to upload.`;
}

export function validationFailedMessage(): string {
  return $localize`:Fallback when the server rejected the contents of a request@@error.validationFailed:Some of what was entered is not valid. Correct it and try again.`;
}

export function rateLimitedMessage(): string {
  return $localize`:Shown when too many requests arrived too quickly@@error.rateLimited:Too many requests. Wait a moment and try again.`;
}

export function serverErrorMessage(): string {
  return $localize`:Shown when the server failed on its own account@@error.serverFault:Something went wrong at our end. It has been reported; please try again.`;
}

export function unavailableMessage(): string {
  return $localize`:Shown when the service is temporarily down or overloaded@@error.unavailable:The service is temporarily unavailable. Please try again shortly.`;
}

/**
 * The last resort, which still says what to do next.
 *
 * <p>The status is included because support asks for it, but never on its
 * own: "Request failed (502)." is the bare error code §1.4 forbids.
 */
export function unexplainedFailureMessage(status: number): string {
  return $localize`:Shown when a request failed and nothing explained why; the number is an HTTP status for support@@error.unexplained:That did not work. Please try again, and quote code ${status}:status: if it keeps happening.`;
}

/** Shown when a lazily loaded part of the application could not be fetched. */
export function staleApplicationMessage(): string {
  return $localize`:Shown when a code chunk fails to load, usually after a deployment@@error.staleApplication:Part of this page could not be loaded. Refreshing should fix it.`;
}

export function staleApplicationDetail(): string {
  return $localize`:Explains why a page part failed to load@@error.staleApplicationDetail:This usually happens just after an update.`;
}

/**
 * Shown for a fault in the application itself.
 *
 * <p>Deliberately says nothing about the exception. An exception message is
 * written for whoever is going to fix it, in English, and often names an
 * internal shape — it is not an explanation a reader can act on. The text
 * still reaches the remote log, where it is useful.
 */
export function unexpectedFaultMessage(): string {
  return $localize`:Shown when the application itself failed unexpectedly@@error.unexpected:Something went wrong. Try again, and reload the page if it keeps happening.`;
}

/** Precedes the identifier a reader can quote to support. */
export function referenceSuffix(traceId: string): string {
  return $localize`:Appended to an error message, giving the identifier support will ask for@@error.reference:Reference ${traceId}:traceId:.`;
}

/**
 * The sentence for an HTTP status, where the server sent no explanation.
 *
 * <p>A shared mapping rather than two: the duplicate in the global handler
 * and the one behind `problemMessage` disagreed about 403 already.
 */
export function messageForStatus(status: number): string {
  switch (status) {
    case 0: return offlineMessage();
    case 400: return invalidRequestMessage();
    case 401: return sessionExpiredMessage();
    case 403: return forbiddenMessage();
    case 404: return notFoundMessage();
    case 409: return conflictMessage();
    case 413: return tooLargeMessage();
    case 422: return validationFailedMessage();
    case 429: return rateLimitedMessage();
    case 500: return serverErrorMessage();
    case 502:
    case 503: return unavailableMessage();
    default: return unexplainedFailureMessage(status);
  }
}
