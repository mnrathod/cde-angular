/**
 * What happens to a reply the server never accepted.
 *
 * <p>The worst defect in this panel was not that failures were silent —
 * it was that one of them was loud and wrong. A reply that failed to post
 * was invented locally, out of `Date.now()` and the signed-in name, and
 * pushed into the thread, so the reader watched their words appear, closed
 * the panel, and lost them. The comment above it read "show reply locally
 * even if endpoint not ready": a development convenience that shipped.
 */
import { TestBed } from "@angular/core/testing";
import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController, provideHttpClientTesting,
} from "@angular/common/http/testing";

import { Annotation, AnnotationReply } from "../../../core/models";
import { AnnotationConversationService } from "./annotation-conversation.service";

function annotation(id: number): Annotation {
  return {
    id,
    documentId: 1,
    authorName: "A. Surveyor",
    type: "NOTE" as Annotation["type"],
    shapeData: "{}",
    comment: "Check this dimension",
    status: "OPEN",
    pageNumber: 2,
    createdAt: "2026-03-04T09:30:00Z",
  };
}

function reply(id: number, annotationId = 1): AnnotationReply {
  return {
    id,
    annotationId,
    authorName: "B. Engineer",
    content: "Agreed",
    createdAt: "2026-03-04T10:00:00Z",
  };
}

describe("the conversation under an annotation", () => {
  let conversation: AnnotationConversationService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        AnnotationConversationService,
      ],
    });
    conversation = TestBed.inject(AnnotationConversationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  /** Opens one annotation and settles its reply load. */
  function openOne(replies: AnnotationReply[] = []) {
    conversation.open([annotation(1)]);
    httpMock.expectOne("/api/annotations/1/replies").flush(replies);
  }

  function repliesShown(): readonly AnnotationReply[] {
    return conversation.threads()[0]?.replies ?? [];
  }

  describe("posting a reply", () => {
    it("shows the reply the server accepted", () => {
      openOne();
      let sent = false;

      conversation.reply(1, "Agreed", () => (sent = true));
      httpMock.expectOne("/api/annotations/1/replies").flush(reply(9));

      expect(repliesShown().map((each) => each.id)).toEqual([9]);
      expect(sent).toBe(true);
    });

    it("shows no reply at all when the server refused one", () => {
      openOne();

      conversation.reply(1, "Agreed", () => undefined);
      httpMock.expectOne("/api/annotations/1/replies")
        .flush({ detail: "Nope" }, { status: 500, statusText: "Server Error" });

      expect(repliesShown()).toEqual([]);
    });

    it("says the reply was not posted", () => {
      openOne();

      conversation.reply(1, "Agreed", () => undefined);
      httpMock.expectOne("/api/annotations/1/replies")
        .flush({ detail: "Nope" }, { status: 500, statusText: "Server Error" });

      expect(conversation.failure()).not.toBe("");
    });

    it("does not report the reply as sent when it was not", () => {
      // The callback is what clears the box the words are still sitting in.
      openOne();
      let sent = false;

      conversation.reply(1, "Agreed", () => (sent = true));
      httpMock.expectOne("/api/annotations/1/replies")
        .flush({ detail: "Nope" }, { status: 500, statusText: "Server Error" });

      expect(sent).toBe(false);
    });

    it("ignores an empty reply rather than asking the server about it", () => {
      openOne();

      conversation.reply(1, "   ", () => undefined);

      httpMock.verify();
    });
  });

  describe("marking an annotation resolved", () => {
    it("takes the annotation the server hands back", () => {
      openOne();

      conversation.resolve(1);
      httpMock.expectOne("/api/annotations/1/resolve")
        .flush({ ...annotation(1), status: "RESOLVED" });

      expect(conversation.threads()[0]?.annotation.status).toBe("RESOLVED");
    });

    it("says so when it is refused, rather than looking unclicked", () => {
      // This branch did not exist: a refused resolve was indistinguishable
      // from a button that had not been pressed.
      openOne();

      conversation.resolve(1);
      httpMock.expectOne("/api/annotations/1/resolve")
        .flush({ detail: "Nope" }, { status: 403, statusText: "Forbidden" });

      expect(conversation.failure()).not.toBe("");
    });
  });

  describe("deleting a reply", () => {
    it("removes it once the server has", () => {
      openOne([reply(9)]);

      conversation.deleteReply(1, reply(9));
      httpMock.expectOne("/api/annotations/replies/9").flush(null);

      expect(repliesShown()).toEqual([]);
    });

    it("leaves it in place, and says so, when the server refuses", () => {
      openOne([reply(9)]);

      conversation.deleteReply(1, reply(9));
      httpMock.expectOne("/api/annotations/replies/9")
        .flush({ detail: "Nope" }, { status: 403, statusText: "Forbidden" });

      expect(repliesShown().map((each) => each.id)).toEqual([9]);
      expect(conversation.failure()).not.toBe("");
      expect(conversation.deletingReplyId()).toBeNull();
    });
  });

  describe("loading the replies", () => {
    it("says when they could not be read, rather than showing an empty thread", () => {
      conversation.open([annotation(1)]);
      httpMock.expectOne("/api/annotations/1/replies")
        .flush({ detail: "Nope" }, { status: 500, statusText: "Server Error" });

      expect(conversation.failure()).not.toBe("");
    });
  });
});
