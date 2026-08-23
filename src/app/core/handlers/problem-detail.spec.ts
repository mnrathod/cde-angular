import { problemDetail, problemTraceId } from './problem-detail';

/**
 * The API returns RFC 9457 problem documents, where the readable text is
 * `detail`. It used to be `message`, and every call site that still read that
 * name silently fell through to a generic fallback — the server's actual
 * explanation was there and simply not shown. These pin the field names so
 * that cannot happen again quietly.
 */
describe('problemDetail', () => {

  const problem = (body: unknown) => ({ error: body });

  it('reads the detail from a problem document', () => {
    expect(problemDetail(problem({
      type: '/problems/validation-failed',
      title: 'Validation failed',
      status: 422,
      detail: 'A document must keep at least one page.',
      traceId: '4f8a1c2e9b7d6a5f3e2d1c0b9a8f7e6d'
    }), 'fallback')).toBe('A document must keep at least one page.');
  });

  it('falls back to the title when there is no detail', () => {
    expect(problemDetail(problem({ title: 'Conflict' }), 'fallback')).toBe('Conflict');
  });

  it('uses the caller fallback when the body carries neither', () => {
    expect(problemDetail(problem({ status: 500 }), 'Something went wrong.'))
      .toBe('Something went wrong.');
  });

  it('uses the caller fallback for a body that is not a problem document', () => {
    // A proxied error, a gateway page, a truncated response — none of these
    // are problem documents, and none should reach a user as raw text.
    expect(problemDetail(problem('<html>502 Bad Gateway</html>'), 'Service unavailable.'))
      .toBe('Service unavailable.');
  });

  it('ignores a detail that is present but blank', () => {
    expect(problemDetail(problem({ detail: '   ' }), 'fallback')).toBe('fallback');
  });

  it('survives a null or undefined error', () => {
    expect(problemDetail(null, 'fallback')).toBe('fallback');
    expect(problemDetail(undefined, 'fallback')).toBe('fallback');
  });

  it('reads the trace id a user can quote to support', () => {
    expect(problemTraceId(problem({ traceId: '4f8a1c2e9b7d6a5f3e2d1c0b9a8f7e6d' })))
      .toBe('4f8a1c2e9b7d6a5f3e2d1c0b9a8f7e6d');
  });

  it('reports no trace id rather than an empty one when the body has none', () => {
    expect(problemTraceId(problem({ detail: 'x' }))).toBeNull();
    expect(problemTraceId(null)).toBeNull();
  });
});
