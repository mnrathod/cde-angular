/**
 * The sentence a reader gets for each HTTP status.
 *
 * <p>This is the only place the mapping lives, and it is the only place
 * deliberately: there used to be two — one in the global error handler and one
 * behind `problemMessage` — and they had already drifted apart on 403, so the
 * same refusal read differently depending on which code path reported it.
 *
 * <p>§1.4 sets the bar each sentence has to clear: what happened, why, and
 * what to do next, never a raw stack trace and never a bare error code. So
 * these assertions are about the shape of the sentence and not only about
 * which function got called — a mapping that returns the right identifier
 * while the text underneath says "Error 403" passes the first kind of test and
 * fails the user.
 *
 * <p>The mapping is also what decides whether a reader is told to retry. That
 * matters more than it looks: telling someone to retry a 403 sends them round
 * a loop that cannot succeed, and not telling them to retry a 503 loses a
 * request that would have gone through a moment later.
 */
import {
  conflictMessage,
  forbiddenMessage,
  invalidRequestMessage,
  messageForStatus,
  notFoundMessage,
  offlineMessage,
  rateLimitedMessage,
  serverErrorMessage,
  sessionExpiredMessage,
  tooLargeMessage,
  unavailableMessage,
  unexplainedFailureMessage,
  validationFailedMessage,
} from "./error-wording";

describe("the wording for a failure", () => {
  describe("every status maps to its own sentence", () => {
    const expected: ReadonlyArray<readonly [number, () => string]> = [
      [0, offlineMessage],
      [400, invalidRequestMessage],
      [401, sessionExpiredMessage],
      [403, forbiddenMessage],
      [404, notFoundMessage],
      [409, conflictMessage],
      [413, tooLargeMessage],
      [422, validationFailedMessage],
      [429, rateLimitedMessage],
      [500, serverErrorMessage],
      [502, unavailableMessage],
      [503, unavailableMessage],
    ];

    for (const [status, sentence] of expected) {
      it(`${status} reads as ${sentence.name}`, () => {
        expect(messageForStatus(status)).toBe(sentence());
      });
    }

    it("a status nothing recognises still says what to do, and quotes the code", () => {
      // The last resort, and still not a bare error code: "Request failed
      // (418)." is exactly what §1.4 forbids. Support asks for the number, so
      // it is there — carried inside a sentence rather than standing as one.
      const message = messageForStatus(418);

      expect(message).toBe(unexplainedFailureMessage(418));
      expect(message).toContain("418");
      expect(message.length).toBeGreaterThan(20);
    });

    it("the code quoted is the one that actually came back", () => {
      // A hardcoded number here would send every caller to support with the
      // same code, which is worse than no code at all.
      expect(messageForStatus(599)).toContain("599");
      expect(messageForStatus(599)).not.toContain("418");
    });
  });

  describe("each sentence is one a reader can act on", () => {
    const everySentence: ReadonlyArray<readonly [string, string]> = [
      ["offline", offlineMessage()],
      ["session expired", sessionExpiredMessage()],
      ["forbidden", forbiddenMessage()],
      ["not found", notFoundMessage()],
      ["invalid request", invalidRequestMessage()],
      ["conflict", conflictMessage()],
      ["too large", tooLargeMessage()],
      ["validation failed", validationFailedMessage()],
      ["rate limited", rateLimitedMessage()],
      ["server error", serverErrorMessage()],
      ["unavailable", unavailableMessage()],
      ["unexplained", unexplainedFailureMessage(502)],
    ];

    for (const [name, sentence] of everySentence) {
      it(`the ${name} sentence is a sentence, not a code`, () => {
        expect(sentence.trim().length).toBeGreaterThan(20);
        expect(sentence).toMatch(/[.!]$/);
      });

      it(`the ${name} sentence names no internals`, () => {
        // A stack frame, a class name or a URL in user-facing text is both a
        // §1.4 failure and a small information leak.
        expect(sentence).not.toMatch(/\bat [A-Z]\w+\./);
        expect(sentence).not.toContain("Error:");
        expect(sentence).not.toContain("undefined");
        expect(sentence).not.toContain("http");
      });
    }
  });

  describe("what a reader is told to do next", () => {
    it("a failure that clears on its own invites a retry", () => {
      // Overloaded and rate-limited both pass. The reader is told to wait
      // rather than to go and find someone, because waiting is what works.
      for (const sentence of [unavailableMessage(), rateLimitedMessage()]) {
        expect(sentence.toLowerCase()).toContain("try again");
      }
    });

    it("being offline sends the reader to their own connection, not to a retry", () => {
      // The distinction is the useful part. Retrying with no network fails
      // identically every time; the thing to do is look at the connection, and
      // this is the one failure whose cause is on the reader's side of the
      // wire.
      expect(offlineMessage().toLowerCase()).toContain("connection");
    });

    it("a permissions failure does not invite a retry, it names who can help", () => {
      // Retrying a 403 is a loop that cannot succeed. The useful next step is a
      // person, and §1.1's rule about teaching rather than apologising applies
      // to a refusal as much as to an empty state.
      const sentence = forbiddenMessage().toLowerCase();

      expect(sentence).not.toContain("try again");
      expect(sentence).toContain("administrator");
    });

    it("a missing thing explains why it might be missing", () => {
      // "Not found" on its own reads as a fault in the application. Saying it
      // may have been moved or deleted tells the reader where to look.
      expect(notFoundMessage().toLowerCase()).toMatch(/moved|deleted/);
    });

    it("a conflict tells the reader to reload first, not to retry blindly", () => {
      // Retrying without reloading overwrites whatever the other person did,
      // which is the one outcome a conflict exists to prevent.
      expect(conflictMessage().toLowerCase()).toContain("reload");
    });

    it("an expired session does not blame the reader for it", () => {
      expect(sessionExpiredMessage().toLowerCase()).toMatch(/sign in|signed out|session/);
    });

    it("a server fault says it is ours", () => {
      // §1.4's tone: the reader did nothing wrong and should not be left
      // checking their own input.
      expect(serverErrorMessage().toLowerCase()).toMatch(/our end|went wrong/);
    });
  });

  describe("no two statuses share a sentence by accident", () => {
    it("the distinct failures read distinctly", () => {
      // A mapping where several statuses collapse onto one sentence looks
      // complete and tells the reader nothing. 502 and 503 are the deliberate
      // exception — both mean "it is not answering, wait" — so they are
      // excluded rather than papered over.
      const sentences = [0, 400, 401, 403, 404, 409, 413, 422, 429, 500, 503].map(
        messageForStatus,
      );

      expect(new Set(sentences).size).toBe(sentences.length);
    });

    it("502 and 503 deliberately share one, because they mean the same thing to a reader", () => {
      expect(messageForStatus(502)).toBe(messageForStatus(503));
    });
  });
});
