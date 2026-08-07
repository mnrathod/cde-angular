import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { RoleService } from './role.service';
import { AuthService } from './auth.service';

describe('RoleService', () => {
  let service: RoleService;
  let mockRole = signal<string | null>(null);

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        RoleService,
        {
          provide: AuthService,
          useValue: { role: mockRole, isLoggedIn: signal(true) }
        }
      ]
    });
    service = TestBed.inject(RoleService);
  });

  it('should return GUEST when no role set', () => {
    mockRole.set(null);
    expect(service.role()).toBe('GUEST');
  });

  it('ADMIN should have all permissions', () => {
    mockRole.set('ADMIN');
    expect(service.can('canUpload')).toBe(true);
    expect(service.can('canDelete')).toBe(true);
    expect(service.can('canManageUsers')).toBe(true);
    expect(service.can('canApprove')).toBe(true);
  });

  it('VIEWER should have limited permissions', () => {
    mockRole.set('VIEWER');
    expect(service.can('canUpload')).toBe(false);
    expect(service.can('canDelete')).toBe(false);
    expect(service.can('canAnnotate')).toBe(false);
    expect(service.can('canCompare')).toBe(true);
    expect(service.can('canExportXfdf')).toBe(true);
  });

  it('isAtLeast() should respect role hierarchy', () => {
    mockRole.set('EDITOR');
    expect(service.isAtLeast('VIEWER')).toBe(true);
    expect(service.isAtLeast('EDITOR')).toBe(true);
    expect(service.isAtLeast('PROJECT_MANAGER')).toBe(false);
    expect(service.isAtLeast('ADMIN')).toBe(false);
  });

  it('is() should match single role', () => {
    mockRole.set('ADMIN');
    expect(service.is('ADMIN')).toBe(true);
    expect(service.is('VIEWER')).toBe(false);
  });

  it('is() should match array of roles', () => {
    mockRole.set('PROJECT_MANAGER');
    expect(service.is(['ADMIN', 'PROJECT_MANAGER'])).toBe(true);
    expect(service.is(['VIEWER', 'GUEST'])).toBe(false);
  });

  it('EDITOR should be able to upload but not delete', () => {
    mockRole.set('EDITOR');
    expect(service.can('canUpload')).toBe(true);
    expect(service.can('canDelete')).toBe(false);
    expect(service.can('canAnnotate')).toBe(true);
    expect(service.can('canApprove')).toBe(false);
  });
});
