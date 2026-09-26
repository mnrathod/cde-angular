/**
 * The conversation under a document's annotations.
 *
 * <p>Out of the component because none of it is rendering, and because the
 * component reached past `AnnotationService` to `HttpClient` for the one
 * call it forgot the service already had (§3.3 — components render and
 * dispatch).
 *
 * <p>**A failed reply used to be shown as a posted one.** The error branch
 * built a reply out of `Date.now()` and the signed-in name and pushed it
 * into the thread, so the reader watched their words appear, closed the
 * panel, and lost them. The comment above it read "show reply locally even
 * if endpoint not ready" — a development convenience that shipped. Nothing
 * is invented here: a request that fails says so.
 */
import { Injectable, inject, signal } from "@angular/core";

import { Annotation, AnnotationReply, AnnotationThread } from "../../../core/models";
import { AnnotationService } from "../../../core/services/viewer/annotation.service";
import { problemMessage } from "../../../core/handlers/problem-detail";

@Injectable()
export class AnnotationConversationService {
  private annotations = inject(AnnotationService);

  readonly threads = signal<readonly AnnotationThread[]>([]);
  readonly deletingReplyId = signal<number | null>(null);
  readonly failure = signal("");

  /**
   * Rebuilds the threads for these annotations and loads their replies.
   *
   * <p>One request for the whole panel. This used to make one per annotation
   * — an N+1 against §7.2's "one screen, one request", so a drawing with
   * forty comments opened forty connections, and a reader on a slow link
   * watched the threads fill in one at a time. The server now answers with
   * every reply on the document at once, each carrying the annotation it
   * belongs to, so grouping happens here.
   *
   * <p>A failure is still reported rather than shown as an absence: a thread
   * whose replies could not be loaded says so, instead of looking like a
   * thread nobody has replied to.
   */
  open(annotations: readonly Annotation[]): void {
    this.failure.set("");
    this.threads.set(annotations.map((annotation) => ({ annotation, replies: [] })));
    if (annotations.length === 0) return;

    this.annotations.loadRepliesForDocument(documentIdOf(annotations)).subscribe({
      next: (replies) => this.threads.update((threads) =>
        threads.map((thread) => ({
          ...thread,
          replies: replies.filter((reply) => reply.annotationId === thread.annotation.id),
        }))),
      error: (err: unknown) => this.report(
        err,
        $localize`:Shown when the replies under an annotation cannot be loaded@@annotationThread.repliesUnavailable:Some replies could not be loaded. They may still be there — reopen this panel to try again.`,
      ),
    });
  }

  reply(annotationId: number, content: string, onSent: () => void): void {
    const said = content.trim();
    if (!said) return;
    this.failure.set("");

    this.annotations.addReply(annotationId, said).subscribe({
      next: (reply) => {
        this.replaceReplies(annotationId, (replies) => [...replies, reply]);
        onSent();
      },
      error: (err: unknown) => this.report(
        err,
        $localize`:Shown when a reply to an annotation could not be posted@@annotationThread.replyFailed:Your reply was not posted. It is still in the box — try again.`,
      ),
    });
  }

  deleteReply(annotationId: number, reply: AnnotationReply): void {
    this.deletingReplyId.set(reply.id);
    this.failure.set("");

    this.annotations.deleteReply(reply.id).subscribe({
      next: () => {
        this.deletingReplyId.set(null);
        this.replaceReplies(annotationId, (replies) =>
          replies.filter((each) => each.id !== reply.id));
      },
      error: (err: unknown) => {
        this.deletingReplyId.set(null);
        this.report(
          err,
          $localize`:Shown when a reply could not be deleted@@annotationThread.deleteReplyFailed:That reply could not be deleted.`,
        );
      },
    });
  }

  resolve(annotationId: number): void {
    this.failure.set("");
    this.annotations.resolveAnnotation(annotationId).subscribe({
      next: (updated) => this.threads.update((threads) =>
        threads.map((thread) =>
          thread.annotation.id === updated.id ? { ...thread, annotation: updated } : thread)),
      // This had no error branch at all, so marking a thread resolved and
      // being refused looked exactly like nothing having been clicked.
      error: (err: unknown) => this.report(
        err,
        $localize`:Shown when an annotation could not be marked resolved@@annotationThread.resolveFailed:That annotation could not be marked as resolved.`,
      ),
    });
  }

  private replaceReplies(
    annotationId: number,
    next: (replies: readonly AnnotationReply[]) => AnnotationReply[],
  ): void {
    this.threads.update((threads) =>
      threads.map((thread) =>
        thread.annotation.id === annotationId
          ? { ...thread, replies: next(thread.replies) }
          : thread));
  }

  private report(err: unknown, fallback: string): void {
    this.failure.set(problemMessage(err, fallback));
  }
}

/**
 * Which document this panel is showing.
 *
 * <p>Taken from the markup rather than passed in, because the panel is
 * opened with the annotations it is about and every one of them belongs to
 * the same document — the viewer shows one at a time. Reading it off the
 * first is not a shortcut: there is no second document it could be.
 */
function documentIdOf(annotations: readonly Annotation[]): number {
  return annotations[0]!.documentId;
}
