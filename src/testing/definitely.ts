/**
 * Narrows an optional to its value, failing loudly if it is absent.
 *
 * <p>Under `noUncheckedIndexedAccess` every indexed access is possibly
 * undefined, including in tests where an assertion two lines earlier has
 * already established the length. There are three ways to satisfy the
 * compiler there and only one of them is right:
 *
 * - A non-null assertion (`entries[0]!.title`) silences the compiler and, when
 *   the array really is empty, produces a `TypeError: Cannot read properties
 *   of undefined` that says nothing about which expectation failed.
 * - An early return (`if (!first) return;`) turns a failing test into a
 *   *passing* one, which is worse than the original problem.
 * - This: assert presence, get a typed value, and fail with a message naming
 *   what was missing.
 *
 * Test-only. Application code should handle absence rather than assert it.
 */
export function definitely<T>(value: T | undefined | null, what = 'value'): T {
  if (value === undefined || value === null) {
    throw new Error(`Expected ${what} to be present, but it was ${String(value)}`);
  }
  return value;
}
