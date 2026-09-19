/**
 * Keeping an open document in step with what other people are doing to it.
 *
 * <p>Out of the shell component because it is a subscription with a lifetime
 * and a timer to stop, and a component that also has to remember to tear
 * those down on the way out is a component with two jobs (§3.3).
 *
 * <p>Provided per viewer: leaving the document must tear the socket down,
 * not leave it announcing a presence that has gone.
 */
import { Injectable, inject } from "@angular/core";

import { AuthService } from "../../core/services/auth.service";
import {
  CollaborationEvent,
  CollaborationService,
} from "../../core/services/collaboration.service";
import { ViewerDocumentLoader } from "./viewer-document-loader";
import { ViewerStateService } from "../../../viewer-core/viewer-state.service";

/**
 * How often a pointer nobody has moved is taken off the page.
 *
 * <p>Cursors expire rather than being cleared on a signal: someone who stops
 * moving has not left, but a pointer frozen where they last were is
 * misleading.
 */
const CURSOR_EXPIRY_INTERVAL_MS = 2000;

/** The events that mean this document's annotations have changed. */
const ANNOTATION_EVENTS = [
  "ANNOTATION_CREATED",
  "ANNOTATION_UPDATED",
  "ANNOTATION_DELETED",
  "ANNOTATION_RESOLVED",
  "REPLY_ADDED",
];

@Injectable()
export class RemoteDocumentChanges {
  private collaboration = inject(CollaborationService);
  private loader = inject(ViewerDocumentLoader);
  private state = inject(ViewerStateService);
  private auth = inject(AuthService);

  private cursorTimer?: ReturnType<typeof setInterval>;
  private unsubscribe?: () => void;

  watch(documentId: number): void {
    this.collaboration.connect(documentId);
    this.unsubscribe = this.collaboration.onEvent((event) => this.apply(event));
    this.cursorTimer = setInterval(
      () => this.collaboration.pruneStaleCursors(),
      CURSOR_EXPIRY_INTERVAL_MS,
    );
  }

  stop(): void {
    this.unsubscribe?.();
    if (this.cursorTimer) clearInterval(this.cursorTimer);
    this.collaboration.disconnect();
  }

  /**
   * Applies a change someone else made.
   *
   * <p>Annotation events reload the document's annotations rather than
   * patching the local list from the payload: the list is small, and
   * re-reading it cannot drift out of step with the server the way a
   * sequence of incremental patches can.
   */
  private apply(event: CollaborationEvent): void {
    if (event.actor && event.actor === this.auth.username()) return;

    if (ANNOTATION_EVENTS.includes(event.type)) {
      this.loader.loadAnnotations(this.state.documentId());
      return;
    }

    if (event.type === "VERSION_COMMITTED") {
      // The bytes this viewer is showing have been replaced. Reload, and say
      // who did it — the page changing underneath you with no explanation is
      // alarming.
      this.state.processingMessage.set(versionNotice(event, this.state.currentVersion()));
      this.state.applyVersionCommit(event.version ?? this.state.currentVersion());
    }
  }
}

/**
 * Says who replaced the document under you, and what they did.
 *
 * <p>One message with placeholders. It was three fragments joined with a
 * dash — hardcoded English in a .ts file, which the template sweep cannot
 * see — and the word order does not survive translation.
 */
function versionNotice(
  event: CollaborationEvent,
  currentVersion: number,
): string {
  const version = event.version ?? currentVersion;
  const actor = event.actor ?? "";
  const summary =
    event.summary ??
    $localize`:Stands in for a change summary the server did not send@@viewerShell.documentUpdated:document updated`;
  return $localize`:Says who committed a new version of the document while it was open, and what changed@@viewerShell.versionCommitted:v${version}:version: by ${actor}:actor: — ${summary}:summary:`;
}
