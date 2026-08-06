import { Injectable, inject, isDevMode } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../services/auth.service';

export interface RemoteLogEvent {
  level:      'error' | 'warning' | 'info';
  message:    string;
  type:       string;
  detail?:    string;
  stack?:     string;
  url:        string;
  userAgent:  string;
  username?:  string;
  timestamp:  string;
  release?:   string;
  tags?:      Record<string, string>;
}

/**
 * RemoteLoggingService
 * Sends error events to a remote logging endpoint.
 *
 * Supports two modes:
 *   1. Internal backend:  POST /api/logs/errors  (default, no config needed)
 *   2. Sentry DSN:        set SENTRY_DSN in environment to use Sentry directly
 *
 * Called automatically by GlobalErrorHandler.
 * Can also be called manually: this.logger.log('error', 'Something happened')
 */
@Injectable({ providedIn: 'root' })
export class RemoteLoggingService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  // Rate limiting: max 10 errors per minute
  private readonly MAX_PER_MIN = 10;
  private sentThisMinute = 0;
  private resetTimer?: ReturnType<typeof setTimeout>;

  /**
   * Log an error event remotely.
   * Silently fails if the endpoint is unavailable — never throws.
   */
  log(event: Omit<RemoteLogEvent, 'url' | 'userAgent' | 'timestamp' | 'username'>): void {
    if (isDevMode()) {
      // In dev, just log to console (don't spam remote endpoint)
      console.debug('[RemoteLog]', event.level.toUpperCase(), event.message);
      return;
    }

    if (!this.checkRateLimit()) return;

    const payload: RemoteLogEvent = {
      ...event,
      url:       window.location.href,
      userAgent: navigator.userAgent,
      username:  this.auth.username() ?? undefined,
      timestamp: new Date().toISOString(),
      release:   this.getAppVersion(),
      tags: {
        platform: 'cde-angular',
        ...event.tags
      }
    };

    // Send to internal backend (always available)
    this.sendToBackend(payload);

    // Optionally also send to Sentry if DSN configured
    const sentryDsn = this.getSentryDsn();
    if (sentryDsn) {
      this.sendToSentry(payload, sentryDsn);
    }
  }

  private sendToBackend(event: RemoteLogEvent): void {
    this.http.post('/api/logs/errors', event, {
      headers: { 'Content-Type': 'application/json' }
    }).subscribe({
      error: () => { /* silently ignore — logging endpoint unavailable */ }
    });
  }

  /**
   * Send to Sentry using their store endpoint.
   * Does NOT require the Sentry SDK — uses the raw HTTP API.
   */
  private sendToSentry(event: RemoteLogEvent, dsn: string): void {
    try {
      const url = new URL(dsn);
      const key  = url.username;
      const host = url.host;
      const proj = url.pathname.replace('/', '');
      const endpoint = `https://${host}/api/${proj}/store/`;

      const sentryEvent = {
        message:   event.message,
        level:     event.level,
        platform:  'javascript',
        timestamp: event.timestamp,
        logger:    'cde.angular',
        release:   event.release,
        user:      event.username ? { username: event.username } : undefined,
        request:   { url: event.url, headers: { 'User-Agent': event.userAgent } },
        tags:      event.tags,
        extra: {
          type:   event.type,
          detail: event.detail,
          stack:  event.stack
        }
      };

      this.http.post(endpoint, sentryEvent, {
        headers: {
          'Content-Type':    'application/json',
          'X-Sentry-Auth':   `Sentry sentry_version=7, sentry_key=${key}`,
        }
      }).subscribe({ error: () => {} });

    } catch { /* invalid DSN — ignore */ }
  }

  private checkRateLimit(): boolean {
    if (this.sentThisMinute >= this.MAX_PER_MIN) return false;
    this.sentThisMinute++;
    if (!this.resetTimer) {
      this.resetTimer = setTimeout(() => {
        this.sentThisMinute = 0;
        this.resetTimer = undefined;
      }, 60_000);
    }
    return true;
  }

  private getAppVersion(): string {
    // Read from environment or meta tag
    const meta = document.querySelector<HTMLMetaElement>('meta[name="app-version"]');
    return meta?.content || '1.0.0';
  }

  private getSentryDsn(): string {
    // Read from meta tag (injected at build time)
    const meta = document.querySelector<HTMLMetaElement>('meta[name="sentry-dsn"]');
    return meta?.content || '';
  }
}
