import { afterEach, describe, it, expect, vi } from 'vitest';
import { runInNewContext } from 'node:vm';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  AbortError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  ContextError,
  GoneError,
  NetworkError,
  NotFoundError,
  PayloadTooLargeError,
  RateLimitError,
  ResponseParseError,
  RtlsError,
  ServerError,
  ServiceUnavailableError,
  StreamError,
  TimeoutError,
  UnsupportedMediaTypeError,
  ValidationError,
  createError,
} from '../../../src';
import { ContextError as ContextErrorFromContext } from '../../../src/context';
import {
  coreFixture,
  fixtureErrorBody,
  fixtureHeaders,
  type FixtureEnvelope,
} from './support/core-fixtures';

type ErrorClass = abstract new (...args: never[]) => RtlsError;

describe('error classes (P1 §6.2)', () => {
  describe('status → class (P1 §5.5)', () => {
    const matrix: Array<[number, ErrorClass, string]> = [
      [400, ValidationError, 'VALIDATION_ERROR'],
      [401, AuthenticationError, 'AUTHENTICATION_ERROR'],
      [403, AuthorizationError, 'AUTHORIZATION_ERROR'],
      [404, NotFoundError, 'NOT_FOUND'],
      [409, ConflictError, 'CONFLICT'],
      [410, GoneError, 'GONE'],
      [413, PayloadTooLargeError, 'PAYLOAD_TOO_LARGE'],
      [415, UnsupportedMediaTypeError, 'UNSUPPORTED_MEDIA_TYPE'],
      [418, RtlsError, 'RTLS_ERROR'],
      [422, ValidationError, 'VALIDATION_ERROR'],
      [429, RateLimitError, 'RATE_LIMIT'],
      [500, ServerError, 'SERVER_ERROR'],
      [501, ServerError, 'SERVER_ERROR'],
      [502, ServerError, 'SERVER_ERROR'],
      [503, ServiceUnavailableError, 'SERVICE_UNAVAILABLE'],
      [504, ServerError, 'SERVER_ERROR'],
    ];

    it.each(matrix)('%i → %o with its code and the real status', (status, cls, code) => {
      const err = createError(status, { error: 'Something failed' });
      expect(err).toBeInstanceOf(cls);
      expect(err).toBeInstanceOf(RtlsError);
      expect(err.code).toBe(code);
      expect(err.status).toBe(status);
      expect(err.message).toBe('Something failed');
      expect(err.name).toBe(cls === RtlsError ? 'RtlsError' : cls.name);
    });

    it('418 is a plain RtlsError, not one of the subclasses', () => {
      const err = createError(418, undefined);
      expect(Object.getPrototypeOf(err)).toBe(RtlsError.prototype);
    });

    it('ServiceUnavailableError is a ServerError', () => {
      const err = createError(503, undefined);
      expect(err).toBeInstanceOf(ServerError);
      expect(err).toBeInstanceOf(ServiceUnavailableError);
    });

    it('a 400 keeps status 400 (0.2.0 reported 422, B1)', () => {
      expect(createError(400, { error: 'bad' }).status).toBe(400);
      expect(createError(422, { error: 'bad' }).status).toBe(422);
    });
  });

  describe('isClientError / isServerError / isStatus', () => {
    it.each([
      [0, false, false],
      [399, false, false],
      [400, true, false],
      [404, true, false],
      [499, true, false],
      [500, false, true],
      [503, false, true],
    ])('status %i → client %s, server %s', (status, client, server) => {
      const err = new RtlsError('x', status);
      expect(err.isClientError()).toBe(client);
      expect(err.isServerError()).toBe(server);
      expect(err.isStatus(status)).toBe(true);
      expect(err.isStatus(status + 1)).toBe(false);
    });

    it('errors without a response have status 0 and are neither client nor server errors', () => {
      for (const err of [
        new TimeoutError(),
        new AbortError(),
        new NetworkError(),
        new StreamError('s', { reason: 'network' }),
        new ContextError('Namespace', 'Set it'),
      ]) {
        expect(err.status).toBe(0);
        expect(err.isClientError()).toBe(false);
        expect(err.isServerError()).toBe(false);
      }
    });
  });

  describe('RtlsError.is (brand)', () => {
    const instances: RtlsError[] = [
      new RtlsError('a', 500),
      new ValidationError(),
      new AuthenticationError(),
      new AuthorizationError(),
      new NotFoundError(),
      new ConflictError(),
      new GoneError(),
      new PayloadTooLargeError(),
      new UnsupportedMediaTypeError(),
      new RateLimitError(),
      new ServerError(),
      new ServiceUnavailableError(),
      new TimeoutError(),
      new AbortError(),
      new NetworkError(),
      new ResponseParseError('p', { status: 200 }),
      new StreamError('s', { reason: 'protocol' }),
      new ContextError('Venue ID', 'Set it'),
    ];

    it.each(instances.map((e) => [e.name, e] as const))('true for %s', (_name, err) => {
      expect(RtlsError.is(err)).toBe(true);
    });

    it('true for a foreign-realm object carrying the brand, where instanceof fails', () => {
      const foreign: unknown = runInNewContext(
        'const e = new Error("other realm"); e[Symbol.for("ubudu-rtls-sdk.error")] = true; e'
      );
      expect(foreign instanceof RtlsError).toBe(false);
      expect(RtlsError.is(foreign)).toBe(true);
    });

    it('false for a plain Error, a branded value other than true, and non-objects', () => {
      expect(RtlsError.is(new Error('plain'))).toBe(false);
      expect(RtlsError.is({ [Symbol.for('ubudu-rtls-sdk.error')]: 'yes' })).toBe(false);
      expect(RtlsError.is(null)).toBe(false);
      expect(RtlsError.is(undefined)).toBe(false);
      expect(RtlsError.is('RtlsError')).toBe(false);
      expect(RtlsError.is({ status: 500, code: 'RTLS_ERROR' })).toBe(false);
    });

    it('the brand is not an enumerable own property (errors serialise as before)', () => {
      const err = new NotFoundError('gone');
      expect(Object.keys(err)).not.toContain(Symbol.for('ubudu-rtls-sdk.error').toString());
      expect(Object.getOwnPropertySymbols(err)).toEqual([]);
    });
  });

  describe('ContextError', () => {
    it('is an RtlsError with status 0 and code CONTEXT_ERROR, also when imported from context.ts', () => {
      const err = new ContextError('Namespace', 'Pass it');
      expect(err).toBeInstanceOf(RtlsError);
      expect(err).toBeInstanceOf(Error);
      expect(ContextErrorFromContext).toBe(ContextError);
      expect(err.status).toBe(0);
      expect(err.code).toBe('CONTEXT_ERROR');
      expect(err.name).toBe('ContextError');
    });

    it('keeps the 0.2.0 message for a missing value and field/suggestion/problem', () => {
      const err = new ContextError('Venue ID', 'Call client.setVenue(...)');
      expect(err.message).toBe('Venue ID is required. Call client.setVenue(...)');
      expect(err.field).toBe('Venue ID');
      expect(err.suggestion).toBe('Call client.setVenue(...)');
      expect(err.problem).toBe('missing');
    });

    it("problem 'invalid' gives the 'is invalid' message", () => {
      const err = new ContextError('Map ID', 'Pass a non-negative integer', 'invalid');
      expect(err.message).toBe('Map ID is invalid. Pass a non-negative integer');
      expect(err.problem).toBe('invalid');
    });
  });

  describe('NetworkError', () => {
    it('keeps the cause and the deprecated networkCause alias', () => {
      const cause = new TypeError('fetch failed');
      const err = new NetworkError('fetch failed', cause);
      expect(err.cause).toBe(cause);
      expect(err.networkCause).toBe(cause);
      expect(err.code).toBe('NETWORK_ERROR');
      expect(err.status).toBe(0);
    });

    it('networkCause is undefined when the cause is not an Error', () => {
      const err = new NetworkError('x', 'a string');
      expect(err.cause).toBe('a string');
      expect(err.networkCause).toBeUndefined();
    });

    it('defaults its message', () => {
      expect(new NetworkError().message).toBe('Network error');
    });
  });

  describe('0.2.0 constructor forms still compile and run', () => {
    it('RtlsError(message, status, body, code)', () => {
      const err = new RtlsError('Test error', 500, { detail: 'test' }, 'CUSTOM');
      expect(err.message).toBe('Test error');
      expect(err.status).toBe(500);
      expect(err.body).toEqual({ detail: 'test' });
      expect(err.code).toBe('CUSTOM');
      expect(err.name).toBe('RtlsError');
    });

    it('RtlsError(message, status) defaults code RTLS_ERROR and body undefined', () => {
      const err = new RtlsError('x', 418);
      expect(err.code).toBe('RTLS_ERROR');
      expect(err.body).toBeUndefined();
    });

    it('subclass (message?, body?) forms keep their defaults', () => {
      expect(new AuthenticationError().message).toBe('Authentication failed');
      expect(new AuthorizationError().message).toBe('Access denied');
      expect(new NotFoundError('nf', { error: 'x' }).body).toEqual({ error: 'x' });
      const v = new ValidationError('Validation failed', { errors: { name: ['required'] } });
      expect(v.status).toBe(422);
      expect(v.errors).toEqual({ name: ['required'] });
      expect(new TimeoutError().message).toBe('Request timed out');
      expect(new NetworkError('n', new Error('c')).message).toBe('n');
    });

    it('RateLimitError(message, body, retryAfterMs)', () => {
      const err = new RateLimitError('slow down', { error: 'rate_limited' }, 17_000);
      expect(err.retryAfter).toBe(17_000);
      expect(err.status).toBe(429);
    });

    it('ValidationError.errors stays {} unless body.errors is a map', () => {
      expect(new ValidationError('x', { errors: ['a'] }).errors).toEqual({});
      expect(
        new ValidationError('x', { error: 'Validation error', details: ['a'] }).errors
      ).toEqual({});
      expect(new ValidationError('x').errors).toEqual({});
    });
  });

  describe('init form', () => {
    it("client-side validation: new ValidationError(m, undefined, { status: 0, details }) → status 0, code 'VALIDATION_ERROR'", () => {
      const err = new ValidationError('limit must be an integer >= 1', undefined, {
        status: 0,
        details: ['limit'],
      });
      expect(err.status).toBe(0);
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.details).toEqual(['limit']);
      expect(err.body).toBeUndefined();
      expect(err).toBeInstanceOf(ValidationError);
    });

    it('init.code overrides the class code while instanceof holds (StreamError subclass)', () => {
      class WebSocketTestError extends StreamError {
        constructor(message: string) {
          super(message, { reason: 'network', code: 'WEBSOCKET_TEST', status: 1006 });
          this.name = 'WebSocketTestError';
        }
      }
      const err = new WebSocketTestError('socket dropped');
      expect(err).toBeInstanceOf(StreamError);
      expect(err).toBeInstanceOf(RtlsError);
      expect(err.code).toBe('WEBSOCKET_TEST');
      expect(err.status).toBe(1006);
      expect(err.reason).toBe('network');
      expect(RtlsError.is(err)).toBe(true);
    });

    it('new TimeoutError(undefined, { timeoutMs: 5, body: { attempts: 2 } }) keeps the default message', () => {
      const err = new TimeoutError(undefined, { timeoutMs: 5, body: { attempts: 2 } });
      expect(err.message).toBe('Request timed out');
      expect(err.timeoutMs).toBe(5);
      expect((err.body as { attempts: number }).attempts).toBe(2);
      expect(err.status).toBe(0);
      expect(err.code).toBe('TIMEOUT');
    });

    it('init fields override the class defaults: status, apiCode, details, retryAfter, body, cause', () => {
      const cause = new Error('root');
      const err = new ServerError(
        'boom',
        { positional: true },
        {
          status: 502,
          apiCode: 'upstream',
          details: ['d1'],
          retryAfter: 2000,
          body: { fromInit: true },
          cause,
        }
      );
      expect(err.status).toBe(502);
      expect(err.apiCode).toBe('upstream');
      expect(err.details).toEqual(['d1']);
      expect(err.retryAfter).toBe(2000);
      expect(err.body).toEqual({ fromInit: true });
      expect(err.cause).toBe(cause);
    });

    it('an init field set to undefined keeps the class default', () => {
      const err = new NotFoundError('nf', { a: 1 }, { status: undefined, body: undefined });
      expect(err.status).toBe(404);
      expect(err.body).toEqual({ a: 1 });
    });

    it('AbortError keeps the abort reason as cause', () => {
      const reason = new Error('sdk-test-cancel');
      const err = new AbortError(undefined, { cause: reason });
      expect(err.message).toBe('Request aborted');
      expect(err.code).toBe('ABORTED');
      expect(err.cause).toBe(reason);
    });

    it('ResponseParseError carries status and contentType', () => {
      const err = new ResponseParseError('bad json', {
        status: 200,
        contentType: 'application/json',
        body: '{bad',
      });
      expect(err.status).toBe(200);
      expect(err.contentType).toBe('application/json');
      expect(err.code).toBe('RESPONSE_PARSE_ERROR');
      expect(err.body).toBe('{bad');
    });

    it('StreamError carries its reason and defaults status 0', () => {
      const err = new StreamError('idle', { reason: 'idle_timeout' });
      expect(err.reason).toBe('idle_timeout');
      expect(err.status).toBe(0);
      expect(err.code).toBe('STREAM_ERROR');
    });

    it('apiCode, details and retryAfter are absent unless given', () => {
      const err = new RtlsError('x', { status: 500 });
      expect(Object.prototype.hasOwnProperty.call(err, 'apiCode')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(err, 'details')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(err, 'retryAfter')).toBe(false);
      expect(err.cause).toBeUndefined();
    });
  });
});

/** What the transport hands to createError for a fixture: body value, headers and content type. */
function errorFromFixture(f: FixtureEnvelope): RtlsError {
  return createError(f.status ?? 200, fixtureErrorBody(f), { headers: fixtureHeaders(f) });
}

describe('error envelopes (P1 §5.4, fixtures test/fixtures/core)', () => {
  interface Row {
    fixture: string;
    row: string;
    cls: ErrorClass;
    status: number;
    message: string;
    apiCode?: string;
    details?: string[];
  }
  const rows: Row[] = [
    {
      fixture: 'error-e1-not-found',
      row: 'E1',
      cls: NotFoundError,
      status: 404,
      message: 'Dashboard not found',
    },
    {
      fixture: 'error-e1-bad-request',
      row: 'E1',
      cls: ValidationError,
      status: 400,
      message: 'timestampFrom and timestampTo are required parameters',
    },
    {
      fixture: 'error-e1-invalid-id',
      row: 'E1',
      cls: ValidationError,
      status: 400,
      message: 'Invalid dashboard ID',
    },
    {
      fixture: 'error-401',
      row: 'E1',
      cls: AuthenticationError,
      status: 401,
      message: 'Failed to authenticate user',
    },
    {
      fixture: 'error-e2',
      row: 'E2',
      cls: ValidationError,
      status: 400,
      message: 'invalid kind',
      apiCode: 'bad_request',
    },
    {
      fixture: 'error-e2-fields',
      row: 'E2 + fields',
      cls: ValidationError,
      status: 400,
      message: 'Field names under data use a reserved namespace',
      apiCode: 'reserved_field_namespace',
      details: ['data.sensor_x'],
    },
    {
      fixture: 'error-e1c-409',
      row: 'E1c',
      cls: ConflictError,
      status: 409,
      message: 'stale_write',
      apiCode: 'stale_write',
    },
    {
      fixture: 'error-e1c-404',
      row: 'E1c',
      cls: NotFoundError,
      status: 404,
      message: 'not_found',
      apiCode: 'not_found',
    },
    {
      fixture: 'error-e3',
      row: 'E3',
      cls: NotFoundError,
      status: 404,
      message: 'ReportNotFound',
      apiCode: 'ReportNotFound',
    },
    {
      fixture: 'error-e4',
      row: 'E4',
      cls: ValidationError,
      status: 400,
      message: 'Validation error',
      details: ['Path `name` is required.'],
    },
    {
      fixture: 'error-e4b',
      row: 'E4b',
      cls: ServerError,
      status: 500,
      message: 'Failed to retrieve nearest assets',
      details: ['connection reset'],
    },
    {
      fixture: 'error-e5',
      row: 'E5',
      cls: ConflictError,
      status: 409,
      message: 'Your previous request is still being processed.',
      apiCode: 'TURN_IN_FLIGHT',
    },
    {
      fixture: 'error-violations',
      row: 'violations',
      cls: ValidationError,
      status: 400,
      message: 'unbounded size (-1) is not permitted',
      details: ['size=-1'],
    },
    {
      fixture: 'error-tag-actions-500',
      row: 'message-only',
      cls: ServerError,
      status: 500,
      message: 'Some actions failed',
    },
    {
      fixture: 'health-503',
      row: 'E7',
      cls: ServiceUnavailableError,
      status: 503,
      message: 'MongoDB connection not ready',
    },
    {
      fixture: 'error-e10-400',
      row: 'E10',
      cls: ValidationError,
      status: 400,
      message: `SyntaxError: Unexpected token 'b', "bad" is not valid JSON`,
    },
    {
      fixture: 'error-e10-413',
      row: 'E10',
      cls: PayloadTooLargeError,
      status: 413,
      message: 'PayloadTooLargeError: request entity too large',
    },
    {
      fixture: 'error-e9',
      row: 'E9',
      cls: ServerError,
      status: 504,
      message: 'Upstream service unavailable',
    },
    {
      fixture: 'error-e8',
      row: 'E8',
      cls: ServerError,
      status: 500,
      message: 'JSON error: Unexpected token',
    },
    {
      fixture: 'error-e8-noct',
      row: 'E8 (no Content-Type)',
      cls: NotFoundError,
      status: 404,
      message: '404 Not Found',
    },
    {
      fixture: 'error-e12-empty-404',
      row: 'E12',
      cls: NotFoundError,
      status: 404,
      message: 'HTTP 404',
    },
    {
      fixture: 'error-429',
      row: 'E2 + Retry-After',
      cls: RateLimitError,
      status: 429,
      message: 'Too many requests, retry later',
      apiCode: 'rate_limited',
    },
  ];

  it.each(rows.map((r) => [r.row, r.fixture, r] as const))(
    '%s: %s → class, status, message, apiCode, details, body',
    (_row, name, r) => {
      const f = coreFixture(name);
      const err = errorFromFixture(f);
      expect(err).toBeInstanceOf(r.cls);
      expect(err.status).toBe(r.status);
      expect(err.message).toBe(r.message);
      expect(err.apiCode).toBe(r.apiCode);
      expect(err.details).toEqual(r.details);
      expect(err.body).toStrictEqual(fixtureErrorBody(f));
    }
  );

  it('the matrix covers every core error fixture', () => {
    const covered = new Set(rows.map((r) => r.fixture));
    const onDisk = readdirSync(join(__dirname, '..', '..', 'fixtures', 'core'))
      .filter((n) => n.startsWith('error-') && n.endsWith('.json'))
      .map((n) => n.replace(/\.json$/, ''));
    expect(onDisk.filter((n) => !covered.has(n))).toEqual([]);
    expect(onDisk.length).toBeGreaterThanOrEqual(21);
  });

  it('E1c 409 stale_write keeps body.current', () => {
    const err = errorFromFixture(coreFixture('error-e1c-409'));
    expect(err).toBeInstanceOf(ConflictError);
    expect((err.body as { current: { _id: string } }).current._id).toBe('000000000000000000000001');
  });

  it("E1c {error:'DL_017'} 500 → apiCode 'DL_017'", () => {
    const err = createError(500, { error: 'DL_017' });
    expect(err).toBeInstanceOf(ServerError);
    expect(err.apiCode).toBe('DL_017');
    expect(err.message).toBe('DL_017');
  });

  it("E1 {error:'Dashboard not found'} has no apiCode (whitespace: not code-like)", () => {
    expect(createError(404, { error: 'Dashboard not found' }).apiCode).toBeUndefined();
  });

  it('E1c accepts dotted and dashed tokens and rejects tokens that start with a digit', () => {
    expect(createError(400, { error: 'upload.too-large' }).apiCode).toBe('upload.too-large');
    expect(createError(400, { error: '9lives' }).apiCode).toBeUndefined();
    expect(createError(400, { error: 'trailing_' }).apiCode).toBeUndefined();
  });

  it('E2 with fields → details', () => {
    const err = createError(400, {
      error: 'reserved_field_namespace',
      message: 'Reserved',
      fields: ['data.x'],
    });
    expect(err.details).toEqual(['data.x']);
    expect(err.apiCode).toBe('reserved_field_namespace');
  });

  it('E6 {success:false, error} → message from error, no apiCode for human text', () => {
    const err = createError(404, { success: false, error: 'Tag not found' });
    expect(err.message).toBe('Tag not found');
    expect(err.apiCode).toBeUndefined();
  });

  it('{message, code} → message and apiCode; a non-string code is ignored', () => {
    expect(createError(500, { message: 'Human', code: 'X1' })).toMatchObject({
      message: 'Human',
      apiCode: 'X1',
    });
    const err = createError(500, { message: 'Human', code: 5 });
    expect(err.message).toBe('Human');
    expect(err.apiCode).toBeUndefined();
  });

  it('E3 with message and string details → message, apiCode and details from the inner object', () => {
    const err = createError(422, {
      error: { code: 'BadInput', message: 'Bad input', details: ['a', 'b'] },
    });
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.message).toBe('Bad input');
    expect(err.apiCode).toBe('BadInput');
    expect(err.details).toEqual(['a', 'b']);
    expect(createError(422, { error: { code: 'X', details: [1, 2] } }).details).toBeUndefined();
  });

  it('E3 without code or message → fallback message, no apiCode', () => {
    const err = createError(500, { error: {} });
    expect(err.message).toBe('HTTP 500');
    expect(err.apiCode).toBeUndefined();
  });

  it('E11 object without error, message or status → fallback with statusText, body kept', () => {
    const err = createError(500, { outcome: 'failed' }, { statusText: 'Internal Server Error' });
    expect(err.message).toBe('HTTP 500 Internal Server Error');
    expect(err.body).toEqual({ outcome: 'failed' });
  });

  it('fallback without statusText is HTTP <status>; an array or a number body keeps the value', () => {
    expect(createError(502, [1, 2]).message).toBe('HTTP 502');
    expect(createError(502, [1, 2]).body).toEqual([1, 2]);
    expect(createError(400, 42).body).toBe(42);
    expect(createError(400, null).message).toBe('HTTP 400');
  });

  it('empty strings do not count as a message', () => {
    expect(createError(400, { error: '', message: '' }).message).toBe('HTTP 400');
    expect(createError(400, '').message).toBe('HTTP 400');
    expect(createError(400, '').body).toBeUndefined();
  });

  it('details sources: details first, then violations, then fields; non-strings JSON.stringify-ed', () => {
    expect(
      createError(400, { error: 'x', details: ['d'], violations: ['v'], fields: ['f'] }).details
    ).toEqual(['d']);
    expect(
      createError(400, { error: 'x', violations: [{ path: 'size', value: -1 }], fields: ['f'] })
        .details
    ).toEqual(['{"path":"size","value":-1}']);
    expect(createError(400, { error: 'x', fields: ['f', 3] }).details).toEqual(['f', '3']);
    expect(createError(400, { error: 'x', fields: 'not-an-array' }).details).toBeUndefined();
    expect(createError(400, { error: 'x', details: { a: 1 } }).details).toBeUndefined();
  });

  it('ValidationError.errors is filled from a body.errors map only', () => {
    const err = createError(422, { error: 'Validation error', errors: { name: ['required'] } });
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).errors).toEqual({ name: ['required'] });
  });

  describe('HTML bodies (E10)', () => {
    it('a dev-mode stack page → only the first <pre> line, no stack frame', () => {
      const err = errorFromFixture(coreFixture('error-e10-400'));
      expect(err.message).toBe(`SyntaxError: Unexpected token 'b', "bad" is not valid JSON`);
      expect(err.message).not.toMatch(/\bat /);
      expect(err.message).not.toMatch(/[<>\n]/);
      expect(err.message).not.toContain('&nbsp;');
    });

    it('HTML without <pre> → fallback', () => {
      const err = createError(500, '<html><body><h1>Oops</h1></body></html>', {
        contentType: 'text/html',
        statusText: 'Internal Server Error',
      });
      expect(err.message).toBe('HTTP 500 Internal Server Error');
    });

    it('a body starting with < is HTML even without a content type', () => {
      const err = createError(400, '  <pre>Bad Request</pre>');
      expect(err.message).toBe('Bad Request');
    });

    it('decodes named and numeric entities and strips tags inside the line', () => {
      const err = createError(400, '<pre><b>A &amp; B</b> &#x41;&#66; &lt;x&gt; &bogus;</pre>', {
        contentType: 'text/html',
      });
      expect(err.message).toBe('A & B AB <x> &bogus;');
    });

    it('keeps a numeric entity outside the Unicode range as written', () => {
      const err = createError(400, '<pre>x &#x110000; &#1114112; &#x10FFFF;</pre>', {
        contentType: 'text/html',
      });
      expect(err.message).toBe(`x &#x110000; &#1114112; ${String.fromCodePoint(0x10ffff)}`);
    });

    it('skips empty first lines of the <pre> and cuts the line at 200 characters', () => {
      const long = 'x'.repeat(250);
      const err = createError(500, `<pre>\n<br>${long}<br>second</pre>`, {
        contentType: 'text/html',
      });
      expect(err.message).toBe('x'.repeat(200));
    });

    it('an empty <pre> → fallback', () => {
      expect(createError(500, '<pre> <br> </pre>', { contentType: 'text/html' }).message).toBe(
        'HTTP 500'
      );
    });
  });

  describe('text bodies (E8, E9)', () => {
    it('first non-empty line, whitespace collapsed', () => {
      const err = createError(500, '\n\n   Error:    boom   \nsecond line', {
        contentType: 'text/plain',
      });
      expect(err.message).toBe('Error: boom');
    });

    it('the message is cut at 300 characters', () => {
      expect(createError(500, 'y'.repeat(400)).message).toBe('y'.repeat(300));
    });

    it('a 5 000-character text → body cut to 4 000', () => {
      const text = 'z'.repeat(5000);
      const err = createError(500, text);
      expect(err.body).toBe('z'.repeat(4000));
    });

    it('whitespace-only text → fallback', () => {
      expect(createError(500, '  \r\n ').message).toBe('HTTP 500');
    });

    it('proxy text → Upstream service unavailable; host and URL not in the message', () => {
      const err = createError(
        502,
        'Error occurred while trying to proxy: internal-host:8080/api/x'
      );
      expect(err.message).toBe('Upstream service unavailable');
      expect(err.message).not.toContain('internal-host');
    });
  });

  describe('message and content-type options', () => {
    it('the 0.2.0 message argument wins over the body', () => {
      expect(createError(404, { error: 'x' }, 'Custom').message).toBe('Custom');
    });

    it('init.message wins over the body; cause is kept', () => {
      const cause = new Error('c');
      const err = createError(500, { error: 'x' }, { message: 'Mine', cause });
      expect(err.message).toBe('Mine');
      expect(err.cause).toBe(cause);
    });

    it('contentType from init wins over the headers', () => {
      const err = createError(500, '<pre>Html</pre> tail', {
        contentType: 'text/html',
        headers: new Headers({ 'content-type': 'text/plain' }),
      });
      expect(err.message).toBe('Html');
    });
  });
});

describe('Retry-After (P1 §5.6)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  const at = (value: string) => new Headers({ 'retry-after': value });

  it('Retry-After: 17 → 17 000 ms (fixture error-429)', () => {
    const err = errorFromFixture(coreFixture('error-429'));
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.retryAfter).toBe(17_000);
  });

  it('HTTP-date 5 s ahead (fake clock) → 5 000 ms', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-05T10:00:00.000Z'));
    const date = new Date(Date.now() + 5000).toUTCString();
    expect(createError(429, undefined, { headers: at(date) }).retryAfter).toBe(5000);
  });

  it('a past HTTP-date → 0', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-05T10:00:00.000Z'));
    expect(
      createError(429, undefined, { headers: at('Mon, 05 Jan 2026 09:00:00 GMT') }).retryAfter
    ).toBe(0);
  });

  it.each(['abc', '-1', '1.5', '', 'Fooday, 99 Nonsense'])('%j → undefined', (value) => {
    expect(createError(429, undefined, { headers: at(value) }).retryAfter).toBeUndefined();
  });

  it('padded seconds are accepted', () => {
    expect(createError(429, undefined, { headers: at(' 3 ') }).retryAfter).toBe(3000);
  });

  it('the header on a 503 → ServiceUnavailableError.retryAfter', () => {
    const err = createError(503, { status: 'MongoDB connection not ready' }, { headers: at('2') });
    expect(err).toBeInstanceOf(ServiceUnavailableError);
    expect(err.retryAfter).toBe(2000);
  });

  it('no header → undefined', () => {
    expect(createError(429, undefined, { headers: new Headers() }).retryAfter).toBeUndefined();
    expect(createError(429, undefined).retryAfter).toBeUndefined();
  });
});
