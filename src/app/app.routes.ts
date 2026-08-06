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
