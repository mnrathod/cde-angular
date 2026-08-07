import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs/operators';
import { Project } from '../models';

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private http = inject(HttpClient);

  readonly projects     = signal<Project[]>([]);
  readonly selected     = signal<Project | null>(null);
  readonly loading      = signal(false);

  load() {
    this.loading.set(true);
    return this.http.get<Project[]>('/api/projects').pipe(
      tap(list => {
        this.projects.set(list);
        this.loading.set(false);
      })
    );
  }

  select(project: Project) {
    this.selected.set(project);
  }

  create(data: Partial<Project>) {
    return this.http.post<Project>('/api/projects', data).pipe(
      tap(p => this.projects.update(list => [...list, p]))
    );
  }

  update(id: number, data: Partial<Project>) {
    return this.http.put<Project>(`/api/projects/${id}`, data).pipe(
      tap(updated => {
        this.projects.update(list => list.map(p => p.id === id ? updated : p));
        // Keep the selection pointing at the refreshed object, otherwise the
        // detail pane keeps rendering the pre-edit copy.
        if (this.selected()?.id === id) this.selected.set(updated);
      })
    );
  }

  remove(id: number) {
    return this.http.delete<void>(`/api/projects/${id}`).pipe(
      tap(() => {
        this.projects.update(list => list.filter(p => p.id !== id));
        if (this.selected()?.id === id) this.selected.set(null);
      })
    );
  }
}
