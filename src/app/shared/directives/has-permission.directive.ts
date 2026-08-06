import {
  Directive, Input, TemplateRef, ViewContainerRef,
  inject, effect, OnInit
} from '@angular/core';
import { RoleService, RolePermissions, UserRole } from '../../core/services/role.service';

/**
 * Usage:
 *   <button *hasPermission="'canUpload'">Upload</button>
 *   <div *hasRole="'ADMIN'">Admin only</div>
 *   <div *hasRole="['ADMIN', 'PROJECT_MANAGER']">PMs and Admins</div>
 */
@Directive({
  selector: '[hasPermission]',
  standalone: true
})
export class HasPermissionDirective implements OnInit {
  @Input({ required: true }) hasPermission!: keyof RolePermissions;

  private tpl  = inject(TemplateRef<any>);
  private vcr  = inject(ViewContainerRef);
  private role = inject(RoleService);

  ngOnInit() {
    effect(() => {
      this.vcr.clear();
      if (this.role.can(this.hasPermission)) {
        this.vcr.createEmbeddedView(this.tpl);
      }
    }, { allowSignalWrites: true });
  }
}

@Directive({
  selector: '[hasRole]',
  standalone: true
})
export class HasRoleDirective implements OnInit {
  @Input({ required: true }) hasRole!: UserRole | UserRole[];

  private tpl  = inject(TemplateRef<any>);
  private vcr  = inject(ViewContainerRef);
  private role = inject(RoleService);

  ngOnInit() {
    effect(() => {
      this.vcr.clear();
      if (this.role.is(this.hasRole)) {
        this.vcr.createEmbeddedView(this.tpl);
      }
    }, { allowSignalWrites: true });
  }
}

@Directive({
  selector: '[hasMinRole]',
  standalone: true
})
export class HasMinRoleDirective implements OnInit {
  @Input({ required: true }) hasMinRole!: UserRole;

  private tpl  = inject(TemplateRef<any>);
  private vcr  = inject(ViewContainerRef);
  private role = inject(RoleService);

  ngOnInit() {
    effect(() => {
      this.vcr.clear();
      if (this.role.isAtLeast(this.hasMinRole)) {
        this.vcr.createEmbeddedView(this.tpl);
      }
    }, { allowSignalWrites: true });
  }
}
