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
}
