import { describe, expect, it } from 'vitest';
import { definitely } from './definitely';

/**
 * The helper that stands in for a non-null assertion across the specs.
 *
 * <p>Worth its own tests precisely because it is load-bearing: if it returned
 * a default instead of throwing, every assertion written through it would
 * quietly pass on absent data, and there are dozens of those.
 */
describe('definitely', () => {

  it('returns a present value unchanged', () => {
    expect(definitely('a')).toBe('a');
    expect(definitely(0)).toBe(0);
  });

  it('passes through values that are falsy but present', () => {
    // The check is against undefined and null specifically, not falsiness.
    // An empty string or a zero is a real value, and a helper that rejected
    // them would fail tests asserting exactly those.
    expect(definitely('')).toBe('');
    expect(definitely(false)).toBe(false);
    expect(definitely(0)).toBe(0);
  });

  it('throws on undefined rather than returning anything', () => {
    expect(() => definitely(undefined)).toThrow(/present/);
  });

  it('throws on null', () => {
    expect(() => definitely(null)).toThrow(/present/);
  });

  it('names what was missing, so a failure points somewhere', () => {
    // The whole reason this exists rather than `!`: a TypeError deep in a
    // component says nothing about which expectation was being set up.
    expect(() => definitely(undefined, 'draft page 3')).toThrow(/draft page 3/);
  });
});
