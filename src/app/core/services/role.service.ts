import { Injectable, signal, computed, inject } from '@angular/core';
import { AuthService } from './auth.service';

export type UserRole = 'ADMIN' | 'PROJECT_MANAGER' | 'EDITOR' | 'VIEWER' | 'GUEST';

export interface RolePermissions {
  canUpload:       boolean;
  canDelete:       boolean;
  canAnnotate:     boolean;
  canExportXfdf:   boolean;
  canApprove:      boolean;
  canCompare:      boolean;
  canCreateProject: boolean;
  canManageUsers:  boolean;
  canViewAI:       boolean;
}

const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  ADMIN: {
    canUpload: true, canDelete: true, canAnnotate: true,
    canExportXfdf: true, canApprove: true, canCompare: true,
    canCreateProject: true, canManageUsers: true, canViewAI: true
  },
  PROJECT_MANAGER: {
    canUpload: true, canDelete: true, canAnnotate: true,
    canExportXfdf: true, canApprove: true, canCompare: true,
    canCreateProject: true, canManageUsers: false, canViewAI: true
  },
  EDITOR: {
    canUpload: true, canDelete: false, canAnnotate: true,
    canExportXfdf: true, canApprove: false, canCompare: true,
    canCreateProject: false, canManageUsers: false, canViewAI: true
  },
  VIEWER: {
    canUpload: false, canDelete: false, canAnnotate: false,
    canExportXfdf: true, canApprove: false, canCompare: true,
    canCreateProject: false, canManageUsers: false, canViewAI: false
  },
  GUEST: {
    canUpload: false, canDelete: false, canAnnotate: false,
    canExportXfdf: false, canApprove: false, canCompare: false,
    canCreateProject: false, canManageUsers: false, canViewAI: false
  }
};

@Injectable({ providedIn: 'root' })
export class RoleService {
  private auth = inject(AuthService);

  readonly role = computed<UserRole>(() => {
    const r = this.auth.role();
    if (!r) return 'GUEST';
    const upper = r.toUpperCase() as UserRole;
    return ROLE_PERMISSIONS[upper] ? upper : 'VIEWER';
  });

  readonly permissions = computed<RolePermissions>(() =>
    ROLE_PERMISSIONS[this.role()]
  );

  can(permission: keyof RolePermissions): boolean {
    return this.permissions()[permission];
  }

  is(role: UserRole | UserRole[]): boolean {
    const current = this.role();
    return Array.isArray(role) ? role.includes(current) : current === role;
  }

  isAtLeast(minRole: UserRole): boolean {
    const order: UserRole[] = ['GUEST','VIEWER','EDITOR','PROJECT_MANAGER','ADMIN'];
    return order.indexOf(this.role()) >= order.indexOf(minRole);
  }
}
