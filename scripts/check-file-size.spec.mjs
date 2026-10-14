/**
 * Tests for the file-size gate.
 *
 * <p>The rules matter more than the measuring here. A size gate is trivial to
 * write and easy to write so that it cannot fail — a baseline that is allowed
 * to grow, a limit applied to the wrong kind of file, a line count out by one —
 * and a gate that cannot fail is worse than no gate, because its clean report
 * is evidence of nothing.
 */
import { describe, it, expect } from 'vitest';

import {
  COMPONENT_LIMIT,
  FILE_LIMIT,
  assessSizes,
  countLines,
  limitFor,
} from './check-file-size.mjs';

describe('which limit applies', () => {
  it('gives an Angular component the tighter limit', () => {
    expect(limitFor('src/app/thing/thing.component.ts')).toBe(COMPONENT_LIMIT);
  });

  it('gives every other file the file limit', () => {
    expect(limitFor('src/app/core/document.service.ts')).toBe(FILE_LIMIT);
    expect(limitFor('scripts/check-labels.mjs')).toBe(FILE_LIMIT);
  });

  it("gives a component's spec the file limit, not the component's", () => {
    // A 600-line spec held to 200 lines because of what it tests would make
    // the gate look absurd, which is its own way of getting it switched off.
    expect(limitFor('src/app/thing/thing.component.spec.ts')).toBe(FILE_LIMIT);
  });
});

describe('counting lines', () => {
  it('counts the way wc -l does, so a hand-checked figure agrees', () => {
    expect(countLines('one\ntwo\nthree\n')).toBe(3);
  });

  it('counts a last line with no newline on the end', () => {
    expect(countLines('one\ntwo')).toBe(2);
  });

  it('counts an empty file as nothing', () => {
    expect(countLines('')).toBe(0);
  });
});

describe('what fails a build', () => {
  const noBaseline = new Map();

  it('reports a file over the limit', () => {
    const problems = assessSizes(
      new Map([['src/app/big.service.ts', 401]]),
      noBaseline,
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('src/app/big.service.ts: 401');
  });

  it('reports a component over the tighter limit', () => {
    const problems = assessSizes(
      new Map([['src/app/big.component.ts', 201]]),
      noBaseline,
    );

    expect(problems[0]).toContain('limit 200');
  });

  it('passes a file exactly on the limit', () => {
    // Off-by-one here would fail a file that complies, and a gate that fails
    // on compliant code gets its limit raised rather than obeyed.
    expect(assessSizes(new Map([['src/app/a.ts', 400]]), noBaseline)).toEqual([]);
    expect(
      assessSizes(new Map([['src/app/a.component.ts', 200]]), noBaseline),
    ).toEqual([]);
  });

  it('says nothing about a file that is comfortably short', () => {
    expect(assessSizes(new Map([['src/app/a.ts', 12]]), noBaseline)).toEqual([]);
  });
});

describe('the baseline, which is only allowed to shrink', () => {
  const baseline = new Map([['src/app/legacy.service.ts', 500]]);

  it('allows a file recorded as over the limit to stay as it is', () => {
    expect(
      assessSizes(new Map([['src/app/legacy.service.ts', 500]]), baseline),
    ).toEqual([]);
  });

  it('allows it to shrink without the baseline being updated first', () => {
    expect(
      assessSizes(new Map([['src/app/legacy.service.ts', 450]]), baseline),
    ).toEqual([]);
  });

  it('fails when a file on the baseline grows by even one line', () => {
    // The whole point. Without this the baseline is a permanent exemption and
    // the file grows forever.
    const problems = assessSizes(
      new Map([['src/app/legacy.service.ts', 501]]),
      baseline,
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('have grown');
    expect(problems[0]).toContain('501, was 500');
  });

  it('fails until an entry for a now-compliant file is deleted', () => {
    // So the baseline cannot quietly keep names that no longer belong on it,
    // which is how it would come to describe a codebase that no longer exists.
    const problems = assessSizes(
      new Map([['src/app/legacy.service.ts', 399]]),
      baseline,
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('must come off the baseline');
  });

  it('fails when the baseline names a file that is gone', () => {
    const problems = assessSizes(new Map([['src/app/other.ts', 10]]), baseline);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('no longer exist');
  });

  it('still reports a file that is over the limit and not on the baseline', () => {
    const problems = assessSizes(
      new Map([
        ['src/app/legacy.service.ts', 500],
        ['src/app/new.service.ts', 420],
      ]),
      baseline,
    );

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('src/app/new.service.ts');
  });
});
