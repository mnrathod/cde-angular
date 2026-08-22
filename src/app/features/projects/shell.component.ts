import { Component, signal, inject, OnInit, effect } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { ProjectService } from '../../core/services/project.service';
import { DocumentService } from '../../core/services/document.service';
import {
  Project, Document, DocumentType, DocumentStatus, ProjectPhase
} from '../../core/models';
import { SkeletonComponent } from '../../shared/components/skeleton.component';
import { HasPermissionDirective } from '../../shared/directives/has-permission.directive';
import { RoleService } from '../../core/services/role.service';
import { ChunkedUploadService } from '../../core/services/chunked-upload.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, FormsModule, SkeletonComponent],
  template: `
    <div class="flex flex-col h-screen overflow-hidden">

      <!-- ── Top Navigation Bar ─────────────────────────────────── -->
      <header class="flex items-center h-11 px-4 gap-3 flex-shrink-0"
              style="background:var(--nav);box-shadow:0 2px 4px rgba(0,0,0,.15)">
        <div class="flex items-center gap-2">
          <div class="w-7 h-7 bg-white rounded flex items-center justify-center text-accent font-black text-xs">CDE</div>
          <span class="text-white font-bold text-sm tracking-wide">Platform</span>
        </div>
        <div class="flex-1"></div>
        <div class="flex items-center gap-2">
          <div class="w-7 h-7 rounded-full bg-blue-400 flex items-center justify-center text-white font-bold text-xs border-2 border-white/30">
            {{ auth.username()?.charAt(0)?.toUpperCase() }}
          </div>
          <span class="text-white/85 text-xs">{{ auth.username() }}</span>
          <button (click)="auth.logout()"
            class="text-xs px-3 py-1 rounded border border-white/30 bg-white/10 text-white/90 hover:bg-white/20 transition-colors">
            Sign Out
          </button>
        </div>
      </header>

      <!-- ── Body ───────────────────────────────────────────────── -->
      <div class="flex flex-1 overflow-hidden">

        <!-- Sidebar -->
        <aside class="w-52 bg-white border-r border-gray-200 flex flex-col flex-shrink-0 shadow-sm">
          <div class="p-3 border-b border-gray-200 flex items-center justify-between">
            <span class="text-xs font-semibold uppercase tracking-wider text-gray-400">Projects</span>
            @if (roleService.can('canCreateProject')) {
              <button (click)="openProjectDialog()" title="New project"
                class="text-xs px-1.5 py-0.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50">
                + New
              </button>
            }
          </div>
          <div class="flex-1 overflow-y-auto p-2">
            @for (p of projectService.projects(); track p.id) {
              <!-- data-testid, not a styling class: the end-to-end tests used to
                   select this row by a class name that no longer exists, and a
                   selector that matches nothing fails silently rather than
                   loudly. A hook that carries no style survives restyling. -->
              <div (click)="selectProject(p)"
                data-testid="project-item"
                class="group px-3 py-2 rounded cursor-pointer mb-0.5 transition-all text-sm"
                [class]="selectedProject()?.id === p.id
                  ? 'bg-blue-50 border border-blue-200 text-accent'
                  : 'hover:bg-gray-50 text-gray-700'">
                <div class="flex items-center gap-1">
                  <div class="font-medium truncate flex-1">{{ p.name }}</div>
                  @if (roleService.can('canCreateProject')) {
                    <button (click)="openProjectDialog(p); $event.stopPropagation()"
                      title="Edit project"
                      class="opacity-0 group-hover:opacity-100 text-xs text-gray-400 hover:text-accent">✎</button>
                  }
                  @if (roleService.can('canDelete')) {
                    <button (click)="confirmDeleteProject(p); $event.stopPropagation()"
                      title="Delete project"
                      class="opacity-0 group-hover:opacity-100 text-xs text-gray-400 hover:text-red-600">🗑</button>
                  }
                </div>
                <div class="flex items-center gap-1.5 mt-0.5">
                  <span class="text-xs px-1.5 py-0.5 rounded font-semibold"
                    [style]="phaseStyle(p.phase)">{{ p.phase }}</span>
                  <span class="text-xs text-gray-400">{{ p.documentCount || 0 }} docs</span>
                </div>
              </div>
            }
            @if (projectService.projects().length === 0 && !projectService.loading()) {
              <div class="text-xs text-gray-400 text-center py-6">No projects yet.</div>
            }
          </div>
        </aside>

        <!-- Main content -->
        <main class="flex-1 flex flex-col overflow-hidden bg-gray-50">

          <!-- Content header -->
          <div class="flex items-center h-11 px-5 border-b border-gray-200 bg-white flex-shrink-0">
            <h2 class="text-sm font-semibold text-gray-800">
              {{ selectedProject() ? selectedProject()!.name : 'Select a project' }}
            </h2>
            <div class="flex-1"></div>
            @if (selectedProject()) {
              <div class="flex items-center gap-2">
                <button (click)="openCompare()"
                  class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-300 rounded bg-white hover:bg-gray-50 text-gray-600 transition-colors">
                  🔍 Compare
                </button>
                @if (roleService.can('canUpload')) {
                  <button (click)="showUpload.set(true)"
                    class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-accent hover:bg-blue-700 text-white rounded transition-colors">
                    📤 Upload
                  </button>
                }
              </div>
            }
          </div>

          <!-- Document grid -->
          <div class="flex-1 overflow-y-auto p-5">
            @if (!selectedProject()) {
              <div class="flex flex-col items-center justify-center h-full text-gray-400">
                <div class="text-5xl mb-3">📁</div>
                <div class="text-sm">Select a project to see its documents</div>
              </div>
            } @else if (documentService.loading()) {
              <app-skeleton type="card" [count]="6" />
            } @else if (documentService.documents().length === 0) {
              <div class="flex flex-col items-center justify-center h-48 text-gray-400">
                <div class="text-4xl mb-3">📄</div>
                <div class="text-sm">No documents yet. Click Upload to add files.</div>
              </div>
            } @else {
              <div class="grid gap-3" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr))">
                @for (doc of documentService.documents(); track doc.id) {
                  <div (click)="openDocument(doc)"
                    data-testid="document-card"
                    class="group bg-white rounded border border-gray-200 shadow-sm cursor-pointer hover:border-accent hover:-translate-y-0.5 hover:shadow-md transition-all overflow-hidden relative">
                    @if (roleService.can('canDelete')) {
                      <button (click)="confirmDeleteDocument(doc); $event.stopPropagation()"
                        title="Delete document"
                        class="absolute top-1.5 right-1.5 z-10 opacity-0 group-hover:opacity-100
                               w-6 h-6 rounded bg-white/90 border border-gray-200 text-xs
                               text-gray-400 hover:text-red-600 hover:border-red-300 transition-opacity">
                        🗑
                      </button>
                    }
                    <div class="h-24 bg-blue-50 border-b border-gray-200 flex items-center justify-center text-3xl">
                      {{ documentService.getFileIcon(doc) }}
                    </div>
                    <div class="p-2.5">
                      <div class="text-xs font-semibold text-gray-800 truncate">{{ doc.name }}</div>
                      <div class="text-xs text-gray-500 mt-0.5 truncate">
                        {{ doc.drawingNumber || doc.documentType }}{{ doc.revision ? ' · Rev ' + doc.revision : '' }}
                      </div>
                      <div class="flex items-center justify-between mt-1.5 gap-1">
                        @if (roleService.can('canApprove')) {
                          <!-- Editable inline: status changes are routine review
                               actions, not worth a dialog. -->
                          <select [value]="doc.status"
                            (click)="$event.stopPropagation()"
                            (change)="changeStatus(doc, $event)"
                            [disabled]="statusUpdatingId() === doc.id"
                            title="Change status"
                            class="text-xs px-1 py-0.5 rounded font-semibold border-0 cursor-pointer
                                   focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
                            [style]="statusStyle(doc.status)">
                            @for (status of documentStatuses; track status) {
                              <option [value]="status">{{ status.replace('_', ' ') }}</option>
                            }
                          </select>
                        } @else {
                          <span class="text-xs px-1.5 py-0.5 rounded font-semibold"
                            [style]="statusStyle(doc.status)">{{ doc.status.replace('_',' ') }}</span>
                        }
                      </div>
                    </div>
                  </div>
                }
              </div>
            }
          </div>
        </main>
      </div>
    </div>

    <!-- ── Project Create / Edit Modal ──────────────────────────── -->
    @if (showProjectDialog()) {
      <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
        <div class="bg-white rounded-lg shadow-2xl p-7 w-96">
          <h3 class="font-semibold text-gray-800 mb-5">
            {{ editingProject() ? '✎ Edit Project' : '📁 New Project' }}
          </h3>

          <div class="space-y-3 mb-5">
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Project Name *</label>
              <input [(ngModel)]="projectForm.name" name="projectName"
                class="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <textarea [(ngModel)]="projectForm.description" name="projectDescription" rows="2"
                class="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent"></textarea>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Phase</label>
                <select [(ngModel)]="projectForm.phase" name="projectPhase"
                  class="w-full px-2 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent">
                  @for (phase of projectPhases; track phase) {
                    <option [value]="phase">{{ phase }}</option>
                  }
                </select>
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Location</label>
                <input [(ngModel)]="projectForm.location" name="projectLocation" placeholder="Manchester"
                  class="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
              </div>
            </div>
          </div>

          @if (projectError()) {
            <div class="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2 mb-3">
              {{ projectError() }}
            </div>
          }

          <div class="flex gap-2 justify-end">
            <button (click)="closeProjectDialog()"
              class="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50">Cancel</button>
            <button (click)="saveProject()" [disabled]="savingProject()"
              class="px-4 py-2 text-sm bg-accent text-white rounded hover:bg-blue-700 disabled:opacity-50 font-semibold">
              {{ savingProject() ? 'Saving...' : (editingProject() ? 'Save Changes' : 'Create') }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- ── Delete Confirmation ──────────────────────────────────── -->
    @if (pendingDelete(); as target) {
      <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
        <div class="bg-white rounded-lg shadow-2xl p-7 w-96">
          <h3 class="font-semibold text-gray-800 mb-2">Delete {{ target.kind }}?</h3>
          <p class="text-sm text-gray-600 mb-1">
            <span class="font-medium">{{ target.name }}</span> will be permanently deleted.
          </p>
          @if (target.kind === 'project') {
            <p class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-4">
              Documents belonging to this project are deleted with it.
            </p>
          } @else {
            <p class="text-xs text-gray-500 mb-4">This cannot be undone.</p>
          }

          @if (deleteError()) {
            <div class="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2 mb-3">
              {{ deleteError() }}
            </div>
          }

          <div class="flex gap-2 justify-end">
            <button (click)="cancelDelete()"
              class="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50">Cancel</button>
            <button (click)="confirmDelete()" [disabled]="deleting()"
              class="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 font-semibold">
              {{ deleting() ? 'Deleting...' : 'Delete' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- ── Upload Modal ─────────────────────────────────────────── -->
    @if (showUpload()) {
      <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
        <div class="bg-white rounded-lg shadow-2xl p-7 w-96">
          <h3 class="font-semibold text-gray-800 mb-5">📂 Upload Document</h3>

          <!-- Drop zone -->
          <div (click)="fileInput.click()" (dragover)="$event.preventDefault()"
               (drop)="onDrop($event)"
               class="border-2 border-dashed border-gray-300 rounded-md p-6 text-center text-gray-500 text-sm cursor-pointer hover:border-accent hover:bg-blue-50 transition-colors mb-4">
            <div class="text-2xl mb-2">📄</div>
            @if (selectedFile()) {
              <div class="text-accent font-medium">📎 {{ selectedFile()!.name }}</div>
            } @else {
              Click to browse or drag & drop
            }
          </div>
          <input #fileInput type="file" class="hidden"
            accept=".pdf,.dxf,.dwg,.ifc,.glb,.gltf,.obj,.stl,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.svg"
            (change)="onFileSelect($event)" />

          <div class="space-y-3 mb-5">
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Document Name *</label>
              <input [(ngModel)]="uploadMeta.name" data-testid="upload-name"
                class="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Type</label>
                <select [(ngModel)]="uploadMeta.documentType"
                  class="w-full px-2 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent">
                  <option value="BIM_MODEL">BIM Model</option>
                  <option value="DRAWING">Drawing</option>
                  <option value="SPECIFICATION">Specification</option>
                  <option value="REPORT">Report</option>
                  <option value="SCHEDULE">Schedule</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 mb-1">Revision</label>
                <input [(ngModel)]="uploadMeta.revision" placeholder="A"
                  class="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
              </div>
            </div>
          </div>

          <div class="flex gap-2 justify-end">
            <button (click)="closeUpload()"
              class="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50">Cancel</button>
            <button (click)="doUpload()" [disabled]="!selectedFile() || uploading()"
              class="px-4 py-2 text-sm bg-accent text-white rounded hover:bg-blue-700 disabled:opacity-50 font-semibold">
              {{ uploading() ? 'Uploading...' : 'Upload' }}
            </button>
          </div>
        </div>
      </div>
    }
  `
})
export class ShellComponent implements OnInit {
  auth            = inject(AuthService);
  roleService     = inject(RoleService);
  uploadService   = inject(ChunkedUploadService);
  projectService  = inject(ProjectService);
  documentService = inject(DocumentService);
  private router  = inject(Router);

  selectedProject = this.projectService.selected;
  showUpload = signal(false);
  uploading  = signal(false);
  selectedFile = signal<File | null>(null);
  uploadMeta: Partial<Document> = { documentType: 'DRAWING' };

  readonly projectPhases: ProjectPhase[] =
    ['CONCEPT', 'DESIGN', 'CONSTRUCTION', 'HANDOVER', 'OPERATION'];
  readonly documentStatuses: DocumentStatus[] =
    ['DRAFT', 'IN_REVIEW', 'APPROVED', 'SUPERSEDED'];

  // ── Project create / edit ────────────────────────────────────
  showProjectDialog = signal(false);
  /** null while creating, the project being edited otherwise. */
  editingProject = signal<Project | null>(null);
  savingProject  = signal(false);
  projectError   = signal('');
  projectForm: Partial<Project> = {};

  // ── Deletion ─────────────────────────────────────────────────
  pendingDelete = signal<{ kind: 'project' | 'document'; id: number; name: string } | null>(null);
  deleting      = signal(false);
  deleteError   = signal('');

  statusUpdatingId = signal<number | null>(null);

  constructor() {
    // Auto-load docs when project changes
    effect(() => {
      const p = this.selectedProject();
      if (p) this.documentService.loadByProject(p.id).subscribe();
    });
  }

  ngOnInit() {
    this.projectService.load().subscribe();
  }

  selectProject(p: Project) {
    this.projectService.select(p);
  }

  openDocument(doc: Document) {
    if (this.documentService.is3D(doc)) {
      this.router.navigate(['/viewer3d', doc.id]);
    } else {
      this.router.navigate(['/viewer', doc.id]);
    }
  }

  openCompare() {
    this.router.navigate(['/compare']);
  }

  // ── Project create / edit ────────────────────────────────────
  openProjectDialog(project?: Project) {
    this.editingProject.set(project ?? null);
    // Copy rather than bind the live object, so cancelling leaves the
    // sidebar entry untouched.
    this.projectForm = project
      ? { name: project.name, description: project.description,
          phase: project.phase, location: project.location }
      : { phase: 'DESIGN' };
    this.projectError.set('');
    this.showProjectDialog.set(true);
  }

  closeProjectDialog() {
    this.showProjectDialog.set(false);
    this.editingProject.set(null);
    this.projectForm = {};
    this.projectError.set('');
  }

  saveProject() {
    const name = this.projectForm.name?.trim();
    if (!name) { this.projectError.set('Project name is required.'); return; }

    const existing = this.editingProject();
    const payload  = { ...this.projectForm, name };

    this.savingProject.set(true);
    this.projectError.set('');
    const request = existing
      ? this.projectService.update(existing.id, payload)
      : this.projectService.create(payload);

    request.subscribe({
      next: () => { this.savingProject.set(false); this.closeProjectDialog(); },
      error: err => {
        this.savingProject.set(false);
        this.projectError.set(typeof err.error === 'string' && err.error.trim()
          ? err.error
          : `Could not ${existing ? 'update' : 'create'} the project.`);
      }
    });
  }

  // ── Deletion ─────────────────────────────────────────────────
  confirmDeleteProject(project: Project) {
    this.deleteError.set('');
    this.pendingDelete.set({ kind: 'project', id: project.id, name: project.name });
  }

  confirmDeleteDocument(doc: Document) {
    this.deleteError.set('');
    this.pendingDelete.set({ kind: 'document', id: doc.id, name: doc.name });
  }

  cancelDelete() {
    this.pendingDelete.set(null);
    this.deleteError.set('');
  }

  confirmDelete() {
    const target = this.pendingDelete();
    if (!target) return;

    this.deleting.set(true);
    this.deleteError.set('');
    const request = target.kind === 'project'
      ? this.projectService.remove(target.id)
      : this.documentService.delete(target.id);

    request.subscribe({
      next: () => { this.deleting.set(false); this.pendingDelete.set(null); },
      error: () => {
        this.deleting.set(false);
        this.deleteError.set(`Could not delete the ${target.kind}.`);
      }
    });
  }

  // ── Document status ──────────────────────────────────────────
  changeStatus(doc: Document, event: Event) {
    const select = event.target as HTMLSelectElement;
    const status = select.value as DocumentStatus;
    if (status === doc.status) return;

    this.statusUpdatingId.set(doc.id);
    this.documentService.updateStatus(doc.id, status).subscribe({
      next:  () => this.statusUpdatingId.set(null),
      error: () => {
        this.statusUpdatingId.set(null);
        // Put the control back where it was — the document itself did not
        // change, so leaving the select showing the new value would lie.
        select.value = doc.status;
      }
    });
  }

  onFileSelect(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    this.selectedFile.set(f);
    this.uploadMeta.name = f.name.replace(/\.[^.]+$/, '');
  }

  onDrop(e: DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f) { this.selectedFile.set(f); this.uploadMeta.name = f.name.replace(/\.[^.]+$/, ''); }
  }

  closeUpload() {
    this.showUpload.set(false);
    this.selectedFile.set(null);
    this.uploadMeta = { documentType: 'DRAWING' };
  }

  doUpload() {
    const file = this.selectedFile();
    const pid  = this.selectedProject()?.id;
    if (!file || !pid) return;
    this.uploading.set(true);
    const meta: Record<string,string> = {
      name:          this.uploadMeta.name || file.name.replace(/\.[^.]+$/,''),
      documentType:  this.uploadMeta.documentType || 'DRAWING',
      drawingNumber: this.uploadMeta.drawingNumber || '',
      revision:      this.uploadMeta.revision || '',
    };
    this.uploadService.upload(file, pid, meta).subscribe({
      next: () => { this.uploading.set(false); this.closeUpload(); },
      error: () => this.uploading.set(false)
    });
  }

  phaseStyle(phase: string): string {
    const map: Record<string, string> = {
      DESIGN:       'background:#dbeafe;color:#1d4ed8',
      CONSTRUCTION: 'background:#fef3c7;color:#b45309',
      CONCEPT:      'background:#ede9fe;color:#6d28d9',
      HANDOVER:     'background:#dcfce7;color:#15803d',
      OPERATION:    'background:#f1f5f9;color:#475569',
    };
    return map[phase] || 'background:#f1f5f9;color:#475569';
  }

  statusStyle(status: string): string {
    const map: Record<string, string> = {
      DRAFT:      'background:#f1f5f9;color:#64748b',
      IN_REVIEW:  'background:#fef3c7;color:#b45309',
      APPROVED:   'background:#dcfce7;color:#15803d',
      SUPERSEDED: 'background:#fee2e2;color:#b91c1c',
    };
    return map[status] || 'background:#f1f5f9;color:#64748b';
  }
}
