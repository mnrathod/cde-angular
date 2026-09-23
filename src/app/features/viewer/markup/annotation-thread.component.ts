import {
  Component, inject, signal, Input, OnInit, OnChanges,
  SimpleChanges, ChangeDetectionStrategy
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { Annotation, AnnotationReply } from '../../../core/models';
import { RoleService } from '../../../core/services/role.service';
import { AuthService } from '../../../core/services/auth.service';
import { AnnotationConversationService } from './annotation-conversation.service';
import { AnnotationThreadCardComponent } from './annotation-thread-card.component';

/**
 * The comments on a document's annotations, and the box for adding one.
 *
 * <p>The requests and their failure states live in
 * `AnnotationConversationService`; this renders them and decides which
 * controls to offer.
 */
@Component({
  selector: 'app-annotation-thread',
  standalone: true,
  imports: [FormsModule, AnnotationThreadCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [AnnotationConversationService],
  template: `
    <div class="flex flex-col h-full">

      <div class="flex-1 overflow-y-auto p-3 space-y-4">
        @for (thread of conversation.threads(); track thread.annotation.id) {
          <app-annotation-thread-card
            [thread]="thread"
            [draft]="draftFor(thread.annotation.id)"
            [canDeleteAnyReply]="canDeleteAnyReply()"
            [currentUser]="currentUser()"
            [deletingReplyId]="conversation.deletingReplyId()"
            (draftChange)="setDraft(thread.annotation.id, $event)"
            (replySubmitted)="sendReply(thread.annotation.id)"
            (replyDeleted)="deleteReply(thread.annotation.id, $event)"
            (resolved)="conversation.resolve(thread.annotation.id)"
          />
        }

        @if (conversation.threads().length === 0) {
          <div class="text-center text-gray-400 text-xs py-12">
            <div class="text-3xl mb-2" aria-hidden="true">💬</div>
            <ng-container i18n="Empty state for the annotation comments panel@@annotationThread.empty"
              >No annotation threads yet.</ng-container
            >
          </div>
        }
      </div>

      <!--
        A live region. Every failure in this panel used to be silent, and one
        of them was worse than silent: a reply that did not post was shown as
        though it had.
      -->
      <div role="alert" aria-live="assertive">
        @if (conversation.failure()) {
          <div class="mx-3 mb-2 p-2 text-xs rounded bg-red-50 border border-red-200 text-red-700">
            {{ conversation.failure() }}
          </div>
        }
      </div>

      <div class="border-t border-gray-200 p-3 flex-shrink-0 bg-white">
        <label for="new-annotation-comment"
               i18n="@@annotationThread.addCommentHeading"
               class="block text-xs font-semibold text-gray-600 mb-2">Add Comment</label>
        <textarea id="new-annotation-comment"
          [(ngModel)]="newComment"
          [ngModelOptions]="{ standalone: true }"
          [attr.aria-describedby]="selectedAnnotationId() ? null : 'new-comment-hint'"
          i18n-placeholder="@@annotationThread.commentPlaceholder"
          placeholder="Add a comment to the selected annotation..."
          rows="2"
          class="w-full px-2 py-1.5 text-xs border border-gray-300 rounded resize-none focus:outline-none focus:ring-1 focus:ring-accent mb-2">
        </textarea>
        <div class="flex justify-end">
          <button type="button" (click)="postComment()"
            [disabled]="!newComment.trim() || !selectedAnnotationId()"
            [title]="selectedAnnotationId() ? '' : selectFirstHint"
            i18n="Posts a new comment on the selected annotation@@annotationThread.post"
            class="px-3 py-1.5 text-xs bg-accent text-white rounded disabled:opacity-40 hover:bg-blue-700">
            Post
          </button>
        </div>
        @if (!selectedAnnotationId()) {
          <div id="new-comment-hint"
               i18n="Explains why the Post button is unavailable@@annotationThread.selectFirst"
               class="text-xs text-gray-400 mt-1">Select an annotation to comment on it</div>
        }
      </div>
    </div>
  `
})
export class AnnotationThreadComponent implements OnInit, OnChanges {
  @Input() annotations: Annotation[] = [];
  @Input() selectedAnnotationId = signal<number | null>(null);

  readonly conversation = inject(AnnotationConversationService);
  private auth = inject(AuthService);
  private roleService = inject(RoleService);

  /** What has been typed into each thread's reply box, keyed by annotation. */
  private drafts: Record<number, string> = {};
  newComment = '';

  readonly selectFirstHint = $localize`:Tooltip on the disabled Post button@@annotationThread.selectFirstHint:Select an annotation to comment on it`;

  ngOnInit() {
    this.conversation.open(this.annotations);
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['annotations']) this.conversation.open(this.annotations);
  }

  draftFor(annotationId: number): string {
    return this.drafts[annotationId] ?? '';
  }

  setDraft(annotationId: number, said: string) {
    this.drafts[annotationId] = said;
  }

  sendReply(annotationId: number) {
    // The draft is cleared only once the server has it. It used to be
    // cleared on the way out, so a refused reply took the words with it.
    this.conversation.reply(
      annotationId,
      this.draftFor(annotationId),
      () => (this.drafts[annotationId] = ''),
    );
  }

  deleteReply(annotationId: number, reply: AnnotationReply) {
    this.conversation.deleteReply(annotationId, reply);
  }

  /** Replies are deletable by their author, and by anyone granted the right. */
  canDeleteAnyReply(): boolean {
    return this.roleService.can('canDelete');
  }

  currentUser(): string | null {
    return this.auth.username();
  }

  postComment() {
    const annotationId = this.selectedAnnotationId();
    const said = this.newComment.trim();
    if (!annotationId || !said) return;

    this.conversation.reply(annotationId, said, () => (this.newComment = ''));
  }
}
