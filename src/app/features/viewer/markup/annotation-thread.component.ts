import {
  Component, inject, signal, Input, OnInit, OnChanges,
  SimpleChanges, ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Annotation, AnnotationReply, AnnotationThread } from '../../../core/models';
import { AnnotationService } from '../../../core/services/viewer/annotation.service';
import { RoleService } from '../../../core/services/role.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-annotation-thread',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col h-full">

      <!-- Thread list -->
      <div class="flex-1 overflow-y-auto p-3 space-y-4">
        @for (thread of threads(); track thread.annotation.id) {
          <div class="border border-gray-200 rounded-lg overflow-hidden">

            <!-- Annotation header -->
            <div class="flex items-start gap-2 p-3 bg-gray-50 border-b border-gray-200">
              <div class="w-7 h-7 rounded-full bg-accent flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {{ thread.annotation.authorName.charAt(0).toUpperCase() }}
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-semibold text-gray-800">{{ thread.annotation.authorName }}</span>
                  <span class="text-xs text-gray-400">Page {{ thread.annotation.pageNumber }}</span>
                  <span class="ml-auto text-xs px-1.5 py-0.5 rounded font-semibold"
                    [class]="thread.annotation.status === 'OPEN'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-green-100 text-green-700'">
                    {{ thread.annotation.status }}
                  </span>
                </div>
                <div class="text-xs text-gray-600 mt-0.5">{{ thread.annotation.comment }}</div>
                <div class="text-xs text-gray-400 mt-1">
                  {{ thread.annotation.createdAt | date:'short' }}
                </div>
              </div>
            </div>

            <!-- Replies -->
            @if (thread.replies.length > 0) {
              <div class="divide-y divide-gray-100">
                @for (reply of thread.replies; track reply.id) {
                  <div class="group flex items-start gap-2 p-2.5 hover:bg-gray-50 transition-colors">
                    <div class="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {{ reply.authorName.charAt(0).toUpperCase() }}
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2">
                        <span class="text-xs font-semibold text-gray-700">{{ reply.authorName }}</span>
                        <span class="text-xs text-gray-400">{{ reply.createdAt | date:'shortTime' }}</span>
                        <span class="flex-1"></span>
                        @if (canDelete(reply)) {
                          <button (click)="deleteReply(thread.annotation.id, reply)"
                            [disabled]="deletingReplyId() === reply.id"
                            title="Delete reply"
                            class="opacity-0 group-hover:opacity-100 text-xs text-gray-400
                                   hover:text-red-600 disabled:opacity-40">✕</button>
                        }
                      </div>
                      <div class="text-xs text-gray-600 mt-0.5 leading-relaxed">{{ reply.content }}</div>
                    </div>
                  </div>
                }
              </div>
            }

            <!-- Reply input -->
            <div class="p-2 border-t border-gray-100 bg-white">
              <div class="flex gap-2">
                <input
                  [(ngModel)]="replyInputs[thread.annotation.id]"
                  (keydown.enter)="submitReply(thread.annotation)"
                  placeholder="Reply..."
                  class="flex-1 px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-accent" />
                <button (click)="submitReply(thread.annotation)"
                  [disabled]="!replyInputs[thread.annotation.id]?.trim()"
                  class="px-3 py-1.5 text-xs bg-accent text-white rounded disabled:opacity-40 hover:bg-blue-700">
                  Send
                </button>
              </div>
              <!-- Resolve button -->
              @if (thread.annotation.status === 'OPEN') {
                <button (click)="resolveThread(thread)"
                  class="mt-1.5 text-xs text-green-600 hover:text-green-700 hover:underline">
                  ✓ Mark as Resolved
                </button>
              }
            </div>
          </div>
        }

        @if (threads().length === 0) {
          <div class="text-center text-gray-400 text-xs py-12">
            <div class="text-3xl mb-2">💬</div>
            No annotation threads yet.
          </div>
        }
      </div>

      <!-- New annotation comment -->
      <div class="border-t border-gray-200 p-3 flex-shrink-0 bg-white">
        <div class="text-xs font-semibold text-gray-600 mb-2">Add Comment</div>
        <textarea
          [(ngModel)]="newComment"
          placeholder="Add a comment to the selected annotation..."
          rows="2"
          class="w-full px-2 py-1.5 text-xs border border-gray-300 rounded resize-none focus:outline-none focus:ring-1 focus:ring-accent mb-2">
        </textarea>
        <div class="flex justify-end">
          <button (click)="postComment()"
            [disabled]="!newComment.trim() || !selectedAnnotationId()"
            class="px-3 py-1.5 text-xs bg-accent text-white rounded disabled:opacity-40 hover:bg-blue-700">
            Post
          </button>
        </div>
        @if (!selectedAnnotationId()) {
          <div class="text-xs text-gray-400 mt-1">Select an annotation to comment on it</div>
        }
      </div>
    </div>
  `
})
export class AnnotationThreadComponent implements OnInit, OnChanges {
  @Input() annotations: Annotation[] = [];
  @Input() selectedAnnotationId = signal<number | null>(null);

  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private annotationService = inject(AnnotationService);
  protected roleService     = inject(RoleService);

  threads      = signal<AnnotationThread[]>([]);
  replyInputs: Record<number, string> = {};
  newComment   = '';
  deletingReplyId = signal<number | null>(null);

  ngOnInit() {
    this.buildThreads();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['annotations']) {
      this.buildThreads();
    }
  }

  private buildThreads() {
    const threads = this.annotations.map(ann => ({
      annotation: ann,
      replies:    [] as AnnotationReply[]
    }));
    this.threads.set(threads);

    // Load replies for each annotation
    this.annotations.forEach(ann => {
      this.annotationService.loadReplies(ann.id).subscribe({
        next: replies => {
          this.threads.update(ts =>
            ts.map(t => t.annotation.id === ann.id ? { ...t, replies } : t)
          );
        },
        error: () => { /* thread simply stays empty */ }
      });
    });
  }

  /**
   * Replies are deletable by their author, and by anyone the role model
   * grants delete rights. The server is the authority; this only decides
   * whether to offer the control.
   */
  canDelete(reply: AnnotationReply): boolean {
    return this.roleService.can('canDelete') || reply.authorName === this.auth.username();
  }

  deleteReply(annotationId: number, reply: AnnotationReply) {
    this.deletingReplyId.set(reply.id);
    this.annotationService.deleteReply(reply.id).subscribe({
      next: () => {
        this.deletingReplyId.set(null);
        this.threads.update(ts => ts.map(t =>
          t.annotation.id === annotationId
            ? { ...t, replies: t.replies.filter(r => r.id !== reply.id) }
            : t
        ));
      },
      error: () => this.deletingReplyId.set(null)
    });
  }

  submitReply(annotation: Annotation) {
    const content = this.replyInputs[annotation.id]?.trim();
    if (!content) return;

    this.annotationService.addReply(annotation.id, content).subscribe({
      next: reply => {
        this.threads.update(ts =>
          ts.map(t => t.annotation.id === annotation.id
            ? { ...t, replies: [...t.replies, reply] }
            : t)
        );
        this.replyInputs[annotation.id] = '';
      },
      error: () => {
        // Optimistic UI fallback — show reply locally even if endpoint not ready
        const tempReply: AnnotationReply = {
          id: Date.now(),
          annotationId: annotation.id,
          authorName: this.auth.username() || 'Me',
          content,
          createdAt: new Date().toISOString()
        };
        this.threads.update(ts =>
          ts.map(t => t.annotation.id === annotation.id
            ? { ...t, replies: [...t.replies, tempReply] }
            : t)
        );
        this.replyInputs[annotation.id] = '';
      }
    });
  }

  postComment() {
    const annId = this.selectedAnnotationId();
    if (!annId || !this.newComment.trim()) return;
    const ann = this.annotations.find(a => a.id === annId);
    if (!ann) return;
    this.replyInputs[annId] = this.newComment;
    this.submitReply(ann);
    this.newComment = '';
  }

  resolveThread(thread: AnnotationThread) {
    this.http.patch<Annotation>(`/api/annotations/${thread.annotation.id}/resolve`, {})
      .subscribe({
        next: updated => {
          this.threads.update(ts =>
            ts.map(t => t.annotation.id === updated.id
              ? { ...t, annotation: updated }
              : t)
          );
        }
      });
  }
}
