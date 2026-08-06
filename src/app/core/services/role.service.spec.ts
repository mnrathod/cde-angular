import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { RoleService } from '../../core/services/role.service';
import { AuthService } from '../../core/services/auth.service';

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
    expect(service.can('canUpload')).toBeTrue();
    expect(service.can('canDelete')).toBeTrue();
    expect(service.can('canManageUsers')).toBeTrue();
    expect(service.can('canApprove')).toBeTrue();
  });

  it('VIEWER should have limited permissions', () => {
    mockRole.set('VIEWER');
    expect(service.can('canUpload')).toBeFalse();
    expect(service.can('canDelete')).toBeFalse();
    expect(service.can('canAnnotate')).toBeFalse();
    expect(service.can('canCompare')).toBeTrue();
    expect(service.can('canExportXfdf')).toBeTrue();
  });

  it('isAtLeast() should respect role hierarchy', () => {
    mockRole.set('EDITOR');
    expect(service.isAtLeast('VIEWER')).toBeTrue();
    expect(service.isAtLeast('EDITOR')).toBeTrue();
    expect(service.isAtLeast('PROJECT_MANAGER')).toBeFalse();
    expect(service.isAtLeast('ADMIN')).toBeFalse();
  });

  it('is() should match single role', () => {
    mockRole.set('ADMIN');
    expect(service.is('ADMIN')).toBeTrue();
    expect(service.is('VIEWER')).toBeFalse();
  });

  it('is() should match array of roles', () => {
    mockRole.set('PROJECT_MANAGER');
    expect(service.is(['ADMIN', 'PROJECT_MANAGER'])).toBeTrue();
    expect(service.is(['VIEWER', 'GUEST'])).toBeFalse();
  });

  it('EDITOR should be able to upload but not delete', () => {
    mockRole.set('EDITOR');
    expect(service.can('canUpload')).toBeTrue();
    expect(service.can('canDelete')).toBeFalse();
    expect(service.can('canAnnotate')).toBeTrue();
    expect(service.can('canApprove')).toBeFalse();
  });
});
