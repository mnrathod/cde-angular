/**
 * The project workspace: a list of projects beside the documents in the one
 * that is selected.
 *
 * <p>This component is the layout and the routing between its parts. The
 * sidebar, the grid and each of the three dialogs own their own behaviour;
 * what is left here is which dialog is open and what the user is taken to
 * when they open a document.
 */
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  effect,
  inject,
  signal,
} from "@angular/core";
import { Router } from "@angular/router";

import { Document, Project } from "../../core/models";
import { DocumentService } from "../../core/services/document.service";
import { ProjectService } from "../../core/services/project.service";
import { RoleService } from "../../core/services/role.service";
import {
  DeleteConfirmationComponent,
  DeletionTarget,
} from "./delete-confirmation.component";
import { DocumentGridComponent } from "./document-grid.component";
import { DocumentUploadDialogComponent } from "./document-upload-dialog.component";
import { ProjectDialogComponent } from "./project-dialog.component";
import { ProjectListComponent } from "./project-list.component";
import { WorkspaceHeaderComponent } from "./workspace-header.component";

/** Which dialog is open, if any. Only one can be at a time. */
type OpenDialog =
  | { kind: "none" }
  | { kind: "project"; editing: Project | null }
  | { kind: "upload" }
  | { kind: "delete"; target: DeletionTarget };

@Component({
  selector: "app-shell",
  standalone: true,
  imports: [
    WorkspaceHeaderComponent,
    ProjectListComponent,
    DocumentGridComponent,
    ProjectDialogComponent,
    DocumentUploadDialogComponent,
    DeleteConfirmationComponent,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="flex flex-col h-screen overflow-hidden">
      <app-workspace-header />

      <div class="flex flex-1 overflow-hidden">
        <app-project-list
          (createRequested)="openProjectDialog(null)"
          (editRequested)="openProjectDialog($event)"
          (deleteRequested)="confirmDeleteProject($event)"
        />

        <main class="flex-1 flex flex-col overflow-hidden bg-gray-50">
          <div
            class="flex items-center h-11 px-5 border-b border-gray-200 bg-white flex-shrink-0"
          >
            <h1 class="text-sm font-semibold text-gray-800">
              {{ projects.selected()?.name ?? noProjectChosenLabel }}
            </h1>
            <div class="flex-1"></div>
            @if (projects.selected()) {
              <div class="flex items-center gap-2">
                <button
                  (click)="openCompare()"
                  class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 rounded bg-white hover:bg-gray-50 text-gray-600 transition-colors"
                >
                  <span aria-hidden="true">🔍</span>
                  <ng-container
                    i18n="Opens the document comparison page@@shell.compare"
                    >Compare</ng-container
                  >
                </button>
                @if (roles.can("canUpload")) {
                  <button
                    (click)="dialog.set({ kind: 'upload' })"
                    class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-accent hover:bg-blue-700 text-white rounded transition-colors"
                  >
                    <span aria-hidden="true">📤</span>
                    <ng-container i18n="Opens the upload dialog@@shell.upload"
                      >Upload</ng-container
                    >
                  </button>
                }
              </div>
            }
          </div>

          <app-document-grid
            (openRequested)="openDocument($event)"
            (deleteRequested)="confirmDeleteDocument($event)"
          />
        </main>
      </div>
    </div>

    @if (dialog(); as open) {
      @switch (open.kind) {
        @case ("project") {
          <app-project-dialog
            [editing]="open.editing"
            (closed)="closeDialog()"
          />
        }
        @case ("upload") {
          <app-document-upload-dialog
            [projectId]="projects.selected()!.id"
            (closed)="closeDialog()"
          />
        }
        @case ("delete") {
          <app-delete-confirmation
            [target]="open.target"
            (closed)="closeDialog()"
          />
        }
      }
    }
  `,
})
export class ShellComponent implements OnInit {
  roles = inject(RoleService);
  projects = inject(ProjectService);

  private documents = inject(DocumentService);
  private router = inject(Router);

  dialog = signal<OpenDialog>({ kind: "none" });

  readonly noProjectChosenLabel = $localize`:Stands in for the project name before one is chosen@@shell.selectProject:Select a project`;

  constructor() {
    effect(() => {
      const project = this.projects.selected();
      if (project) this.documents.loadByProject(project.id).subscribe();
    });
  }

  ngOnInit(): void {
    this.projects.load().subscribe();
  }

  openProjectDialog(project: Project | null): void {
    this.dialog.set({ kind: "project", editing: project });
  }

  confirmDeleteProject(project: Project): void {
    this.dialog.set({
      kind: "delete",
      target: { kind: "project", id: project.id, name: project.name },
    });
  }

  confirmDeleteDocument(doc: Document): void {
    this.dialog.set({
      kind: "delete",
      target: { kind: "document", id: doc.id, name: doc.name },
    });
  }

  closeDialog(): void {
    this.dialog.set({ kind: "none" });
  }

  openDocument(doc: Document): void {
    const route = this.documents.is3D(doc) ? "/viewer3d" : "/viewer";
    this.router.navigate([route, doc.id]);
  }

  openCompare(): void {
    this.router.navigate(["/compare"]);
  }
}
