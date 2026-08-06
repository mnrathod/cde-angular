import { Injectable, signal, computed } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, tap } from 'rxjs';

export interface Page<T> {
  content:       T[];
  totalElements: number;
  totalPages:    number;
  number:        number;     // 0-based page number
  size:          number;
  first:         boolean;
  last:          boolean;
  nextCursor?:   string;     // for cursor-based pagination
}

export interface PaginationState<T> {
  items:       T[];
  loading:     boolean;
  page:        number;
  pageSize:    number;
  total:       number;
  totalPages:  number;
  hasMore:     boolean;
  cursor:      string | null;
}

/**
 * PaginatedResource<T>
 * Wraps an API endpoint with pagination state as signals.
 *
 * Usage:
 *   const docs = new PaginatedResource<Document>('/api/documents/project/1');
 *   docs.load();   // first page
 *   docs.next();   // next page
 *   docs.items()   // signal with current items
 */
export class PaginatedResource<T> {
  private http!: HttpClient;

  readonly loading    = signal(false);
  readonly items      = signal<T[]>([]);
  readonly total      = signal(0);
  readonly page       = signal(0);
  readonly pageSize   = signal(20);
  readonly hasMore    = computed(() => this.items().length < this.total());
  readonly cursor     = signal<string | null>(null);
  readonly error      = signal<string | null>(null);

  constructor(
    private url:    string,
    private params: Record<string, string> = {},
    http?: HttpClient
  ) {
    if (http) this.http = http;
  }

  init(http: HttpClient) { this.http = http; return this; }

  load(reset = true): Observable<Page<T>> {
    if (reset) {
      this.page.set(0);
      this.cursor.set(null);
      this.items.set([]);
    }
    return this.fetch();
  }

  next(): Observable<Page<T>> {
    if (!this.hasMore()) return new Observable();
    this.page.update(p => p + 1);
    return this.fetch(true);
  }

  refresh(): Observable<Page<T>> {
    return this.load(true);
  }

  private fetch(append = false): Observable<Page<T>> {
    this.loading.set(true);
    this.error.set(null);

    let p = new HttpParams()
      .set('page',   String(this.page()))
      .set('size',   String(this.pageSize()))
      .set('sort',   'createdAt,desc');

    if (this.cursor()) p = p.set('cursor', this.cursor()!);
    Object.entries(this.params).forEach(([k, v]) => p = p.set(k, v));

    return this.http.get<Page<T>>(this.url, { params: p }).pipe(
      tap({
        next: page => {
          this.total.set(page.totalElements ?? page.content.length);
          this.items.update(prev => append ? [...prev, ...page.content] : page.content);
          if (page.nextCursor) this.cursor.set(page.nextCursor);
          this.loading.set(false);
        },
        error: err => {
          this.error.set(err.message);
          this.loading.set(false);
        }
      })
    );
  }
}
