/**
 * HTTP internals shared by the transport and the deprecated legacy executor: request headers, timeout
 * validation, signal composition and the mapping of errors thrown by `fetch` or a body read.
 *
 * Signals are composed by hand with one internal `AbortController` and one timer; neither `AbortSignal.any` nor
 * `AbortSignal.timeout` is used, so runtimes without them behave the same.
 *
 * @internal
 * @module client/http
 */
import {
  AbortError,
  createError,
  NetworkError,
  ResponseParseError,
  RtlsError,
  TimeoutError,
  ValidationError,
} from '../errors';
import { normalizeMac } from '../utils/mac';
import { serializeQuery } from '../utils/query';

// ─── URL and query ────────────────────────────────────────────────────────────

function pathParamError(message: string, name: string): ValidationError {
  return new ValidationError(message, undefined, { status: 0, details: [name] });
}

function pathSegment(path: string, name: string, value: unknown): string {
  if (
    value === undefined ||
    value === null ||
    value === '' ||
    (typeof value === 'number' && !Number.isFinite(value))
  ) {
    throw pathParamError(`Missing path parameter "${name}" for ${path}`, name);
  }
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw pathParamError(
      `Invalid path parameter "${name}" for ${path}: expected a string or a number, received ${describeValue(value)}`,
      name
    );
  }
  // MAC path parameters are sent in their stored form (12 lowercase hex characters).
  const text = name === 'mac_address' ? normalizeMac(String(value)) : String(value);
  return encodeURIComponent(text);
}

/**
 * The request URL: `baseUrl + path` with every `{name}` replaced by `encodeURIComponent(String(value))` (a
 * `mac_address` normalised first), plus the serialized query. A missing, `null`, `''` or non-finite path
 * parameter, an invalid MAC address and an invalid query value throw `ValidationError` (status 0), so nothing is
 * sent.
 */
export function buildUrl(
  baseUrl: string,
  path: string,
  params?: Readonly<Record<string, unknown>>,
  query?: Readonly<Record<string, unknown>>
): string {
  const resolved = path.replace(/\{([^}]+)\}/g, (_match, name: string) =>
    pathSegment(
      path,
      name,
      params && Object.prototype.hasOwnProperty.call(params, name) ? params[name] : undefined
    )
  );
  const qs = serializeQuery(query);
  return `${baseUrl}${resolved}${qs === '' ? '' : `?${qs}`}`;
}

function describeValue(value: unknown): string {
  if (typeof value === 'string') return `the string ${JSON.stringify(value.slice(0, 40))}`;
  if (typeof value === 'number') return String(value);
  if (value === null) return 'null';
  return typeof value;
}

/**
 * Validates a timeout in milliseconds: a number `>= 0`; `0` and `Infinity` disable the timeout. Anything else
 * (`NaN`, a negative number, a non-number) throws `ValidationError` with status 0.
 */
export function checkTimeoutMs(value: unknown, label = 'timeoutMs'): number {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    throw new ValidationError(
      `${label} must be a number >= 0 (0 or Infinity disables the timeout); received ${describeValue(value)}`,
      undefined,
      { status: 0, details: [label] }
    );
  }
  return value;
}

/** The per-call timeout when given (validated), else the client default. */
export function resolveTimeoutMs(perCall: unknown, clientDefault: number): number {
  return perCall === undefined ? clientDefault : checkTimeoutMs(perCall);
}

// ─── Headers ──────────────────────────────────────────────────────────────────

/** Header name and value of the configured credential (at most one per request). */
export type CredentialHeader = readonly [name: string, value: string];

const CREDENTIAL_HEADERS = ['authorization', 'x-api-key'] as const;

/** `true` when the headers already carry `Authorization` or `X-API-Key` (any case). */
export function hasCredentialHeader(headers: Headers): boolean {
  return CREDENTIAL_HEADERS.some((name) => headers.has(name));
}

/** Client-level headers as sent: every `Content-Type` entry is dropped (any case), the rest kept as given. */
export function clientHeadersOf(headers: Record<string, string> | undefined): Headers {
  const result = new Headers();
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (name.toLowerCase() !== 'content-type') result.set(name, value);
  }
  return result;
}

/**
 * Adds a credential to `headers` when they carry none: the credential headers of the client-level headers when
 * those carry one, else the configured credential. So a request never carries two credentials: a per-call
 * credential wins over a client-level one, which wins over the configured `apiKey` / `accessToken`.
 */
export function applyCredential(
  headers: Headers,
  clientCredentials: Headers,
  configured: CredentialHeader | undefined
): void {
  if (hasCredentialHeader(headers)) return;
  if (hasCredentialHeader(clientCredentials)) {
    clientCredentials.forEach((value, name) => headers.set(name, value));
    return;
  }
  if (configured) headers.set(configured[0], configured[1]);
}

/** Only the credential headers of a header set. */
export function credentialHeadersOf(headers: Headers): Headers {
  const result = new Headers();
  for (const name of CREDENTIAL_HEADERS) {
    const value = headers.get(name);
    if (value !== null) result.set(name, value);
  }
  return result;
}

/** The same header set without its credential headers. */
export function withoutCredentialHeaders(headers: Headers): Headers {
  const result = new Headers(headers);
  for (const name of CREDENTIAL_HEADERS) result.delete(name);
  return result;
}

/**
 * Headers of one request, merged into one case-insensitive `Headers`: client headers minus any
 * `Content-Type`, then the credential (skipped when the client or per-call headers already carry `Authorization`
 * or `X-API-Key`), then `Accept` (streams), then the per-call headers. A JSON body adds
 * `Content-Type: application/json` unless the per-call headers set one; a multipart upload removes every
 * `Content-Type` so that `fetch` adds the boundary.
 */
export function buildRequestHeaders(parts: {
  client?: Record<string, string>;
  credential?: CredentialHeader;
  accept?: string;
  perCall?: Record<string, string>;
  jsonBody?: boolean;
  multipart?: boolean;
}): Headers {
  const client = clientHeadersOf(parts.client);
  const perCall = new Headers(parts.perCall ?? {});
  const headers = withoutCredentialHeaders(client);
  if (!hasCredentialHeader(perCall)) {
    applyCredential(headers, credentialHeadersOf(client), parts.credential);
  }
  if (parts.accept !== undefined) headers.set('accept', parts.accept);
  perCall.forEach((value, name) => headers.set(name, value));
  if (parts.jsonBody && !perCall.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  if (parts.multipart) headers.delete('content-type');
  return headers;
}

// ─── Signals ──────────────────────────────────────────────────────────────────

/** Abort reason the SDK timer uses; never surfaces to callers (they get a `TimeoutError`). */
class TimeoutMarker extends Error {
  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs} ms`);
    this.name = 'TimeoutError';
  }
}

/**
 * One request's signal: the caller's signal forwarded into an internal controller plus the SDK timer.
 */
export interface SignalScope {
  /** Signal to hand to `fetch`; aborted by the caller's signal or by the timer. */
  readonly signal: AbortSignal;
  /** Stops the timer (a streamed body: once the headers arrived). */
  clearTimer(): void;
  /** Aborts the request from inside the SDK (a stream's idle timer, a consumer that stopped reading). */
  abort(reason: unknown): void;
  /** Stops the timer and detaches the caller's signal. Safe to call more than once. */
  release(): void;
  /**
   * Maps an error thrown while the scope was open: the caller's signal fired → `AbortError` (cause = its reason);
   * the timer fired → `TimeoutError` (with `timeoutMs`); already an `RtlsError` → unchanged; anything else (a
   * `fetch` or body-read failure, also a non-Error value) → `NetworkError` with the error as `cause`.
   */
  classify(error: unknown): RtlsError;
}

/**
 * Opens the signal scope of one request. A caller signal that is already aborted throws `AbortError` at once, so
 * nothing is sent. `timeoutMs` must be validated already; `0` and `Infinity` start no timer.
 */
export function openSignalScope(
  userSignal: AbortSignal | undefined,
  timeoutMs: number
): SignalScope {
  if (userSignal?.aborted) {
    throw new AbortError(undefined, { cause: userSignal.reason });
  }
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let attached = userSignal !== undefined;

  const onUserAbort = (): void => {
    controller.abort(userSignal?.reason);
  };
  userSignal?.addEventListener('abort', onUserAbort, { once: true });

  if (timeoutMs > 0 && Number.isFinite(timeoutMs)) {
    timer = setTimeout(() => {
      timer = undefined;
      timedOut = true;
      controller.abort(new TimeoutMarker(timeoutMs));
    }, timeoutMs);
  }

  const clearTimer = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  return {
    signal: controller.signal,
    clearTimer,
    abort(reason: unknown): void {
      controller.abort(reason);
    },
    release(): void {
      clearTimer();
      if (attached) {
        attached = false;
        userSignal?.removeEventListener('abort', onUserAbort);
      }
    },
    classify(error: unknown): RtlsError {
      if (userSignal?.aborted) return new AbortError(undefined, { cause: userSignal.reason });
      if (timedOut) {
        return new TimeoutError(`Request timed out after ${timeoutMs} ms`, {
          timeoutMs,
          cause: error,
        });
      }
      if (RtlsError.is(error)) return error;
      const message = error instanceof Error && error.message !== '' ? error.message : undefined;
      return new NetworkError(message, error);
    },
  };
}

/**
 * Runs `work` inside a signal scope: the timer covers everything `work` awaits (headers and body), errors are
 * classified by {@link SignalScope.classify}, and the timer and listener are released in every case.
 */
export async function runWithSignals<T>(
  options: { signal?: AbortSignal; timeoutMs: number },
  work: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const scope = openSignalScope(options.signal, options.timeoutMs);
  try {
    return await work(scope.signal);
  } catch (error) {
    throw scope.classify(error);
  } finally {
    scope.release();
  }
}

/**
 * Settles with `promise`, or rejects with `signal.reason` as soon as `signal` aborts. Used for body reads, so the
 * timer and the caller's signal end a read whatever the `fetch` implementation does with an aborted body.
 */
export function raceSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    promise.then(undefined, () => undefined);
    return Promise.reject(signal.reason);
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });
}

// ─── Body parsing ─────────────────────────────────────────────────────────────

/** How a response body is read: `'auto'` (default) decides by content type; an empty body yields `undefined`. */
export type ParseAs = 'auto' | 'json' | 'text' | 'blob' | 'stream';

/** Longest raw text kept in a `ResponseParseError.body`. */
const MAX_PARSE_ERROR_TEXT = 2_000;

function contentTypeOf(response: Response): string | undefined {
  const value = response.headers.get('content-type');
  return value === null || value.trim() === '' ? undefined : value;
}

function isJsonType(contentType: string | undefined): boolean {
  return contentType !== undefined && /json/i.test(contentType);
}

/** Present and neither JSON (`*json*`, `+json`) nor `text/*`. */
function isBinaryType(contentType: string | undefined): boolean {
  return contentType !== undefined && !isJsonType(contentType) && !/^\s*text\//i.test(contentType);
}

function isPlainTextOrAbsent(contentType: string | undefined): boolean {
  return contentType === undefined || /^\s*text\/plain\b/i.test(contentType);
}

function looksLikeJson(text: string): boolean {
  const start = text.trimStart();
  return start.startsWith('{') || start.startsWith('[');
}

function read<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  return signal ? raceSignal(promise, signal) : promise;
}

/**
 * Reads a 2xx body (the first matching rule wins):
 * 1. `'stream'` → `response.body` unread (`null` for an empty body);
 * 2. status 204 or 205 → `undefined`, body not read;
 * 3. `'blob'` → `Blob`;
 * 4. `'auto'` with a binary content type (present, not JSON, not `text/*`) → `Blob`;
 * 5. read as text; `''` → `undefined` whatever `parseAs` is;
 * 6. `'text'` → the text;
 * 7. `'json'`, or a content type containing `json` → `JSON.parse`, else `ResponseParseError`;
 * 8. `'auto'`, content type absent or `text/plain`, text starting with `{` or `[` → `JSON.parse`, falling back to the
 *    text;
 * 9. otherwise the text (`Created`, `Updated`, CSV, HTML on a 2xx).
 *
 * With a `signal`, every read ends as soon as the signal aborts.
 */
export async function parseResponseBody(
  response: Response,
  parseAs: ParseAs,
  signal?: AbortSignal
): Promise<unknown> {
  if (parseAs === 'stream') return response.body;
  if (response.status === 204 || response.status === 205) {
    return undefined; // on its own line: live line coverage shows whether a live 204 reached it
  }
  const contentType = contentTypeOf(response);
  if (parseAs === 'blob' || (parseAs === 'auto' && isBinaryType(contentType))) {
    return await read(response.blob(), signal);
  }
  const text = await read(response.text(), signal);
  if (text === '') return undefined;
  if (parseAs === 'text') return text;
  if (parseAs === 'json' || isJsonType(contentType)) {
    try {
      return JSON.parse(text) as unknown;
    } catch (cause) {
      throw new ResponseParseError(
        `Response body is not valid JSON (status ${response.status}${contentType ? `, ${contentType}` : ''})`,
        {
          status: response.status,
          contentType,
          body: text.length > MAX_PARSE_ERROR_TEXT ? text.slice(0, MAX_PARSE_ERROR_TEXT) : text,
          cause,
        }
      );
    }
  }
  if (isPlainTextOrAbsent(contentType) && looksLikeJson(text)) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }
  return text;
}

/**
 * The body of a non-2xx response as `createError` takes it: read as text, parsed as JSON when the
 * content type contains `json` or the text starts with `{` or `[` (else the text), `undefined` when empty. A body
 * that cannot be read counts as empty; an abort of `signal` during the read is rethrown.
 */
export async function readErrorBody(response: Response, signal?: AbortSignal): Promise<unknown> {
  let text: string;
  try {
    text = await read(response.text(), signal);
  } catch (error) {
    if (signal?.aborted) throw error;
    return undefined;
  }
  if (text === '') return undefined;
  if (isJsonType(contentTypeOf(response)) || looksLikeJson(text)) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }
  return text;
}

/** Maps a non-2xx response to its error class, with `Retry-After`, content type and status text. */
export async function errorFromResponse(
  response: Response,
  signal?: AbortSignal
): Promise<RtlsError> {
  const body = await readErrorBody(response, signal);
  return createError(response.status, body, {
    headers: response.headers,
    statusText: response.statusText,
  });
}
