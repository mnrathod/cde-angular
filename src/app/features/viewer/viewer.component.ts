import { Component, signal, inject, OnInit, OnDestroy, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ViewerService } from '../../core/services/viewer.service';
import { ViewerData } from '../../core/models';

declare const pdfjsLib: any;

@Component({
  selector: 'app-viewer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="fixed inset-0 flex flex-col" style="background:#0a0c14;z-index:500">

      <!-- Top bar (Asite navy) -->
      <div class="flex items-center h-11 px-3 gap-2 flex-shrink-0 text-white"
           style="background:var(--nav);box-shadow:0 2px 4px rgba(0,0,0,.15)">
        <button (click)="goBack()"
          class="text-xs px-3 py-1 rounded border border-white/30 bg-white/10 hover:bg-white/20 transition-colors">
          ← Back
        </button>
        <span class="text-sm font-semibold flex-1 truncate">{{ viewerData()?.name || 'Loading...' }}</span>
        <button (click)="exportXfdf()"
          class="text-xs px-3 py-1 rounded border border-white/30 bg-white/10 hover:bg-white/20">
          📤 XFDF
        </button>
      </div>

      <!-- Markup toolbar -->
      <div class="flex items-center px-3 py-1 gap-1 flex-shrink-0 flex-wrap border-b"
           style="background:#f8fafc;border-color:var(--border)">
        @for (t of tools; track t.id) {
          <button (click)="setTool(t.id)"
            class="h-7 px-2.5 text-xs rounded border transition-all flex items-center gap-1"
            [class]="activeTool() === t.id
              ? 'bg-accent text-white border-accent shadow-sm'
              : 'bg-white text-gray-600 border-gray-300 hover:bg-blue-50 hover:text-accent hover:border-blue-300'">
            {{ t.icon }} {{ t.label }}
          </button>
        }
        <div class="w-px h-4 bg-gray-300 mx-0.5"></div>
        <button (click)="undoMarkup()" class="h-7 px-2.5 text-xs rounded border bg-white border-gray-300 hover:bg-gray-50">↩</button>
        <button (click)="clearMarkup()" class="h-7 px-2.5 text-xs rounded border bg-white border-gray-300 hover:bg-gray-50">🗑</button>
        <button (click)="saveMarkup()" class="h-7 px-2.5 text-xs rounded border bg-white border-gray-300 hover:bg-gray-50">💾 Save</button>
        <input type="color" [(ngModel)]="markupColor" title="Color"
          class="h-7 w-8 rounded border border-gray-300 cursor-pointer p-0.5" />
      </div>

      <!-- Viewer canvas area + sidebar -->
      <div class="flex flex-1 overflow-hidden">

        <!-- Main canvas -->
        <div #viewerContainer class="flex-1 overflow-auto relative flex items-start justify-center p-4"
             style="background:#0a0c14">

          @if (loading()) {
            <div class="absolute inset-0 flex items-center justify-center text-white/60">
              <div class="text-center">
                <div class="text-3xl mb-3 animate-pulse">⏳</div>
                <div class="text-sm">Loading document...</div>
              </div>
            </div>
          }

          @if (errorMsg()) {
            <div class="max-w-md mx-auto mt-16 p-6 bg-red-900/30 rounded-lg border border-red-500/30 text-red-300 text-sm">
              ⚠️ {{ errorMsg() }}
            </div>
          }

          <!-- SVG viewer -->
          @if (viewerData()?.type === 'svg' && viewerData()?.content) {
            <div #svgContainer class="relative" style="transform-origin:top left"
                 [innerHTML]="viewerData()!.content!"></div>
          }

          <!-- PDF canvas container -->
          <div #pdfContainer id="pdf-container" class="space-y-1"></div>

          <!-- Image viewer -->
          @if (viewerData()?.type === 'image') {
            <img [src]="imageUrl()" class="max-w-full" alt="document" />
          }

          <!-- SVG markup overlay -->
          <svg #markupOverlay id="mk-overlay"
            class="absolute top-0 left-0 pointer-events-none"
            style="width:100%;height:100%">
          </svg>
        </div>

        <!-- Annotation sidebar -->
        <div class="w-64 bg-white border-l border-gray-200 flex flex-col flex-shrink-0">
          <div class="p-3 border-b border-gray-200 font-semibold text-sm text-gray-700">
            Annotations ({{ annotations().length }})
          </div>
          <div class="flex-1 overflow-y-auto p-2 space-y-2">
            @for (ann of annotations(); track ann.id) {
              <div class="bg-gray-50 rounded border-l-3 border-accent p-2 text-xs"
                   style="border-left-width:3px;border-left-color:var(--accent)">
                <div class="font-medium text-gray-700">{{ ann.authorName }}</div>
                <div class="text-gray-500 mt-0.5">{{ ann.comment }}</div>
                <div class="text-gray-400 mt-1">{{ ann.createdAt | date:'short' }}</div>
              </div>
            } @empty {
              <div class="text-center text-gray-400 text-xs py-8">
                No annotations yet.<br>Use the toolbar to add markup.
              </div>
            }
          </div>
        </div>
      </div>
    </div>
  `
})
export class ViewerComponent implements OnInit {
  @ViewChild('viewerContainer') container!: ElementRef;
  @ViewChild('pdfContainer')    pdfEl!: ElementRef;
  @ViewChild('markupOverlay')   overlay!: ElementRef;

  private route   = inject(ActivatedRoute);
  private router  = inject(Router);
  private service = inject(ViewerService);

  viewerData  = signal<ViewerData | null>(null);
  loading     = signal(true);
  errorMsg    = signal('');
  annotations = signal<any[]>([]);
  imageUrl    = signal('');
  activeTool  = signal('pan');
  markupColor = '#ff0000';

  tools = [
    { id:'pan',       icon:'✋', label:'Pan'       },
    { id:'line',      icon:'╱',  label:'Line'      },
    { id:'arrow',     icon:'→',  label:'Arrow'     },
    { id:'rect',      icon:'□',  label:'Rect'      },
    { id:'circle',    icon:'○',  label:'Circle'    },
    { id:'freehand',  icon:'✏',  label:'Freehand'  },
    { id:'cloud',     icon:'☁',  label:'Cloud'     },
    { id:'text',      icon:'T',  label:'Text'      },
    { id:'highlight', icon:'▌',  label:'Highlight' },
    { id:'stamp',     icon:'🔵', label:'Stamp'     },
  ];

  ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id) { this.router.navigate(['/']); return; }

    this.service.getViewerData(id).subscribe({
      next: (data: any) => {
        this.loading.set(false);
        const ct = data?.type;

        if (ct === 'svg') {
          this.viewerData.set(data);
        } else if (ct === 'pdf' || data instanceof ArrayBuffer) {
          this.renderPdf(data);
        } else if (ct === 'error') {
          this.errorMsg.set(data.error || 'Unknown error');
        } else {
          this.viewerData.set(data);
        }
      },
      error: (err: any) => {
        this.loading.set(false);
        this.errorMsg.set('Failed to load document: ' + err.message);
      }
    });

    this.service.getAnnotations(id).subscribe(anns => this.annotations.set(anns));
  }

  async renderPdf(data: any) {
    // Load PDF.js dynamically
    if (!(window as any).pdfjsLib) {
      await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
      (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    this.viewerData.set({ type: 'pdf', name: 'Document' });
    // PDF rendering handled by child pdf-viewer component in full implementation
  }

  loadScript(src: string): Promise<void> {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = () => res(); s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  setTool(t: string) { this.activeTool.set(t); }
  undoMarkup()  { /* undo last shape */ }
  clearMarkup() { /* clear all shapes */ }
  saveMarkup()  { /* save annotations */ }

  exportXfdf() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.service.exportXfdf(id).subscribe(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'annotations.xfdf'; a.click();
      URL.revokeObjectURL(url);
    });
  }

  goBack() { this.router.navigate(['/']); }
}
