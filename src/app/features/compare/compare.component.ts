import { Component, signal, inject, OnInit, computed } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { CompareService } from '../../core/services/compare.service';
import { DocumentService } from '../../core/services/document.service';
import { ProjectService } from '../../core/services/project.service';
import { Document, CompareResult, ChangeItem } from '../../core/models';
import { problemDetail } from '../../core/handlers/problem-detail';

@Component({
  selector: 'app-compare',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="fixed inset-0 flex flex-col" style="background:var(--bg);z-index:700">

      <!-- Top bar -->
      <div class="flex items-center h-12 px-4 gap-3 flex-shrink-0 text-white"
           style="background:var(--nav);box-shadow:0 2px 4px rgba(0,0,0,.15)">
        <button (click)="goBack()"
          class="text-xs px-3 py-1 rounded border border-white/30 bg-white/10 hover:bg-white/20 transition-colors">
          ← Back
        </button>
        <div class="flex items-center gap-2 flex-1">
          <span class="text-lg">🔍</span>
          <span class="font-semibold text-sm">Compare Documents</span>
        </div>
        <button type="button" (click)="openVisualCompare()" [disabled]="!doc1() || !doc2()"
          aria-label="Visual compare"
          class="text-xs px-3 py-1 rounded border border-white/30 bg-white/10 hover:bg-white/20 disabled:opacity-40"
          title="Open visual overlay comparison">
          👁 Visual
        </button>
        <button type="button" (click)="swapFiles()" aria-label="Swap files" title="Swap the two files"
          class="text-xs px-3 py-1 rounded border border-white/30 bg-white/10 hover:bg-white/20">⇄ Swap</button>
        <!--
          aria-label rather than relying on the visible text: the label carries a
          decorative glyph and changes to "Analysing..." while the comparison
          runs, so the button had no stable accessible name at all.
        -->
        <button type="button" (click)="runCompare()" [disabled]="!doc1() || !doc2() || comparing()"
          aria-label="Compare" title="Compare the two selected files"
          class="text-xs px-4 py-1.5 rounded font-semibold transition-colors disabled:opacity-40"
          style="background:#fff;color:var(--accent)">
          {{ comparing() ? '⏳ Analysing...' : '🔍 Compare' }}
        </button>
      </div>

      <!-- File selector bar -->
      <div class="flex items-center gap-3 px-4 py-2 bg-white border-b border-gray-200 flex-shrink-0">
        <!-- A button, not a div with a click handler: this is the control that
             chooses a file, so it needs to be reachable by Tab and operable by
             Enter and Space without a directive re-implementing what the
             element already does (1A.2). text-left because a button centres
             its content by default and this one holds a left-aligned card. -->
        <button type="button" (click)="pickFile(1)"
          class="flex-1 border-2 rounded-lg p-3 cursor-pointer transition-all min-w-0 text-left"
          [class]="doc1() ? 'border-accent bg-blue-50' : 'border-dashed border-gray-300 hover:border-accent'">
          <div class="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">📄 File 1 — Original</div>
          <div class="font-medium text-sm truncate">{{ doc1()?.name || 'Click to select' }}</div>
          @if (doc1()) {
            <div class="text-xs text-gray-500 mt-0.5">{{ doc1()!.fileName }} {{ doc1()!.revision ? '· Rev ' + doc1()!.revision : '' }}</div>
          }
        </button>

        <div class="text-xs font-bold text-gray-500 px-2 py-1 bg-gray-100 rounded-full flex-shrink-0">VS</div>

        <!-- A button, not a div with a click handler: this is the control that
             chooses a file, so it needs to be reachable by Tab and operable by
             Enter and Space without a directive re-implementing what the
             element already does (1A.2). text-left because a button centres
             its content by default and this one holds a left-aligned card. -->
        <button type="button" (click)="pickFile(2)"
          class="flex-1 border-2 rounded-lg p-3 cursor-pointer transition-all min-w-0 text-left"
          [class]="doc2() ? 'border-accent bg-blue-50' : 'border-dashed border-gray-300 hover:border-accent'">
          <div class="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">📄 File 2 — Revised</div>
          <div class="font-medium text-sm truncate">{{ doc2()?.name || 'Click to select' }}</div>
          @if (doc2()) {
            <div class="text-xs text-gray-500 mt-0.5">{{ doc2()!.fileName }} {{ doc2()!.revision ? '· Rev ' + doc2()!.revision : '' }}</div>
          }
        </button>
      </div>

      <!-- Body: change list + AI sidebar -->
      <div class="flex flex-1 overflow-hidden min-h-0">

        <!-- Change list -->
        <div class="flex-1 overflow-y-auto p-5 min-w-0">
          @if (!result()) {
            <div class="flex flex-col items-center justify-center h-full text-gray-400">
              <div class="text-5xl mb-4">🔍</div>
              <div class="font-semibold mb-1">Select two documents to compare</div>
              <div class="text-sm">Supports DXF · DWG · IFC · PDF · Office · Images</div>
            </div>
          }

          @if (result(); as r) {
            <!-- Overall banner -->
            <div class="flex items-center gap-3 p-3 rounded-lg mb-4 border"
              [class]="r.overall === 'identical'
                ? 'bg-green-50 border-green-200'
                : r.totalChanges > 5
                  ? 'bg-red-50 border-red-200'
                  : 'bg-amber-50 border-amber-200'">
              <span class="text-2xl">{{ r.overall === 'identical' ? '✅' : r.totalChanges > 5 ? '🔴' : '🟡' }}</span>
              <div>
                <div class="font-semibold text-sm">{{ r.overall === 'identical' ? 'Files are identical' : 'Changes detected' }}</div>
                <div class="text-xs text-gray-500">{{ r.doc1Name }} vs {{ r.doc2Name }} · {{ r.fileType }}</div>
              </div>
            </div>

            <!-- Warning -->
            @if (r.warning) {
              <div class="p-3 bg-amber-50 border border-amber-200 rounded-lg mb-4 text-xs text-amber-800 whitespace-pre-wrap">
                ⚠️ {{ r.warning }}
              </div>
            }

            <!-- Stats -->
            @if (r.totalChanges > 0) {
              <div class="flex gap-3 mb-4 flex-wrap">
                <div class="bg-white rounded border border-gray-200 px-4 py-2 text-center min-w-16">
                  <div class="text-xl font-bold font-mono text-accent">{{ r.totalChanges }}</div>
                  <div class="text-xs text-gray-500">Total</div>
                </div>
                <div class="bg-white rounded border border-gray-200 px-4 py-2 text-center min-w-16">
                  <div class="text-xl font-bold font-mono text-green-600">+{{ r.added }}</div>
                  <div class="text-xs text-gray-500">Added</div>
                </div>
                <div class="bg-white rounded border border-gray-200 px-4 py-2 text-center min-w-16">
                  <div class="text-xl font-bold font-mono text-red-600">-{{ r.removed }}</div>
                  <div class="text-xs text-gray-500">Removed</div>
                </div>
              </div>

              <!-- Changes by category -->
              @for (group of groupedChanges(); track group.category) {
                <div class="mb-4">
                  <div class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                    {{ group.category }}
                  </div>
                  <div class="space-y-1.5">
                    @for (c of group.items; track c.change) {
                      <div class="flex items-start gap-3 p-2.5 rounded-md text-sm"
                        [class]="c.type === 'added'
                          ? 'bg-green-50 border-l-2 border-green-500'
                          : c.type === 'removed'
                            ? 'bg-red-50 border-l-2 border-red-500'
                            : 'bg-amber-50 border-l-2 border-amber-500'">
                        <span class="text-base flex-shrink-0">{{ c.icon }}</span>
                        <div class="flex-1 min-w-0">
                          <div class="font-medium text-gray-800">
                            {{ c.change }}
                            <span class="ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-semibold"
                              [class]="c.severity === 'high' ? 'text-red-600 bg-red-100'
                                     : c.severity === 'medium' ? 'text-amber-600 bg-amber-100'
                                     : 'text-gray-500 bg-gray-100'">
                              {{ c.severity }}
                            </span>
                          </div>
                          @if (c.detail) {
                            <div class="text-xs text-gray-500 mt-0.5">{{ c.detail }}</div>
                          }
                        </div>
                      </div>
                    }
                  </div>
                </div>
              }
            }
          }
        </div>

        <!-- AI Sidebar (600px) -->
        <div class="border-l border-gray-200 bg-white flex flex-col flex-shrink-0" style="width:600px">
          <div class="flex items-center gap-2 px-4 py-3 border-b border-gray-200 bg-gray-50 flex-shrink-0">
            <span>✨</span>
            <span class="font-semibold text-sm flex-1">AI Summary</span>
            @if (aiLoading()) {
              <div class="w-4 h-4 border-2 border-blue-200 border-t-accent rounded-full animate-spin"></div>
            }
          </div>

          <div class="flex-1 overflow-y-auto min-h-0">
            @if (!result()) {
              <div class="flex flex-col items-center justify-center h-full text-gray-400 p-6 text-center">
                <div class="text-4xl mb-3">🤖</div>
                <div class="text-sm">Run a comparison then generate an AI-powered engineering review.</div>
              </div>
            } @else if (aiText()) {
              <div class="p-4 text-sm leading-relaxed text-gray-700" [innerHTML]="aiHtml()"></div>
            } @else {
              <div class="flex flex-col items-center justify-center h-full text-gray-400 p-6 text-center">
                <div class="text-3xl mb-3">🤖</div>
                <div class="text-sm mb-4">Generate an AI-powered review with revision summary, impacted disciplines, review comments and RFIs.</div>
              </div>
            }
          </div>

          @if (result() && !aiLoading()) {
            <div class="p-3 border-t border-gray-200 flex-shrink-0">
              <button (click)="generateAI()"
                class="w-full flex items-center justify-center gap-2 py-2 rounded border border-blue-200 bg-blue-50 text-accent text-sm font-medium hover:bg-blue-100 transition-colors">
                ✨ {{ aiText() ? 'Regenerate Summary' : 'AI Summary' }}
              </button>
            </div>
          }
        </div>
      </div>
    </div>

    <!-- Document picker modal -->
    @if (showPicker()) {
      <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-[800] flex items-center justify-center">
        <div class="bg-white rounded-lg shadow-2xl w-96 max-h-[70vh] flex flex-col">
          <div class="flex items-center justify-between p-4 border-b border-gray-200">
            <span class="font-semibold text-sm">Select document for File {{ pickingSlot() }}</span>
            <button (click)="showPicker.set(false)" class="text-gray-400 hover:text-gray-600">✕</button>
          </div>
          <div class="overflow-y-auto flex-1 p-2">
            @for (doc of docs(); track doc.id) {
              <button type="button" (click)="selectDoc(doc)"
                class="w-full text-left flex items-center gap-3 p-2.5 rounded-md cursor-pointer hover:bg-gray-50 transition-colors">
                <span class="text-xl flex-shrink-0">{{ docService.getFileIcon(doc) }}</span>
                <div class="min-w-0 flex-1">
                  <div class="font-medium text-sm truncate">{{ doc.name }}</div>
                  <div class="text-xs text-gray-500">{{ doc.fileName }} {{ doc.revision ? '· Rev ' + doc.revision : '' }}</div>
                </div>
              </button>
            }
          </div>
        </div>
      </div>
    }
  `
})
export class CompareComponent implements OnInit {
  private router       = inject(Router);
  private compareService = inject(CompareService);
  docService           = inject(DocumentService);
  private projectService = inject(ProjectService);

  doc1       = signal<Document | null>(null);
  doc2       = signal<Document | null>(null);
  result     = signal<CompareResult | null>(null);
  comparing  = signal(false);
  showPicker = signal(false);
  pickingSlot = signal(1);
  aiText     = signal('');
  aiHtml     = signal('');
  aiLoading  = signal(false);
  docs       = this.docService.documents;

  groupedChanges = computed(() => {
    const r = this.result();
    if (!r) return [];
    const groups: Record<string, ChangeItem[]> = {};
    for (const c of r.changes) {
      const cat = c.category || 'OTHER';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(c);
    }
    return Object.entries(groups).map(([category, items]) => ({ category, items }));
  });

  ngOnInit() {
    const p = this.projectService.selected();
    if (p && this.docService.documents().length === 0) {
      this.docService.loadByProject(p.id).subscribe();
    }
  }

  pickFile(slot: number) {
    this.pickingSlot.set(slot);
    this.showPicker.set(true);
  }

  selectDoc(doc: Document) {
    if (this.pickingSlot() === 1) this.doc1.set(doc);
    else this.doc2.set(doc);
    this.showPicker.set(false);
  }

  swapFiles() {
    const tmp = this.doc1();
    this.doc1.set(this.doc2());
    this.doc2.set(tmp);
  }

  runCompare() {
    const d1 = this.doc1(), d2 = this.doc2();
    if (!d1 || !d2) return;
    this.comparing.set(true);
    this.result.set(null);
    this.aiText.set('');
    this.compareService.compare({ documentId1: d1.id, documentId2: d2.id }).subscribe({
      next: r => { this.result.set(r); this.comparing.set(false); },
      error: () => this.comparing.set(false)
    });
  }

  generateAI() {
    const result = this.result();
    if (!result) return;
    this.aiLoading.set(true);
    this.aiText.set('');
    this.aiHtml.set('');

    // Facts, not a prompt. The prompt, the model and the token ceiling are the
    // server's to decide: this used to assemble the whole thing here and POST
    // it to an endpoint that forwarded it verbatim to a third party, so a
    // browser chose what the deployment spent and no filter was possible on
    // the way out.
    this.compareService.getComparisonReport(result).subscribe({
      next: response => {
        this.aiText.set(response.report);
        this.aiHtml.set(this.formatReport(response.report));
        this.aiLoading.set(false);
      },
      error: (err: unknown) => {
        this.aiText.set(problemDetail(err,
          'The summary could not be produced. The comparison itself is unaffected.'));
        this.aiLoading.set(false);
      }
    });
  }

  /**
   * Escapes text before it is placed into markup.
   *
   * <p>formatReport builds an HTML string, and the text it builds it from is a
   * model's output — which the data-handling rules require be treated as
   * untrusted input, never interpolated into HTML. Angular's binding sanitiser
   * is the second layer and would strip an injected script; this is the first,
   * and it is the one that means a prompt-injected reply is rendered as the
   * text it is rather than relying on the sanitiser to notice.
   */
  private escape(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  formatReport(text: string): string {
    const sectionRe = /^(\d+\.\s+)(REVISION SUMMARY|KEY CHANGES IDENTIFIED|IMPACTED DISCIPLINES|REVIEW COMMENTS|SUGGESTED RFIs)/i;
    const rfiRe     = /^(RFI-\d+:)/i;
    const icons: Record<string, string> = {
      'REVISION SUMMARY':'📋','KEY CHANGES IDENTIFIED':'🔍',
      'IMPACTED DISCIPLINES':'🏗','REVIEW COMMENTS':'✍️','SUGGESTED RFIs':'❓'
    };
    return text.split('\n').map(line => {
      const t = line.trim();
      if (!t) return '<div style="height:5px"></div>';
      if (sectionRe.test(t)) {
        const key = Object.keys(icons).find(k => t.toUpperCase().includes(k)) || '';
        return `<div style="display:flex;align-items:center;gap:6px;margin:12px 0 5px;padding-bottom:4px;border-bottom:1px solid #dde1e7">
          <span>${icons[key]||'•'}</span>
          <strong style="font-size:.78rem;color:var(--accent);text-transform:uppercase;letter-spacing:.4px">${this.escape(t)}</strong>
        </div>`;
      }
      if (rfiRe.test(t)) {
        const d = t.indexOf('—');
        const ref = d > 0 ? t.slice(0, d).trim() : t;
        const rest = d > 0 ? t.slice(d + 1).trim() : '';
        return `<div style="background:#fffbeb;border-left:3px solid #f59e0b;border-radius:3px;padding:6px 10px;margin:3px 0;font-size:.79rem">
          <strong style="color:#b45309">${this.escape(ref)}</strong>${rest ? ' — ' + this.escape(rest) : ''}
        </div>`;
      }
      if (/^[•\-\*]\s+/.test(t) || /^\d+\.\s+[a-z]/i.test(t)) {
        return `<div style="display:flex;gap:6px;margin:2px 0;font-size:.79rem">
          <span style="color:var(--accent);flex-shrink:0">▸</span>
          <span>${this.escape(t.replace(/^[•\-\*]\s+/, '').replace(/^\d+\.\s+/, ''))}</span>
        </div>`;
      }
      return `<p style="margin:3px 0;font-size:.79rem">${this.escape(t)}</p>`;
    }).join('');
  }


  openVisualCompare() {
    const d1 = this.doc1(), d2 = this.doc2();
    if (!d1 || !d2) return;
    this.router.navigate(['/visual-compare'], {
      queryParams: { doc1: d1.id, doc2: d2.id }
    });
  }

  goBack() { this.router.navigate(['/']); }
}
