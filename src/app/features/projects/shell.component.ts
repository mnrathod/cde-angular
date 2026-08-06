import { Component, signal, inject, OnInit, effect } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { ProjectService } from '../../core/services/project.service';
import { DocumentService } from '../../core/services/document.service';
import { Project, Document, DocumentType } from '../../core/models';
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
          <div class="p-3 border-b border-gray-200">
            <span class="text-xs font-semibold uppercase tracking-wider text-gray-400">Projects</span>
          </div>
          <div class="flex-1 overflow-y-auto p-2">
            @for (p of projectService.projects(); track p.id) {
              <div (click)="selectProject(p)"
                class="px-3 py-2 rounded cursor-pointer mb-0.5 transition-all text-sm"
                [class]="selectedProject()?.id === p.id
                  ? 'bg-blue-50 border border-blue-200 text-accent'
                  : 'hover:bg-gray-50 text-gray-700'">
                <div class="font-medium truncate">{{ p.name }}</div>
                <div class="flex items-center gap-1.5 mt-0.5">
                  <span class="text-xs px-1.5 py-0.5 rounded font-semibold"
                    [style]="phaseStyle(p.phase)">{{ p.phase }}</span>
                  <span class="text-xs text-gray-400">{{ p.documentCount || 0 }} docs</span>
                </div>
              </div>
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
                    class="bg-white rounded border border-gray-200 shadow-sm cursor-pointer hover:border-accent hover:-translate-y-0.5 hover:shadow-md transition-all overflow-hidden">
                    <div class="h-24 bg-blue-50 border-b border-gray-200 flex items-center justify-center text-3xl">
                      {{ documentService.getFileIcon(doc) }}
                    </div>
                    <div class="p-2.5">
                      <div class="text-xs font-semibold text-gray-800 truncate">{{ doc.name }}</div>
                      <div class="text-xs text-gray-500 mt-0.5 truncate">
                        {{ doc.drawingNumber || doc.documentType }}{{ doc.revision ? ' · Rev ' + doc.revision : '' }}
                      </div>
                      <div class="flex items-center justify-between mt-1.5">
                        <span class="text-xs px-1.5 py-0.5 rounded font-semibold"
                          [style]="statusStyle(doc.status)">{{ doc.status.replace('_',' ') }}</span>
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
              <input [(ngModel)]="uploadMeta.name" class="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
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
