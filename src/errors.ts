/**
 * Error hierarchy of the SDK.
 *
 * Every error the SDK throws is an {@link RtlsError}. `status` is the real HTTP status, or `0` when there was no
 * HTTP exchange (client-side validation, missing context, timeout, abort, network failure). `code` is the SDK class
 * code (for example `NOT_FOUND`); the server's own code, when the body carries one, is in `apiCode`.
 *
 * @module errors
 */

/** Global brand shared by every copy of the SDK loaded in one process (ESM and CJS builds alike). */
const RTLS_ERROR_BRAND = Symbol.for('ubudu-rtls-sdk.error');

/** Fields of an {@link RtlsError}, as accepted by the `init` constructor form. */
export interface RtlsErrorInit {
  /** Real HTTP status; `0` when no response was received. */
  status: number;
  /** SDK class code; defaults to the class's own code. */
  code?: string;
  /** Code sent by the server (for example `stale_write`, `rate_limited`). */
  apiCode?: string;
  /** Detail lines sent by the server (validation messages, offending fields). */
  details?: string[];
  /** Delay requested by the server through `Retry-After`, in **milliseconds**. */
  retryAfter?: number;
  /** Parsed error body (object), the raw text cut to 4 000 characters, or `undefined` when empty. */
  body?: unknown;
  /** Underlying error (standard ES2022 `Error.cause`). */
  cause?: unknown;
}

/** Why a server-sent-event or WebSocket stream failed. */
export type StreamErrorReason = 'idle_timeout' | 'network' | 'protocol';

/** Fills unset `init` fields with the class defaults; a field set to `undefined` keeps the default. */
function withDefaults(defaults: RtlsErrorInit, init?: Partial<RtlsErrorInit>): RtlsErrorInit {
  const merged: RtlsErrorInit = { ...defaults };
  if (init) {
    for (const key of Object.keys(init) as (keyof RtlsErrorInit)[]) {
      const value = init[key];
      if (value !== undefined) Object.assign(merged, { [key]: value });
    }
  }
  return merged;
}

/**
 * Base class of every SDK error.
 *
 * @example
 * ```typescript
 * import { RtlsError, NotFoundError } from 'ubudu-rtls-sdk';
 *
 * try {
 *   await client.assets.get('aabbccddeeff');
 * } catch (err) {
 *   if (err instanceof NotFoundError) console.log('no such asset');
 *   else if (RtlsError.is(err)) console.log(err.status, err.code, err.apiCode, err.message);
 *   else throw err;
 * }
 * ```
 */
export class RtlsError extends Error {
  /** Real HTTP status; `0` when no response was received (client-side, timeout, abort, network). */
  public readonly status: number;
  /** SDK class code, for example `VALIDATION_ERROR` or `NOT_FOUND`. */
  public readonly code: string;
  /** Code sent by the server, when the error body carries one. */
  declare public readonly apiCode?: string;
  /** Detail lines sent by the server. */
  declare public readonly details?: string[];
  /** Delay requested by the server through `Retry-After`, in milliseconds (any status). */
  declare public readonly retryAfter?: number;
  /** Parsed error body, the raw text cut to 4 000 characters, or `undefined` when the body was empty. */
  public readonly body: unknown;

  /** 0.2.0 form, kept: `new RtlsError(message, status, body?, code?)`. */
  constructor(message: string, status: number, body?: unknown, code?: string);
  /** `new RtlsError(message, { status, code?, apiCode?, details?, retryAfter?, body?, cause? })`. */
  constructor(message: string, init: RtlsErrorInit);
  constructor(
    message: string,
    statusOrInit: number | RtlsErrorInit,
    body?: unknown,
    code?: string
  ) {
    const init: RtlsErrorInit =
      typeof statusOrInit === 'number' ? { status: statusOrInit, body, code } : statusOrInit;
    super(message, init.cause !== undefined ? { cause: init.cause } : undefined);
    this.name = 'RtlsError';
    this.status = init.status;
    this.code = init.code ?? 'RTLS_ERROR';
    this.body = init.body;
    if (init.apiCode !== undefined) this.apiCode = init.apiCode;
    if (init.details !== undefined) this.details = init.details;
    if (init.retryAfter !== undefined) this.retryAfter = init.retryAfter;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, new.target);
    }
  }

  /** `true` when {@link RtlsError.status} equals `status`. */
  isStatus(status: number): boolean {
    return this.status === status;
  }

  /** `true` for a 4xx status (`status 0` is neither a client nor a server error). */
  isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }

  /** `true` for a status of 500 or more. */
  isServerError(): boolean {
    return this.status >= 500;
  }

  /**
   * `true` for any SDK error, also one thrown by another copy of the SDK (dual ESM/CJS loading, another realm),
   * where `instanceof` fails. The check reads a global brand symbol.
   */
  static is(value: unknown): value is RtlsError {
    return (
      (typeof value === 'object' || typeof value === 'function') &&
      value !== null &&
      (value as Record<symbol, unknown>)[RTLS_ERROR_BRAND] === true
    );
  }
}

Object.defineProperty(RtlsError.prototype, RTLS_ERROR_BRAND, { value: true });

/** 400 or 422, or an argument rejected before any request (then `status` is 0). */
export class ValidationError extends RtlsError {
  /**
   * Field map of a `{ errors: { field: [messages] } }` body.
   * @deprecated since 0.3.0 — the API sends no such map; read {@link RtlsError.details}.
   */
  public readonly errors: Record<string, string[]>;

  /**
   * Default status 422; the error mapper passes the real status. Client-side validation (no HTTP exchange) uses
   * `new ValidationError(message, undefined, { status: 0, details? })`.
   */
  constructor(message = 'Validation failed', body?: unknown, init?: Partial<RtlsErrorInit>) {
    super(message, withDefaults({ status: 422, code: 'VALIDATION_ERROR', body }, init));
    this.name = 'ValidationError';
    this.errors = extractErrorMap(this.body);
  }
}

function extractErrorMap(body: unknown): Record<string, string[]> {
  if (isPlainObject(body) && isPlainObject(body.errors)) {
    return body.errors as Record<string, string[]>;
  }
  return {};
}

/** 401: no credential, or the credential was not accepted. */
export class AuthenticationError extends RtlsError {
  constructor(message = 'Authentication failed', body?: unknown, init?: Partial<RtlsErrorInit>) {
    super(message, withDefaults({ status: 401, code: 'AUTHENTICATION_ERROR', body }, init));
    this.name = 'AuthenticationError';
  }
}

/** 403: the credential lacks the role or namespace access. */
export class AuthorizationError extends RtlsError {
  constructor(message = 'Access denied', body?: unknown, init?: Partial<RtlsErrorInit>) {
    super(message, withDefaults({ status: 403, code: 'AUTHORIZATION_ERROR', body }, init));
    this.name = 'AuthorizationError';
  }
}

/** 404. */
export class NotFoundError extends RtlsError {
  constructor(message = 'Resource not found', body?: unknown, init?: Partial<RtlsErrorInit>) {
    super(message, withDefaults({ status: 404, code: 'NOT_FOUND', body }, init));
    this.name = 'NotFoundError';
  }
}

/** 409: the request conflicts with the stored state (for example a stale write). */
export class ConflictError extends RtlsError {
  constructor(message = 'Conflict', body?: unknown, init?: Partial<RtlsErrorInit>) {
    super(message, withDefaults({ status: 409, code: 'CONFLICT', body }, init));
    this.name = 'ConflictError';
  }
}

/** 410: the resource existed and is gone. */
export class GoneError extends RtlsError {
  constructor(message = 'Gone', body?: unknown, init?: Partial<RtlsErrorInit>) {
    super(message, withDefaults({ status: 410, code: 'GONE', body }, init));
    this.name = 'GoneError';
  }
}

/** 413: the request body is larger than the server accepts. */
export class PayloadTooLargeError extends RtlsError {
  constructor(message = 'Payload too large', body?: unknown, init?: Partial<RtlsErrorInit>) {
    super(message, withDefaults({ status: 413, code: 'PAYLOAD_TOO_LARGE', body }, init));
    this.name = 'PayloadTooLargeError';
  }
}

/** 415: the server does not accept the request's content type. */
export class UnsupportedMediaTypeError extends RtlsError {
  constructor(message = 'Unsupported media type', body?: unknown, init?: Partial<RtlsErrorInit>) {
    super(message, withDefaults({ status: 415, code: 'UNSUPPORTED_MEDIA_TYPE', body }, init));
    this.name = 'UnsupportedMediaTypeError';
  }
}

/** 429. `retryAfter` (ms) is set when the server sent `Retry-After`. */
export class RateLimitError extends RtlsError {
  constructor(
    message = 'Rate limit exceeded',
    body?: unknown,
    retryAfterMs?: number,
    init?: Partial<RtlsErrorInit>
  ) {
    super(
      message,
      withDefaults({ status: 429, code: 'RATE_LIMIT', body, retryAfter: retryAfterMs }, init)
    );
    this.name = 'RateLimitError';
  }
}

/** 5xx. `status` is the real status (default 500). */
export class ServerError extends RtlsError {
  constructor(message = 'Server error', body?: unknown, init?: Partial<RtlsErrorInit>) {
    super(message, withDefaults({ status: 500, code: 'SERVER_ERROR', body }, init));
    this.name = 'ServerError';
  }
}

/** 503. */
export class ServiceUnavailableError extends ServerError {
  constructor(message = 'Service unavailable', body?: unknown, init?: Partial<RtlsErrorInit>) {
    super(message, body, withDefaults({ status: 503, code: 'SERVICE_UNAVAILABLE', body }, init));
    this.name = 'ServiceUnavailableError';
  }
}

/** The SDK's timer fired before the response (headers and body) arrived. `status` is 0. */
export class TimeoutError extends RtlsError {
  /** The timeout that fired, in milliseconds. */
  declare public readonly timeoutMs?: number;

  constructor(
    message = 'Request timed out',
    init?: Partial<RtlsErrorInit> & { timeoutMs?: number }
  ) {
    const { timeoutMs, ...rest } = init ?? {};
    super(message, withDefaults({ status: 0, code: 'TIMEOUT' }, rest));
    this.name = 'TimeoutError';
    if (timeoutMs !== undefined) this.timeoutMs = timeoutMs;
  }
}

/** The caller's `AbortSignal` fired. `cause` is the signal's `reason`. `status` is 0. */
export class AbortError extends RtlsError {
  constructor(message = 'Request aborted', init?: Partial<RtlsErrorInit>) {
    super(message, withDefaults({ status: 0, code: 'ABORTED' }, init));
    this.name = 'AbortError';
  }
}

/** No response was received (connection refused, DNS failure, reset, …). `status` is 0. */
export class NetworkError extends RtlsError {
  constructor(message = 'Network error', cause?: unknown, init?: Partial<RtlsErrorInit>) {
    super(message, withDefaults({ status: 0, code: 'NETWORK_ERROR', cause }, init));
    this.name = 'NetworkError';
  }

  /**
   * The underlying error.
   * @deprecated since 0.3.0 — use the standard `cause`.
   */
  get networkCause(): Error | undefined {
    return this.cause instanceof Error ? this.cause : undefined;
  }
}

/** A response body could not be parsed as declared (for example malformed JSON). */
export class ResponseParseError extends RtlsError {
  /** `Content-Type` of the response, when present. */
  declare public readonly contentType?: string;

  constructor(
    message: string,
    init: Partial<RtlsErrorInit> & { status: number; contentType?: string }
  ) {
    const { contentType, ...rest } = init;
    super(message, withDefaults({ status: init.status, code: 'RESPONSE_PARSE_ERROR' }, rest));
    this.name = 'ResponseParseError';
    if (contentType !== undefined) this.contentType = contentType;
  }
}

/**
 * A server-sent-event or WebSocket stream failed. Subclasses (for example the WebSocket errors) may set their own
 * `code` through `init` and keep `instanceof StreamError`.
 */
export class StreamError extends RtlsError {
  /** Why the stream failed. */
  public readonly reason: StreamErrorReason;

  constructor(message: string, init: Partial<RtlsErrorInit> & { reason: StreamErrorReason }) {
    const { reason, ...rest } = init;
    super(message, withDefaults({ status: 0, code: 'STREAM_ERROR' }, rest));
    this.name = 'StreamError';
    this.reason = reason;
  }
}

/**
 * A namespace, venue or map id is missing (no per-call value and no client default) or invalid. `status` is 0
 * and no request was sent.
 */
export class ContextError extends RtlsError {
  constructor(
    public readonly field: string,
    public readonly suggestion: string,
    public readonly problem: 'missing' | 'invalid' = 'missing'
  ) {
    super(`${field} is ${problem === 'invalid' ? 'invalid' : 'required'}. ${suggestion}`, {
      status: 0,
      code: 'CONTEXT_ERROR',
    });
    this.name = 'ContextError';
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ─── Error body parsing ───────────────────────────────────────────────────────

/** Longest raw error text kept in `RtlsError.body`. */
const MAX_BODY_TEXT = 4_000;
/** Longest message taken from an HTML error page (first `<pre>` line). */
const MAX_HTML_MESSAGE = 200;
/** Longest message taken from a plain-text error body (first non-empty line). */
const MAX_TEXT_MESSAGE = 300;
/** A one-token, code-like `error` string (E1c): `stale_write`, `not_found`, `DL_017`. */
const CODE_LIKE = /^[A-Za-z][A-Za-z0-9]*(?:[_.-][A-Za-z0-9]+)*$/;
const PROXY_PREFIX = 'Error occurred while trying to proxy';

interface ParsedErrorBody {
  /** Message taken from the body; `undefined` → the `HTTP <status>` fallback. */
  message?: string;
  apiCode?: string;
  details?: string[];
  /** Value stored in `RtlsError.body`. */
  body: unknown;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function detailLine(value: unknown): string {
  return typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value));
}

/** `details` (array or string), else `violations`, else `fields` (when an array). */
function detailsOf(body: Record<string, unknown>): string[] | undefined {
  // One statement per line: live line coverage then shows whether a live body took the branch.
  if (Array.isArray(body.details)) {
    return body.details.map(detailLine);
  }
  if (typeof body.details === 'string') {
    return [body.details];
  }
  if (Array.isArray(body.violations)) {
    return body.violations.map(detailLine);
  }
  if (Array.isArray(body.fields)) {
    return body.fields.map(detailLine);
  }
  return undefined;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (entity, name: string) => {
    if (name[0] === '#') {
      const code =
        name[1] === 'x' || name[1] === 'X'
          ? parseInt(name.slice(2), 16)
          : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : entity;
    }
    return NAMED_ENTITIES[name.toLowerCase()] ?? entity;
  });
}

/** E10: the first non-empty line of the first `<pre>` of an HTML page; the rest of the page is never used. */
function htmlMessage(html: string): string | undefined {
  const pre = /<pre\b[^>]*>([\s\S]*?)<\/pre>/i.exec(html);
  if (!pre) return undefined;
  for (const segment of (pre[1] ?? '').split(/<br\s*\/?>|\r\n|\r|\n/i)) {
    const line = decodeEntities(segment.replace(/<[^>]*>/g, ''))
      .replace(/\s+/g, ' ')
      .trim();
    if (line !== '') return line.slice(0, MAX_HTML_MESSAGE);
  }
  return undefined;
}

/** E8: the first non-empty line, whitespace collapsed. */
function textMessage(text: string): string | undefined {
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (line !== '') return line.slice(0, MAX_TEXT_MESSAGE);
  }
  return undefined;
}

function parseTextBody(text: string, contentType: string | undefined): ParsedErrorBody {
  const body = text.length > MAX_BODY_TEXT ? text.slice(0, MAX_BODY_TEXT) : text;
  const start = text.trimStart();
  if ((contentType !== undefined && /text\/html/i.test(contentType)) || start.startsWith('<')) {
    return { message: htmlMessage(text), body }; // E10
  }
  if (start.startsWith(PROXY_PREFIX)) {
    return { message: 'Upstream service unavailable', body }; // E9: host and URL are not surfaced
  }
  return { message: textMessage(text), body }; // E8
}

/**
 * Reads `message`, `apiCode` and `details` from every error envelope the API sends. The first matching
 * row wins: E3 `{error:{code,message}}`, E2 `{error,message}`, E5 `{error,code}`, E1c `{error:'code_like'}`, E1
 * `{error:'Human'}` (also E4, E4b, violations, E6), `{message,code?}`, E7 `{status}`, E11 other objects; text bodies:
 * E10 HTML, E9 proxy text, E8 other text; E12 empty.
 */
function parseErrorBody(raw: unknown, contentType: string | undefined): ParsedErrorBody {
  if (raw === undefined || raw === '') return { body: undefined }; // E12
  if (typeof raw === 'string') return parseTextBody(raw, contentType);
  if (!isPlainObject(raw)) return { body: raw };

  const details = detailsOf(raw);
  const error = raw.error;
  if (isPlainObject(error)) {
    const code = nonEmptyString(error.code);
    return {
      message: nonEmptyString(error.message) ?? code,
      apiCode: code,
      details: details ?? (isStringArray(error.details) ? error.details : undefined),
      body: raw,
    }; // E3
  }
  const errorText = nonEmptyString(error);
  if (errorText !== undefined) {
    const message = nonEmptyString(raw.message);
    if (message !== undefined) {
      return { message, apiCode: errorText, details, body: raw }; // E2
    }
    const code = nonEmptyString(raw.code);
    if (code !== undefined) {
      return { message: errorText, apiCode: code, details, body: raw }; // E5
    }
    if (CODE_LIKE.test(errorText)) {
      return { message: errorText, apiCode: errorText, details, body: raw }; // E1c
    }
    return { message: errorText, details, body: raw }; // E1, E4, E4b, violations, E6
  }
  const message = nonEmptyString(raw.message);
  if (message !== undefined) {
    return { message, apiCode: nonEmptyString(raw.code), details, body: raw };
  }
  const status = nonEmptyString(raw.status);
  if (status !== undefined) {
    return { message: status, details, body: raw }; // E7
  }
  return { details, body: raw }; // E11
}

/**
 * `Retry-After` in milliseconds: delta-seconds × 1000, or an HTTP-date minus now (floored at 0); anything else
 * gives `undefined`.
 */
function parseRetryAfter(value: string | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  const v = value.trim();
  if (/^\d+$/.test(v)) return Number(v) * 1000;
  if (/[A-Za-z]/.test(v)) {
    const at = Date.parse(v);
    if (Number.isFinite(at)) return Math.max(0, at - Date.now());
  }
  return undefined;
}

/**
 * Maps an HTTP error status and body to the matching error class.
 *
 * `body` is the parsed JSON value, or the raw text, or `undefined` for an empty body. The third argument is the
 * message (0.2.0 form, wins over the body) or `{ message?, headers?, contentType?, statusText?, cause? }`:
 * `headers` give `Retry-After` (→ `retryAfter` in ms, any status) and, without `contentType`, the content type;
 * `statusText` completes the fallback message `HTTP <status> <statusText>`.
 *
 * @example
 * ```typescript
 * import { createError } from 'ubudu-rtls-sdk';
 *
 * const err = createError(409, { error: 'stale_write', current: {} });
 * // ConflictError: message 'stale_write', apiCode 'stale_write', body.current kept
 * ```
 */
export function createError(
  status: number,
  body: unknown,
  messageOrInit?:
    | string
    | {
        message?: string;
        headers?: Headers;
        contentType?: string;
        statusText?: string;
        cause?: unknown;
      }
): RtlsError {
  const opts = typeof messageOrInit === 'string' ? { message: messageOrInit } : messageOrInit;
  const contentType = opts?.contentType || opts?.headers?.get('content-type') || undefined;
  const parsed = parseErrorBody(body, contentType);
  const fallback = `HTTP ${status}${opts?.statusText ? ` ${opts.statusText}` : ''}`;
  const message = opts?.message ?? parsed.message ?? fallback;
  return errorForStatus(status, message, parsed.body, {
    status,
    body: parsed.body,
    apiCode: parsed.apiCode,
    details: parsed.details,
    retryAfter: parseRetryAfter(opts?.headers?.get('retry-after')),
    cause: opts?.cause,
  });
}

function errorForStatus(
  status: number,
  message: string,
  body: unknown,
  init: Partial<RtlsErrorInit> & { status: number }
): RtlsError {
  switch (status) {
    case 400:
    case 422:
      return new ValidationError(message, body, init);
    case 401:
      return new AuthenticationError(message, body, init);
    case 403:
      return new AuthorizationError(message, body, init);
    case 404:
      return new NotFoundError(message, body, init);
    case 409:
      return new ConflictError(message, body, init);
    case 410:
      return new GoneError(message, body, init);
    case 413:
      return new PayloadTooLargeError(message, body, init);
    case 415:
      return new UnsupportedMediaTypeError(message, body, init);
    case 429:
      return new RateLimitError(message, body, init.retryAfter, init);
    case 503:
      return new ServiceUnavailableError(message, body, init);
    default:
      if (status >= 500 && status <= 599) return new ServerError(message, body, init);
      return new RtlsError(message, { ...init, code: 'RTLS_ERROR' });
  }
}
