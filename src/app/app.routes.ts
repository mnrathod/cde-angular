import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.component').then(m => m.LoginComponent)
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./features/projects/shell.component').then(m => m.ShellComponent),
    children: [
      {
        path: 'projects',
        loadComponent: () => import('./features/projects/project-list.component').then(m => m.ProjectListComponent)
      },
      { path: '', redirectTo: 'projects', pathMatch: 'full' }
    ]
  },
  {
    /*
     * The route a host application frames (ADR 14, docs/viewer-embed-protocol.md).
     *
     * No `authGuard`, deliberately and permanently: the embedded viewer holds
     * no session and authorises nothing, so there is no identity here to
     * guard. Adding one would put a login form inside someone else's iframe,
     * which is both a broken integration and a phishing pattern.
     */
    path: 'embed',
    loadComponent: () => import('./features/embed/embed-viewer.component')
      .then(m => m.EmbedViewerComponent)
  },
  {
    path: 'viewer/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./features/viewer/viewer-shell.component').then(m => m.ViewerShellComponent)
  },
  {
    path: 'viewer3d/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./features/viewer/viewer3d/viewer3d.component').then(m => m.Viewer3dComponent)
  },
  {
    path: 'compare',
    canActivate: [authGuard],
    loadComponent: () => import('./features/compare/compare.component').then(m => m.CompareComponent)
  },
  {
    path: 'visual-compare',
    canActivate: [authGuard],
    loadComponent: () => import('./features/viewer/compare-viewer/visual-compare.component').then(m => m.VisualCompareComponent)
  },
  { path: '**', redirectTo: '' }
];
