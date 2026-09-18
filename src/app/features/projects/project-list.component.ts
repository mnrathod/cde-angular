/**
 * The sidebar list of projects.
 *
 * <p>Presentation only: it reads the project service and raises what the user
 * asked for. Deciding what "edit" or "delete" opens belongs to the shell,
 * which owns the dialogs.
 */
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  output,
} from "@angular/core";

import { Project } from "../../core/models";
import { ProjectService } from "../../core/services/project.service";
import { RoleService } from "../../core/services/role.service";
import { phaseChipStyle, phaseLabel } from "./project-vocabulary";

@Component({
  selector: "app-project-list",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <aside
      class="w-52 bg-white border-e border-gray-200 flex flex-col flex-shrink-0 shadow-sm"
    >
      <div class="p-3 border-b border-gray-200 flex items-center justify-between">
        <h2
          i18n="Heading of the project list in the sidebar@@shell.projectsHeading"
          class="text-xs font-semibold uppercase tracking-wider text-gray-400"
        >
          Projects
        </h2>
        @if (roles.can("canCreateProject")) {
          <button
            (click)="createRequested.emit()"
            i18n-title="@@shell.newProjectHint"
            title="New project"
            class="text-xs px-1.5 py-0.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
          >
            <span aria-hidden="true">+</span>
            <ng-container
              i18n="Creates a project. Very short — it shares a narrow row with the heading.@@shell.newProject"
              >New</ng-container
            >
          </button>
        }
      </div>
      <div class="flex-1 overflow-y-auto p-2">
        @for (project of projects.projects(); track project.id) {
          <!-- data-testid, not a styling class: the end-to-end tests used to
               select this row by a class name that no longer exists, and a
               selector that matches nothing fails silently rather than
               loudly. A hook that carries no style survives restyling. -->
          <!-- The row keeps its click for pointer convenience, but the
               keyboard path goes through the name button below. The row
               cannot itself be a button because it contains one, and a button
               inside a button is invalid HTML that browsers recover from in
               different ways. -->
          <div
            (click)="projects.select(project)"
            data-testid="project-item"
            class="group px-3 py-2 rounded cursor-pointer mb-0.5 transition-all text-sm"
            [class]="
              projects.selected()?.id === project.id
                ? 'bg-blue-50 border border-blue-200 text-accent'
                : 'hover:bg-gray-50 text-gray-700'
            "
          >
            <div class="flex items-center gap-1">
              <button
                type="button"
                (click)="projects.select(project); $event.stopPropagation()"
                class="font-medium truncate flex-1 text-start bg-transparent border-0 p-0 cursor-pointer"
                [attr.aria-current]="
                  projects.selected()?.id === project.id ? 'true' : null
                "
              >
                {{ project.name }}
              </button>
              @if (roles.can("canCreateProject")) {
                <button
                  (click)="editRequested.emit(project); $event.stopPropagation()"
                  i18n-title="@@shell.editProjectHint"
                  title="Edit project"
                  class="opacity-0 group-hover:opacity-100 focus:opacity-100 text-xs text-gray-400 hover:text-accent"
                >
                  ✎
                </button>
              }
              @if (roles.can("canDelete")) {
                <button
                  (click)="
                    deleteRequested.emit(project); $event.stopPropagation()
                  "
                  i18n-title="@@shell.deleteProjectHint"
                  title="Delete project"
                  class="opacity-0 group-hover:opacity-100 focus:opacity-100 text-xs text-gray-400 hover:text-red-600"
                >
                  🗑
                </button>
              }
            </div>
            <div class="flex items-center gap-1.5 mt-0.5">
              <span
                class="text-xs px-1.5 py-0.5 rounded font-semibold"
                [style]="chipStyleFor(project.phase)"
                >{{ labelFor(project.phase) }}</span
              >
              <span
                i18n="How many documents a project holds. Very short — it sits under the project name.@@shell.documentCount"
                class="text-xs text-gray-400"
                >{project.documentCount || 0, plural, =1 {1 doc} other {{{
                  project.documentCount || 0
                }} docs}}</span
              >
            </div>
          </div>
        }
        @if (projects.projects().length === 0 && !projects.loading()) {
          <p
            i18n="Empty state for the project list@@shell.noProjects"
            class="text-xs text-gray-400 text-center py-6"
          >
            No projects yet.
          </p>
        }
      </div>
    </aside>
  `,
})
export class ProjectListComponent {
  createRequested = output<void>();
  editRequested = output<Project>();
  deleteRequested = output<Project>();

  projects = inject(ProjectService);
  roles = inject(RoleService);

  labelFor = phaseLabel;
  chipStyleFor = phaseChipStyle;
}
