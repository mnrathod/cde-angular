/**
 * Tests for the gate that holds the embed protocol's three self-descriptions
 * to each other.
 *
 * <p>The defect it was written for: `viewer.resized` was declared in the
 * union, documented in the authority's event table with a payload shape and
 * advice on when to ignore it, and sent by nothing. The first case below is
 * that defect, written out, because a gate that cannot fail on the thing it
 * was built for is worse than no gate.
 */
import { describe, it, expect } from 'vitest';
import {
  assessProtocol,
  declaredTypes,
  documentedTypes,
  sentTypes,
} from './check-embed-protocol.mjs';

/** A protocol whose three lists agree, for a case to break one of. */
function consistent() {
  const types = ['viewer.loaded', 'viewer.ready'];
  return { declared: [...types], sent: [...types], documented: [...types] };
}

describe('assessProtocol', () => {
  it('passes when all three lists agree', () => {
    expect(assessProtocol(consistent())).toEqual([]);
  });

  it('refuses a type that is declared and documented but never sent', () => {
    // The original defect. A host wires a handler and waits for ever.
    const protocol = consistent();
    protocol.declared.push('viewer.resized');
    protocol.documented.push('viewer.resized');

    const problems = assessProtocol(protocol);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('viewer.resized');
    expect(problems[0]).toContain('sent by no production code');
  });

  it('refuses a type the viewer sends that hosts cannot discover', () => {
    const protocol = consistent();
    protocol.declared.push('viewer.quiet');
    protocol.sent.push('viewer.quiet');

    const problems = assessProtocol(protocol);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('no row in');
  });

  it('refuses a documented type the code has no name for', () => {
    const protocol = consistent();
    protocol.documented.push('viewer.imagined');

    const problems = assessProtocol(protocol);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('promises an event the code has no name for');
  });

  it('refuses a type sent from outside the union', () => {
    // Sent only. Documenting it as well would also, and correctly, trip the
    // "documented but not declared" rule — this case is about the send.
    const protocol = consistent();
    protocol.sent.push('viewer.smuggled');

    const problems = assessProtocol(protocol);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('outside the union is outside the protocol');
  });

  it('reports every disagreement rather than stopping at the first', () => {
    // A build log that names one of three problems costs two more builds.
    const protocol = consistent();
    protocol.declared.push('viewer.unsent');
    protocol.documented.push('viewer.imagined');

    expect(assessProtocol(protocol).length).toBeGreaterThan(2);
  });
});

describe('declaredTypes', () => {
  it('reads the union', () => {
    const source = `
      export type ViewerMessageType =
        | 'viewer.ready' | 'viewer.opened'
        | 'viewer.loaded';
    `;

    expect(declaredTypes(source)).toEqual([
      'viewer.loaded',
      'viewer.opened',
      'viewer.ready',
    ]);
  });

  it('ignores event-shaped strings outside the union', () => {
    // Reading the whole file for anything quoted would invent members from
    // comments and from unrelated code, and a phantom member fails the build
    // with a message nobody can act on.
    const source = `
      export type ViewerMessageType =
        | 'viewer.ready';
      const unrelated = 'viewer.notAMember';
    `;

    expect(declaredTypes(source)).toEqual(['viewer.ready']);
  });

  it('returns nothing when the union is not there, so the caller can refuse', () => {
    expect(declaredTypes('export type Something = string;')).toEqual([]);
  });
});

describe('sentTypes', () => {
  it('finds the types production code sends', () => {
    const files = [
      { path: 'src/a.ts', text: "this.channel.send('viewer.loaded', {});" },
      { path: 'src/b.ts', text: "send( 'viewer.ready', {})" },
    ];

    expect(sentTypes(files)).toEqual(['viewer.loaded', 'viewer.ready']);
  });

  it('ignores specs, which send events the protocol deliberately lacks', () => {
    // protocol-conversation.spec.ts posts a `viewer.futureEvent` to prove a
    // host tolerates one it does not know. Counting it would let a
    // declared-but-unsent event be covered by the test proving it unknown.
    const files = [
      { path: 'src/a.spec.ts', text: "send('viewer.futureEvent', {})" },
    ];

    expect(sentTypes(files)).toEqual([]);
  });
});

describe('documentedTypes', () => {
  it('reads the event table', () => {
    const markdown = [
      '| `viewer.ready` | `{ version }` | Handshake |',
      '| `viewer.loaded` | `{ pageCount }` | It rendered |',
    ].join('\n');

    expect(documentedTypes(markdown)).toEqual(['viewer.loaded', 'viewer.ready']);
  });

  it('does not count a mention in prose as a row', () => {
    // A caveat naming an event is not a row telling a host its payload, and
    // treating prose as documentation would let a deleted row pass.
    const markdown = 'A host that sizes to content should ignore `viewer.resized`.';

    expect(documentedTypes(markdown)).toEqual([]);
  });
});
