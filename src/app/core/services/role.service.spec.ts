import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, it, expect, beforeEach } from 'vitest';

import { Permission, RoleService } from './role.service';
import { AuthService } from './auth.service';

/**
 * Which controls this account should be offered.
 *
 * <p>This file used to pass while the thing it covered was broken, and how it
 * managed that is worth recording. It asserted the behaviour of roles named
 * EDITOR, PROJECT_MANAGER and GUEST — none of which this platform has ever
 * had — against a role-to-permission table kept in the service itself. So it
 * checked a table against itself, using names only the table knew, and never
 * once asked what happens to ENGINEER or REVIEWER, which are two of the four
 * roles that actually exist.
 *
 * <p>Both fell through a fallback to VIEWER. An engineer signing in was shown
 * an interface with upload, delete and project creation removed — the primary
 * workflow, hidden from the role that performs it — and every test here was
 * green.
 *
 * <p>The service now answers from the permission list the server sends with
 * the session, so these cases are written in terms of that list. The point is
 * no longer "does the table say what the table says": it is that a control is
 * offered exactly when the request behind it would be allowed.
 */
describe('deciding which controls to offer', () => {
  let roles: RoleService;
  const role = signal<string | null>(null);
  const permissions = signal<ReadonlySet<string>>(new Set());

  /** Signs in as an account the server described this way. */
  function signedInAs(named: string, granted: string[]) {
    role.set(named);
    permissions.set(new Set(granted));
  }

  beforeEach(() => {
    role.set(null);
    permissions.set(new Set());
    TestBed.configureTestingModule({
      providers: [
        RoleService,
        { provide: AuthService, useValue: { role, permissions, isLoggedIn: signal(true) } },
      ],
    });
    roles = TestBed.inject(RoleService);
  });

  describe('an engineer', () => {
    // The role the old table did not know. Every case here is a control that
    // was hidden from them.
    const ENGINEER = [
      'document:read', 'document:write', 'document:process',
      'annotation:read', 'annotation:write',
      'project:read', 'project:write',
      'signature:read', 'signature:write', 'container:read', 'container:write',
    ];

    beforeEach(() => signedInAs('ENGINEER', ENGINEER));

    it('is offered the upload control', () => {
      expect(roles.can(Permission.WriteDocument)).toBe(true);
    });

    it('is offered project creation', () => {
      expect(roles.can(Permission.WriteProject)).toBe(true);
    });

    it('is offered the markup tools', () => {
      expect(roles.can(Permission.WriteMarkup)).toBe(true);
    });

    it('is recognised as the role it is, not coerced to a lesser one', () => {
      // The coercion is what caused the defect: an unknown role silently
      // became VIEWER, and nothing anywhere said so.
      expect(roles.role()).toBe('ENGINEER');
    });

    it('is not offered user management', () => {
      // The other half. A role granted everything would satisfy every case
      // above while telling us nothing.
      expect(roles.can(Permission.ManageUsers)).toBe(false);
    });

    it('is not offered publication, which is the reviewer’s act', () => {
      expect(roles.can(Permission.PublishContainer)).toBe(false);
    });
  });

  describe('a reviewer', () => {
    const REVIEWER = [
      'document:read', 'annotation:read', 'annotation:write',
      'project:read', 'signature:read', 'signature:write',
      'container:read', 'container:publish',
    ];

    beforeEach(() => signedInAs('REVIEWER', REVIEWER));

    it('is offered the markup tools, which is how a review is conducted', () => {
      // Hidden from them before: the table's fallback gave VIEWER, whose
      // annotate permission was false — so the one role whose entire job is
      // commenting on drawings was shown no way to comment.
      expect(roles.can(Permission.WriteMarkup)).toBe(true);
    });

    it('is offered publication', () => {
      expect(roles.can(Permission.PublishContainer)).toBe(true);
    });

    it('is not offered the upload control', () => {
      expect(roles.can(Permission.WriteDocument)).toBe(false);
    });

    it('is not offered the operations that rewrite a file', () => {
      expect(roles.can(Permission.ProcessDocument)).toBe(false);
    });

    it('is recognised as the role it is', () => {
      expect(roles.role()).toBe('REVIEWER');
    });
  });

  describe('a viewer', () => {
    beforeEach(() => signedInAs('VIEWER', [
      'document:read', 'annotation:read', 'project:read',
      'signature:read', 'container:read',
    ]));

    it('is offered no upload control', () => {
      expect(roles.can(Permission.WriteDocument)).toBe(false);
    });

    it('is offered no markup tools', () => {
      expect(roles.can(Permission.WriteMarkup)).toBe(false);
    });

    it('is offered no project creation', () => {
      expect(roles.can(Permission.WriteProject)).toBe(false);
    });

    it('can still read a document', () => {
      expect(roles.can(Permission.ReadDocument)).toBe(true);
    });
  });

  describe('an administrator', () => {
    beforeEach(() => signedInAs('ADMIN', [
      'document:read', 'document:write', 'document:process',
      'annotation:read', 'annotation:write', 'project:read', 'project:write',
      'signature:read', 'signature:write', 'tenant.user:manage',
      'container:read', 'container:write', 'container:publish',
    ]));

    it('is offered user management', () => {
      expect(roles.can(Permission.ManageUsers)).toBe(true);
    });

    it('is offered everything the document surface has', () => {
      expect(roles.canAll(
        Permission.WriteDocument, Permission.ProcessDocument,
        Permission.WriteMarkup, Permission.WriteProject)).toBe(true);
    });
  });

  describe('nobody signed in', () => {
    it('is offered nothing', () => {
      expect(roles.can(Permission.ReadDocument)).toBe(false);
      expect(roles.can(Permission.WriteDocument)).toBe(false);
    });

    it('has no role rather than a made-up one', () => {
      // It used to report GUEST, a role the server has never heard of.
      expect(roles.role()).toBeNull();
    });

    it('matches no role when asked', () => {
      expect(roles.is('VIEWER')).toBe(false);
      expect(roles.is(['ADMIN', 'ENGINEER'])).toBe(false);
    });
  });

  describe('a session the server described with no permissions', () => {
    it('offers nothing, rather than guessing from the role name', () => {
      // A role name arriving without its permissions is a server this client
      // does not fully understand. Offering controls on the strength of the
      // name is precisely the guessing that caused the original defect.
      signedInAs('ENGINEER', []);

      expect(roles.can(Permission.WriteDocument)).toBe(false);
    });
  });

  describe('asking which role it is', () => {
    it('matches the role it was given', () => {
      signedInAs('ENGINEER', []);
      expect(roles.is('ENGINEER')).toBe(true);
    });

    it('matches any of several', () => {
      signedInAs('REVIEWER', []);
      expect(roles.is(['ADMIN', 'REVIEWER'])).toBe(true);
    });

    it('reads a role however the server cased it', () => {
      signedInAs('engineer', []);
      expect(roles.is('ENGINEER')).toBe(true);
    });
  });
});
