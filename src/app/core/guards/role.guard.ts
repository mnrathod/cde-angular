import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot } from '@angular/router';
import { RoleService, UserRole } from '../services/role.service';
import { AuthService } from '../services/auth.service';

/**
 * Usage in routes:
 *   canActivate: [authGuard, roleGuard('EDITOR')]
 *   canActivate: [authGuard, roleGuard(['ADMIN', 'PROJECT_MANAGER'])]
 */
export function roleGuard(requiredRole: UserRole | UserRole[]): CanActivateFn {
  return (route: ActivatedRouteSnapshot) => {
    const auth   = inject(AuthService);
    const role   = inject(RoleService);
    const router = inject(Router);

    if (!auth.isLoggedIn()) {
      router.navigate(['/login']);
      return false;
    }

    const hasAccess = Array.isArray(requiredRole)
      ? role.is(requiredRole)
      : role.isAtLeast(requiredRole);

    if (!hasAccess) {
      router.navigate(['/'], {
        queryParams: { error: 'insufficient_permissions' }
      });
      return false;
    }

    return true;
  };
}

/**
 * Permission-based guard
 *   canActivate: [authGuard, permissionGuard('canUpload')]
 */
export function permissionGuard(permission: string): CanActivateFn {
  return () => {
    const role   = inject(RoleService);
    const router = inject(Router);
    const perm   = permission as any;

    if (!role.can(perm)) {
      router.navigate(['/'], {
        queryParams: { error: 'no_permission' }
      });
      return false;
    }
    return true;
  };
}
