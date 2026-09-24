import { Injectable, ErrorHandler, inject, signal } from '@angular/core';
import { RemoteLoggingService } from '../services/remote-logging.service';
import { HttpErrorResponse } from '@angular/common/http';
import { problemDetail, problemTraceId } from './problem-detail';
import {
  messageForStatus,
  referenceSuffix,
  staleApplicationDetail,
  staleApplicationMessage,
  unexpectedFaultMessage,
} from './error-wording';

export interface AppError {
  id:        string;
  /** What the reader is shown. Translated, and never an exception's text. */
  message:   string;
  detail?:   string;
  /**
   * The exception's own message, for the remote log only.
   *
   * <p>Never rendered. It is written for whoever will fix the fault, in
   * English, and often names an internal shape — showing it to a reader
   * explains nothing and leaks the application's insides (§1.4). Dropping it
   * entirely would have cost the one field that makes a report diagnosable,
   * so it travels here instead of in `message`.
   */
  technical?: string;
  stack?:    string;
  timestamp: Date;
  type:      'http' | 'runtime' | 'chunk' | 'unknown';
  status?:   number;
  dismissed: boolean;
}

/**
 * GlobalErrorHandler
 * Catches all uncaught Angular errors and:
 * 1. Logs them (console + optional remote logging)
 * 2. Stores them in a signal for the ErrorToastComponent
 * 3. Never crashes the app — always swallows and recovers
 */
@Injectable({ providedIn: 'root' })
export class GlobalErrorHandler implements ErrorHandler {

  // Signal-based error queue — components subscribe to this
  readonly errors  = signal<AppError[]>([]);
  private logger   = inject(RemoteLoggingService);

  handleError(err: unknown): void {
    const appError = this.classify(err);
    this.errors.update(list => [...list.slice(-4), appError]);  // keep last 5
    this.log(appError, err);
  }

  dismiss(id: string) {
    this.errors.update(list =>
      list.map(e => e.id === id ? { ...e, dismissed: true } : e)
    );
  }

  dismissAll() {
    this.errors.update(list => list.map(e => ({ ...e, dismissed: true })));
  }

  private classify(err: unknown): AppError {
    const id        = crypto.randomUUID();
    const timestamp = new Date();

    if (err instanceof HttpErrorResponse) {
      const message = this.httpMessage(err);
      return { id, timestamp, type: 'http', status: err.status,
               message, detail: err.url || undefined, dismissed: false };
    }

    if (err instanceof Error) {
      // Lazy-chunk loading failure (route-level code splitting)
      if (err.message?.includes('Loading chunk') || err.message?.includes('Failed to fetch')) {
        return { id, timestamp, type: 'chunk', dismissed: false,
                 message: staleApplicationMessage(),
                 detail: staleApplicationDetail(),
                 technical: err.message };
      }
      return { id, timestamp, type: 'runtime', dismissed: false,
               message: unexpectedFaultMessage(),
               technical: err.message, stack: err.stack, detail: err.name };
    }

    return { id, timestamp, type: 'unknown', dismissed: false,
             message: unexpectedFaultMessage(),
             technical: String(err) };
  }

  /**
   * What to show for a failed request.
   *
   * <p>The server's own sentence wherever it sent one — only it knows
   * whether a 409 was a stale edit or a duplicate name — and the shared
   * wording otherwise. The statuses that carry no useful body of their own
   * go straight to the shared mapping.
   */
  private httpMessage(err: HttpErrorResponse): string {
    const explained = [400, 409, 422].includes(err.status);
    const sentence = explained
      ? problemDetail(err, messageForStatus(err.status))
      : messageForStatus(err.status);

    // The reference support will ask for, wherever the server sent one
    // (§1.4). The in-place path through `problemMessage` has always appended
    // it; the toast dropped it, which is the wrong way round — this is the
    // path for failures nobody expected, so it is the one a reader is most
    // likely to be reporting. Appended for every status, not only the three
    // whose bodies are read: a 500 is exactly when the identifier matters.
    const traceId = problemTraceId(err);
    return traceId ? `${sentence} ${referenceSuffix(traceId)}` : sentence;
  }

  private log(appError: AppError, original: unknown): void {
    const label = `[CDE Error ${appError.type.toUpperCase()}]`;
    if (appError.type === 'http' && appError.status && appError.status < 500) {
      console.warn(label, appError.message, appError.detail);
    } else {
      console.error(label, appError.technical ?? appError.message, original);
    }

    // Send to remote logging (Sentry-compatible via RemoteLoggingService)
    this.logger.log({
      level:   appError.type === 'http' && appError.status && appError.status < 500
                 ? 'warning' : 'error',
      type:    appError.type,
      message: appError.technical ?? appError.message,
      detail:  appError.detail,
      stack:   appError.stack,
      tags:    appError.status ? { http_status: String(appError.status) } : undefined
    });
  }
}
