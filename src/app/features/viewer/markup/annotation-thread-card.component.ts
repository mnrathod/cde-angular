/**
 * One annotation and the conversation under it.
 *
 * <p>Two things here were wrong in a way a reader would never find out
 * about. The delete control on a reply was `opacity-0 group-hover:opacity-100`
 * with no `focus` counterpart, so a keyboard user could tab onto a button
 * that was invisible — focus went somewhere and nothing on screen moved
 * (SC 2.4.7). And its whole content was `✕`, so its accessible name was that
 * glyph: content beats `title` in the name computation, which is why the
 * tooltip was never read.
 */
import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, Output,
} from "@angular/core";
import { DatePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";

import { AnnotationReply, AnnotationThread } from "../../../core/models";
import { pageLabel } from "../../../../viewer-core/page-labels";
import { annotationStatusClass, annotationStatusName } from "./annotation-wording";

@Component({
  selector: "app-annotation-thread-card",
  standalone: true,
  imports: [DatePipe, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="border border-gray-200 rounded-lg overflow-hidden">

      <div class="flex items-start gap-2 p-3 bg-gray-50 border-b border-gray-200">
        <div aria-hidden="true"
             class="w-7 h-7 rounded-full bg-accent flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          {{ initialOf(thread.annotation.authorName) }}
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-xs font-semibold text-gray-800">{{ thread.annotation.authorName }}</span>
            <span class="text-xs text-gray-400">{{ pageOf(thread.annotation.pageNumber) }}</span>
            <span class="ml-auto text-xs px-1.5 py-0.5 rounded font-semibold"
                  [class]="statusClass()">{{ statusName() }}</span>
          </div>
          <div class="text-xs text-gray-600 mt-0.5">{{ thread.annotation.comment }}</div>
          <div class="text-xs text-gray-400 mt-1">{{ thread.annotation.createdAt | date: 'short' }}</div>
        </div>
      </div>

      @if (thread.replies.length > 0) {
        <ul class="divide-y divide-gray-100 list-none m-0 p-0">
          @for (reply of thread.replies; track reply.id) {
            <li class="group flex items-start gap-2 p-2.5 hover:bg-gray-50 transition-colors">
              <div aria-hidden="true"
                   class="w-6 h-6 rounded-full bg-gray-300 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {{ initialOf(reply.authorName) }}
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-semibold text-gray-700">{{ reply.authorName }}</span>
                  <span class="text-xs text-gray-400">{{ reply.createdAt | date: 'shortTime' }}</span>
                  <span class="flex-1"></span>
                  @if (canDelete(reply)) {
                    <button type="button" (click)="replyDeleted.emit(reply)"
                      [disabled]="deletingReplyId === reply.id"
                      [attr.aria-label]="deleteReplyLabel(reply)"
                      [title]="deleteReplyLabel(reply)"
                      class="remove"><span aria-hidden="true">✕</span></button>
                  }
                </div>
                <div class="text-xs text-gray-600 mt-0.5 leading-relaxed">{{ reply.content }}</div>
              </div>
            </li>
          }
        </ul>
      }

      <div class="p-2 border-t border-gray-100 bg-white">
        <div class="flex gap-2">
          <label class="sr-only" [attr.for]="replyFieldId()">{{ replyLabel }}</label>
          <input [id]="replyFieldId()"
            [ngModel]="draft" (ngModelChange)="draftChange.emit($event)"
            [ngModelOptions]="{ standalone: true }"
            (keydown.enter)="replySubmitted.emit()"
            i18n-placeholder="@@annotationThread.replyPlaceholder" placeholder="Reply..."
            class="flex-1 px-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-accent" />
          <button type="button" (click)="replySubmitted.emit()" [disabled]="!draft.trim()"
            i18n="Posts a reply to an annotation thread@@annotationThread.send"
            class="px-3 py-1.5 text-xs bg-accent text-white rounded disabled:opacity-40 hover:bg-blue-700">
            Send
          </button>
        </div>

        @if (thread.annotation.status === 'OPEN') {
          <button type="button" (click)="resolved.emit()"
            [attr.aria-label]="resolveLabel()"
            class="mt-1.5 text-xs text-green-600 hover:text-green-700 hover:underline min-h-6">
            <span aria-hidden="true">✓</span>
            <ng-container i18n="Closes an annotation thread as dealt with@@annotationThread.resolve"
              >Mark as Resolved</ng-container
            >
          </button>
        }
      </div>
    </div>
  `,
  styles: [`
    /* Quiet until the row is hovered — but never invisible under focus,
       which is what leaves a keyboard user with nowhere they can see. */
    .remove {
      min-width: 24px; min-height: 24px;
      opacity: 0; color: #9ca3af; border-radius: .25rem;
      transition: opacity .15s, color .15s;
    }
    /* Separate rules on purpose: a browser that does not know
       :focus-visible drops the whole comma-grouped selector with it, and
       the plain :focus fallback is the one that must survive. */
    .group:hover .remove { opacity: 1; }
    .remove:focus { opacity: 1; }
    .remove:focus-visible { opacity: 1; }
    .remove:hover:not(:disabled) { color: #dc2626; }
    .remove:disabled { opacity: .4; }
  `],
})
export class AnnotationThreadCardComponent {
  @Input({ required: true }) thread!: AnnotationThread;
  /** What has been typed into this thread's reply box. */
  @Input() draft = "";
  /** Whether the role model grants delete rights over anyone's reply. */
  @Input() canDeleteAnyReply = false;
  /** Who is reading, so their own replies carry the control regardless. */
  @Input() currentUser: string | null = null;
  @Input() deletingReplyId: number | null = null;

  @Output() draftChange = new EventEmitter<string>();
  @Output() replySubmitted = new EventEmitter<void>();
  @Output() replyDeleted = new EventEmitter<AnnotationReply>();
  @Output() resolved = new EventEmitter<void>();

  readonly replyLabel = $localize`:Accessible name of the box for replying to one annotation@@annotationThread.replyLabel:Reply to this annotation`;

  /**
   * Whether to offer the delete control on this reply.
   *
   * <p>Per reply, not per thread: a thread holding one of my replies and
   * five of someone else's must not sprout a delete button on all six. The
   * server is the authority either way; this only decides what to render,
   * and §1.1 says never render a control the reader cannot use.
   */
  canDelete(reply: AnnotationReply): boolean {
    return this.canDeleteAnyReply || reply.authorName === this.currentUser;
  }

  /** Decoration beside the name it abbreviates, so it is not read twice. */
  initialOf(authorName: string): string {
    return authorName.charAt(0).toUpperCase();
  }

  pageOf(page: number): string {
    return pageLabel(page);
  }

  statusName(): string {
    return annotationStatusName(this.thread.annotation.status);
  }

  statusClass(): string {
    return annotationStatusClass(this.thread.annotation.status);
  }

  /** Unique per thread, so every reply box has its own label. */
  replyFieldId(): string {
    return `annotation-reply-${this.thread.annotation.id}`;
  }

  /**
   * Names whose reply is about to go.
   *
   * <p>"Delete reply" is announced identically on every row, which tells a
   * reader nothing about which one they are about to remove.
   */
  deleteReplyLabel(reply: AnnotationReply): string {
    const author = reply.authorName;
    return $localize`:Button that removes one person's reply from an annotation thread@@annotationThread.deleteReply:Delete the reply by ${author}:author:`;
  }

  resolveLabel(): string {
    const author = this.thread.annotation.authorName;
    return $localize`:Button that closes one annotation thread, naming whose it is@@annotationThread.resolveOne:Mark the annotation by ${author}:author: as resolved`;
  }
}
