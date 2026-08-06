import { Injectable, ErrorHandler, inject, signal } from '@angular/core';
import { RemoteLoggingService } from '../services/remote-logging.service';
import { HttpErrorResponse } from '@angular/common/http';

export interface AppError {
  id:        string;
  message:   string;
  detail?:   string;
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
@Injectable()
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
                 message: 'A page failed to load. Please refresh.',
                 detail: 'This usually happens after a deployment. Refreshing fixes it.' };
      }
      return { id, timestamp, type: 'runtime', dismissed: false,
               message: err.message || 'An unexpected error occurred',
               stack: err.stack, detail: err.name };
    }

    return { id, timestamp, type: 'unknown', dismissed: false,
             message: 'An unexpected error occurred',
             detail: String(err) };
  }

  private httpMessage(err: HttpErrorResponse): string {
    switch (err.status) {
      case 0:   return 'Cannot connect to server. Check your network connection.';
      case 400: return err.error?.message || 'Invalid request.';
      case 401: return 'Your session has expired. Please sign in again.';
      case 403: return 'You do not have permission to perform this action.';
      case 404: return 'The requested resource was not found.';
      case 409: return err.error?.message || 'A conflict occurred. Please try again.';
      case 413: return 'File is too large to upload.';
      case 422: return err.error?.message || 'Validation failed.';
      case 429: return 'Too many requests. Please slow down.';
      case 500: return 'Server error. Our team has been notified.';
      case 502:
      case 503: return 'Service temporarily unavailable. Please try again shortly.';
      default:  return `Request failed (${err.status}).`;
    }
  }

  private log(appError: AppError, original: unknown): void {
    const label = `[CDE Error ${appError.type.toUpperCase()}]`;
    if (appError.type === 'http' && appError.status && appError.status < 500) {
      console.warn(label, appError.message, appError.detail);
    } else {
      console.error(label, appError.message, original);
    }

    // Send to remote logging (Sentry-compatible via RemoteLoggingService)
    this.logger.log({
      level:   appError.type === 'http' && appError.status && appError.status < 500
                 ? 'warning' : 'error',
      type:    appError.type,
      message: appError.message,
      detail:  appError.detail,
      stack:   appError.stack,
      tags:    appError.status ? { http_status: String(appError.status) } : undefined
    });
  }
}
