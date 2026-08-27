import {
  Component, inject, signal, computed, OnInit,
  ViewChild, ElementRef, AfterViewInit, ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { PdfEngineService } from '../../../core/services/viewer/pdf-engine.service';
import { DocumentService } from '../../../core/services/document.service';
import { Document } from '../../../core/models';

export type CompareMode = 'side-by-side' | 'slider' | 'overlay';

@Component({
  selector: 'app-visual-compare',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 flex flex-col" style="z-index:600;background:#1a1d27">

      <!-- Top bar -->
      <div class="flex items-center h-11 px-4 gap-3 flex-shrink-0 text-white"
           style="background:var(--nav);box-shadow:0 2px 4px rgba(0,0,0,.2)">
        <button (click)="goBack()"
          class="text-xs px-3 py-1 rounded border border-white/30 bg-white/10 hover:bg-white/20">
          ← Back
        </button>
        <span class="font-semibold text-sm">Visual Comparison</span>

        <!-- Mode switcher -->
        <div class="flex gap-1 ml-4">
          @for (m of modes; track m.id) {
            <button (click)="mode.set(m.id)"
              class="text-xs px-3 py-1 rounded transition-all"
              [class]="mode() === m.id
                ? 'bg-white text-nav font-semibold'
                : 'border border-white/30 bg-white/10 hover:bg-white/20'">
              {{ m.icon }} {{ m.label }}
            </button>
          }
        </div>

        <div class="flex-1"></div>

        <!-- Page nav -->
        @if (totalPages() > 1) {
          <div class="flex items-center gap-1 text-xs">
            <button (click)="prevPage()" [disabled]="currentPage() <= 1"
              class="px-2 py-1 rounded border border-white/30 bg-white/10 disabled:opacity-30">‹</button>
            <span class="w-20 text-center">{{ currentPage() }} / {{ totalPages() }}</span>
            <button (click)="nextPage()" [disabled]="currentPage() >= totalPages()"
              class="px-2 py-1 rounded border border-white/30 bg-white/10 disabled:opacity-30">›</button>
          </div>
        }

        <!-- Overlay opacity (overlay mode only) -->
        @if (mode() === 'overlay') {
          <div class="flex items-center gap-2 text-xs">
            <span class="text-white/70">Opacity</span>
            <input type="range" min="0" max="100" [(ngModel)]="overlayOpacity"
              class="w-20 accent-white" />
            <span class="w-8">{{ overlayOpacity }}%</span>
          </div>
        }
      </div>

      <!-- File labels -->
      <div class="flex items-center px-4 py-2 gap-4 flex-shrink-0"
           style="background:rgba(0,0,0,.3)">
        <div class="flex items-center gap-2 text-sm">
          <div class="w-3 h-3 rounded-sm bg-blue-400"></div>
          <span class="text-white/80">File 1:</span>
          <span class="text-white font-medium">{{ doc1()?.name || '—' }}</span>
          @if (doc1()?.revision) {
            <span class="text-white/50 text-xs">Rev {{ doc1()!.revision }}</span>
          }
        </div>
        @if (mode() !== 'overlay') {
          <div class="w-px h-4 bg-white/20"></div>
        }
        <div class="flex items-center gap-2 text-sm">
          <div class="w-3 h-3 rounded-sm bg-amber-400"></div>
          <span class="text-white/80">File 2:</span>
          <span class="text-white font-medium">{{ doc2()?.name || '—' }}</span>
          @if (doc2()?.revision) {
            <span class="text-white/50 text-xs">Rev {{ doc2()!.revision }}</span>
          }
        </div>
      </div>

      <!-- Loading -->
      @if (loading()) {
        <div class="flex-1 flex flex-col items-center justify-center text-white/50">
          <div class="w-8 h-8 border-2 border-white/20 border-t-white/70 rounded-full animate-spin mb-3"></div>
          <div class="text-sm">{{ loadingMsg() }}</div>
        </div>
      }

      <!-- ── Side-by-side mode ───────────────────────────────── -->
      @if (!loading() && mode() === 'side-by-side') {
        <div class="flex flex-1 overflow-hidden gap-1">
          <!-- Left panel -->
          <div class="flex-1 overflow-auto flex flex-col items-center p-3 gap-3"
               style="background:#2a2d3a">
            <div class="text-xs text-blue-300 font-semibold mb-1 self-start px-1">ORIGINAL</div>
            <canvas #canvas1 class="shadow-xl max-w-full"></canvas>
          </div>
          <!-- Divider -->
          <div class="w-1 bg-white/10 flex-shrink-0 cursor-col-resize"></div>
          <!-- Right panel -->
          <div class="flex-1 overflow-auto flex flex-col items-center p-3 gap-3"
               style="background:#2a2d3a">
            <div class="text-xs text-amber-300 font-semibold mb-1 self-start px-1">REVISED</div>
            <canvas #canvas2 class="shadow-xl max-w-full"></canvas>
          </div>
        </div>
      }

      <!-- ── Slider mode ────────────────────────────────────── -->
      @if (!loading() && mode() === 'slider') {
        <div class="flex-1 overflow-auto flex items-center justify-center p-4"
             style="background:#2a2d3a">
          <div class="relative inline-block shadow-2xl select-none"
               (mousemove)="onSliderMove($event)"
               (touchmove)="onSliderTouchMove($event)">
            <!-- Base (File 2 — revised) -->
            <canvas #sliderCanvas2 class="block"></canvas>

            <!-- Overlay (File 1 — original) clipped -->
            <div class="absolute top-0 left-0 overflow-hidden"
                 [style.width.px]="sliderPos()"
                 [style.height]="'100%'">
              <canvas #sliderCanvas1 class="block"></canvas>
            </div>

            <!-- Slider handle -->
            <div class="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg cursor-ew-resize flex items-center justify-center"
                 [style.left.px]="sliderPos()"
                 (mousedown)="sliderDragging.set(true)"
                 (mouseup)="sliderDragging.set(false)">
              <div class="w-6 h-8 rounded-full bg-white shadow-lg flex items-center justify-center text-gray-600 text-xs font-bold">
                ⇔
              </div>
            </div>

            <!-- Labels -->
            <div class="absolute top-2 left-2 text-xs text-blue-200 bg-blue-900/60 px-2 py-0.5 rounded pointer-events-none">
              ORIGINAL
            </div>
            <div class="absolute top-2 right-2 text-xs text-amber-200 bg-amber-900/60 px-2 py-0.5 rounded pointer-events-none">
              REVISED
            </div>
          </div>
        </div>
      }

      <!-- ── Overlay mode ───────────────────────────────────── -->
      @if (!loading() && mode() === 'overlay') {
        <div class="flex-1 overflow-auto flex items-center justify-center p-4"
             style="background:#2a2d3a">
          <div class="relative inline-block shadow-2xl">
            <canvas #overlayCanvas2 class="block"></canvas>
            <canvas #overlayCanvas1 class="absolute top-0 left-0 block"
              [style.opacity]="overlayOpacity / 100"
              style="mix-blend-mode:difference"></canvas>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    canvas { image-rendering: crisp-edges; }
  `]
})
export class VisualCompareComponent implements OnInit, AfterViewInit {
  @ViewChild('canvas1')       canvas1!:       ElementRef<HTMLCanvasElement>;
  @ViewChild('canvas2')       canvas2!:       ElementRef<HTMLCanvasElement>;
  @ViewChild('sliderCanvas1') sliderCanvas1!: ElementRef<HTMLCanvasElement>;
  @ViewChild('sliderCanvas2') sliderCanvas2!: ElementRef<HTMLCanvasElement>;
  @ViewChild('overlayCanvas1') overlayCanvas1!: ElementRef<HTMLCanvasElement>;
  @ViewChild('overlayCanvas2') overlayCanvas2!: ElementRef<HTMLCanvasElement>;

  private route      = inject(ActivatedRoute);
  private router     = inject(Router);
  private http       = inject(HttpClient);
  private pdfEngine  = inject(PdfEngineService);
  private docService = inject(DocumentService);

  mode       = signal<CompareMode>('side-by-side');
  loading    = signal(true);
  loadingMsg = signal('Loading documents...');
  doc1       = signal<Document | null>(null);
  doc2       = signal<Document | null>(null);
  currentPage = signal(1);
  totalPages  = signal(1);
  sliderPos   = signal(400);
  sliderDragging = signal(false);
  overlayOpacity = 50;

  private pdfDoc1: any = null;
  private pdfDoc2: any = null;
  private rendered = false;

  readonly modes = [
    { id: 'side-by-side' as CompareMode, icon: '⊟', label: 'Side by Side' },
    { id: 'slider'       as CompareMode, icon: '⇔', label: 'Slider' },
    { id: 'overlay'      as CompareMode, icon: '⊕', label: 'Overlay' },
  ];

  ngOnInit() {
    const id1 = this.route.snapshot.queryParamMap.get('doc1');
    const id2 = this.route.snapshot.queryParamMap.get('doc2');
    if (!id1 || !id2) { this.router.navigate(['/']); return; }
    this.loadDocuments(Number(id1), Number(id2));
  }

  ngAfterViewInit() {
    if (!this.loading() && !this.rendered) {
      this.renderCurrentPage();
    }
  }

  private async loadDocuments(id1: number, id2: number) {
    this.loading.set(true);
    await this.pdfEngine.ensureLoaded();

    try {
      this.loadingMsg.set('Loading File 1...');
      const [data1, data2] = await Promise.all([
        this.fetchViewerData(id1),
        this.fetchViewerData(id2)
      ]);

      if (data1.pdfDoc) { this.pdfDoc1 = data1.pdfDoc; }
      if (data2.pdfDoc) { this.pdfDoc2 = data2.pdfDoc; }

      this.doc1.set(data1.doc);
      this.doc2.set(data2.doc);

      const p = Math.max(
        this.pdfDoc1?.numPages || 1,
        this.pdfDoc2?.numPages || 1
      );
      this.totalPages.set(p);
      this.loading.set(false);

      setTimeout(() => this.renderCurrentPage(), 100);
    } catch (e: any) {
      this.loadingMsg.set('Error: ' + e.message);
    }
  }

  private async fetchViewerData(id: number): Promise<{ doc: Document; pdfDoc?: any }> {
    return new Promise((resolve, reject) => {
      // Get document metadata
      this.http.get<any>(`/api/viewer/${id}`).subscribe({
        next: async (data) => {
          const doc: Document = {
            id, name: data.name || `Document ${id}`,
            fileName: data.fileName || '',
            fileType: '', fileSize: 0,
            documentType: 'DRAWING', status: 'DRAFT',
            drawingNumber: data.drawingNumber || '',
            revision: data.revision || '',
            projectId: 0, createdAt: ''
          };

          if (data.type === 'pdf') {
            // Fetch PDF bytes
            this.http.get(`/api/viewer/${id}`, { responseType: 'arraybuffer' }).subscribe({
              next: async (buf) => {
                const pdfDoc = await this.pdfEngine.openDocument(buf);
                resolve({ doc, pdfDoc });
              },
              error: reject
            });
          } else {
            resolve({ doc });
          }
        },
        error: reject
      });
    });
  }

  async renderCurrentPage() {
    this.rendered = true;
    const page = this.currentPage();
    const ZOOM = 1.5;

    if (this.mode() === 'side-by-side') {
      if (this.pdfDoc1 && this.canvas1)
        await this.pdfEngine.renderPage(this.pdfDoc1, Math.min(page, this.pdfDoc1.numPages), this.canvas1.nativeElement, ZOOM);
      if (this.pdfDoc2 && this.canvas2)
        await this.pdfEngine.renderPage(this.pdfDoc2, Math.min(page, this.pdfDoc2.numPages), this.canvas2.nativeElement, ZOOM);
    }

    if (this.mode() === 'slider') {
      if (this.pdfDoc1 && this.sliderCanvas1) {
        const r = await this.pdfEngine.renderPage(this.pdfDoc1, Math.min(page, this.pdfDoc1.numPages), this.sliderCanvas1.nativeElement, ZOOM);
        this.sliderPos.set(r.width / 2);
      }
      if (this.pdfDoc2 && this.sliderCanvas2)
        await this.pdfEngine.renderPage(this.pdfDoc2, Math.min(page, this.pdfDoc2.numPages), this.sliderCanvas2.nativeElement, ZOOM);
    }

    if (this.mode() === 'overlay') {
      if (this.pdfDoc1 && this.overlayCanvas1)
        await this.pdfEngine.renderPage(this.pdfDoc1, Math.min(page, this.pdfDoc1.numPages), this.overlayCanvas1.nativeElement, ZOOM);
      if (this.pdfDoc2 && this.overlayCanvas2)
        await this.pdfEngine.renderPage(this.pdfDoc2, Math.min(page, this.pdfDoc2.numPages), this.overlayCanvas2.nativeElement, ZOOM);
    }
  }

  onSliderMove(e: MouseEvent) {
    if (!this.sliderDragging()) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    this.sliderPos.set(x);
  }

  onSliderTouchMove(e: TouchEvent) {
    const touch = e.touches[0];
    if (!touch) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.max(0, Math.min(touch.clientX - rect.left, rect.width));
    this.sliderPos.set(x);
    e.preventDefault();
  }

  prevPage() {
    this.currentPage.update(p => Math.max(1, p - 1));
    setTimeout(() => this.renderCurrentPage(), 50);
  }

  nextPage() {
    this.currentPage.update(p => Math.min(this.totalPages(), p + 1));
    setTimeout(() => this.renderCurrentPage(), 50);
  }

  goBack() { this.router.navigate(['/compare']); }
}
