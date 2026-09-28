import { Injectable, computed, inject } from '@angular/core';
import { AuthService } from './auth.service';

/**
 * The roles this platform actually has.
 *
 * <p>Four, matching the server's own. The list here used to be
 * `ADMIN | PROJECT_MANAGER | EDITOR | VIEWER | GUEST`, three of which have
 * never existed, while ENGINEER and REVIEWER — which do, and which between
 * them do nearly all the work — were absent. Both fell through a fallback to
 * VIEWER.
 */
export type UserRole = 'ADMIN' | 'ENGINEER' | 'REVIEWER' | 'VIEWER';

/**
 * What a control needs before it is worth rendering.
 *
 * <p>The values are the server's permission names, so a question asked here
 * is the same question the server will answer when the request arrives. The
 * previous version asked different questions entirely — `canApprove`,
 * `canCreateProject` — resolved against a table maintained in this file, and
 * the two had drifted far enough apart to hide the primary workflow from the
 * people who perform it.
 */
export const Permission = {
  ReadDocument:   'document:read',
  WriteDocument:  'document:write',
  ProcessDocument: 'document:process',
  ReadMarkup:     'annotation:read',
  WriteMarkup:    'annotation:write',
  ReadProject:    'project:read',
  WriteProject:   'project:write',
  ReadSignature:  'signature:read',
  WriteSignature: 'signature:write',
  PublishContainer: 'container:publish',
  ManageUsers:    'tenant.user:manage',
} as const;

export type PermissionName = (typeof Permission)[keyof typeof Permission];

/**
 * Whether the signed-in account may do a given thing.
 *
 * <p>Answers from the permission list the server sends with the session, not
 * from a mapping kept here. That is the whole point of the rewrite: a second
 * copy of an authorisation rule is a copy that can disagree with the first,
 * and this one did — an ENGINEER was shown the interface of a VIEWER, with
 * upload, delete and project creation removed, because the table in this file
 * had never heard of the role.
 *
 * <p>This is presentation only, and §5.5 is explicit that it must be: every
 * permission is re-checked server-side on every request. Hiding a control the
 * caller cannot use is §1.1's rule about not offering what will be refused —
 * it is not what stops them.
 */
@Injectable({ providedIn: 'root' })
export class RoleService {
  private auth = inject(AuthService);

  /**
   * The role, for the places that display it.
   *
   * <p>Unrecognised values are passed through rather than coerced. The old
   * fallback to VIEWER is exactly how ENGINEER came to be shown a read-only
   * interface: a role this file did not know silently became the least
   * privileged one, and nothing said so.
   */
  readonly role = computed<UserRole | null>(() => {
    const named = this.auth.role();
    return named ? (named.toUpperCase() as UserRole) : null;
  });

  readonly permissions = computed(() => this.auth.permissions());

  /** Whether the account holds a permission. */
  can(permission: PermissionName): boolean {
    return this.permissions().has(permission);
  }

  /** Whether the account holds every one of these permissions. */
  canAll(...permissions: PermissionName[]): boolean {
    return permissions.every((each) => this.can(each));
  }

  is(role: UserRole | UserRole[]): boolean {
    const current = this.role();
    if (current === null) return false;
    return Array.isArray(role) ? role.includes(current) : current === role;
  }
}
