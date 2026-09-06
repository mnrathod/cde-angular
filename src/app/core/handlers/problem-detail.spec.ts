import { problemDetail, problemTraceId, problemMessage } from './problem-detail';

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

  it('reads a registration conflict, whatever status carries it', () => {
    // The registration form used to look for a 400 with a plain string body,
    // which is what the endpoint returned before errors became problem
    // documents. A duplicate username now comes back as a 409 document, so
    // that branch stopped matching and the two failures the server explains
    // most precisely were the two the user was told nothing about. Reading the
    // document rather than the status is what stops that recurring.
    expect(problemDetail({
      status: 409,
      error: {
        type: '/problems/username-taken',
        title: 'Username taken',
        status: 409,
        detail: 'That username is already in use. Choose another.'
      }
    }, 'Could not create the account.'))
      .toBe('That username is already in use. Choose another.');
  });
});

/**
 * Two failures reported from a running instance — "OCR failed." and "Could not
 * load version history." — were both the caller's own fallback, which is what
 * these render whenever the response carries no problem document. Version
 * history is a plain database read and OCR needs the converter, so the two
 * cannot share a cause inside the features they name; the fallback was
 * describing the feature the user pressed rather than what actually happened.
 *
 * These pin the cases where naming the feature is a lie.
 */
describe('problemMessage', () => {

  const problem = (body: unknown) => ({ error: body });

  it('says the server was unreachable rather than blaming the feature', () => {
    // status 0 is HttpClient's report that the request never arrived. Rendering
    // "OCR failed." here sends the reader to look at OCR, which was never asked
    // to do anything.
    expect(problemMessage({ status: 0, error: null }, 'OCR failed.'))
      .toBe('Cannot connect to server. Check your network connection.');
  });

  it('says the session expired rather than blaming the feature', () => {
    expect(problemMessage({ status: 401, error: null }, 'Could not load version history.'))
      .toBe('Your session has expired. Please sign in again.');
  });

  it('says the permission is missing rather than blaming the feature', () => {
    expect(problemMessage({ status: 403, error: null }, 'OCR failed.'))
      .toBe('You do not have permission to perform this action.');
  });

  it('quotes the reference when the server sent one', () => {
    expect(problemMessage({
      status: 422,
      error: {
        title: 'Validation failed',
        detail: 'The document has no page 4.',
        traceId: '7c1d9f0a3b2e5d4c6a8f1e0d9c7b5a3f'
      }
    }, 'Pages could not be changed.'))
      .toBe('The document has no page 4. Reference 7c1d9f0a3b2e5d4c6a8f1e0d9c7b5a3f.');
  });

  it('offers no reference when the server sent none', () => {
    // An invented or empty reference wastes a support search.
    expect(problemMessage({ status: 409, error: { detail: 'Already signed.' } },
                          'Signing failed.'))
      .toBe('Already signed.');
  });

  it('still falls back when a 500 carries no problem document', () => {
    // The fallback is not wrong here — the request reached the feature and the
    // feature failed. It is only wrong for the statuses above.
    expect(problemMessage({ status: 500, error: null }, 'OCR failed.'))
      .toBe('OCR failed.');
  });

  it('survives a null or undefined error', () => {
    expect(problemMessage(null, 'OCR failed.')).toBe('OCR failed.');
    expect(problemMessage(undefined, 'OCR failed.')).toBe('OCR failed.');
  });
});
