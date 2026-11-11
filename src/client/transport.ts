/**
 * The typed transport every resource uses (`this.transport`). One code path builds the
 * URL, the headers (exactly one credential, no forced `Content-Type`) and the signal, parses the body and maps
 * errors to the SDK classes.
 *
 * @internal The class is reached through the client; its type is exported for resource authors.
 * @module client/transport
 */
import { AbortError, RtlsError, StreamError, ValidationError } from '../errors';
import { parseContentDisposition } from '../utils/files';
import type { QueryValue } from '../utils/query';
import { parseSse, type SseEvent } from '../utils/sse';
import {
  buildRequestHeaders,
  buildUrl,
  checkTimeoutMs,
  errorFromResponse,
  openSignalScope,
  parseResponseBody,
  raceSignal,
  resolveTimeoutMs,
  runWithSignals,
  type CredentialHeader,
  type ParseAs,
  type SignalScope,
} from './http';
import type {
  ApiPaths,
  HasPathParams,
  HttpMethod,
  JsonBody,
  PathParams,
  PathsWithMethod,
  QueryParams,
  SuccessBody,
} from './paths';
import { checkCallRetry, withRetry, type CallRetry, type ResolvedRetryPolicy } from './retry';

export type { ParseAs, QueryValue, HttpMethod, SseEvent };

/** Default idle timeout of a stream: well above the 20 s heartbeat of the server. */
const DEFAULT_IDLE_TIMEOUT_MS = 45_000;

/** Options of {@link Transport.stream}: no total timeout, no retry, an idle timeout instead. */
export type StreamOptions = Omit<TransportOptions, 'body' | 'parseAs' | 'timeoutMs' | 'retry'> & {
  /** Ends the stream with `StreamError` (`reason: 'idle_timeout'`) after this long without a byte; default 45 000; `0` disables. */
  idleTimeoutMs?: number;
};

/**
 * Abort reason of the SDK's own aborts of a streamed response (idle timer, consumer stopped, body cancelled).
 * Never surfaces to callers.
 */
class StreamStopMarker extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StreamStop';
  }
}

const EVENT_STREAM = /^\s*text\/event-stream\s*(?:;|$)/i;

/** Options of one transport call. */
export interface TransportOptions {
  /** Path parameters; each `{name}` of the path is replaced by its encoded value. */
  params?: Record<string, string | number>;
  /** Query parameters (insertion order kept; `undefined`/`null` skipped; arrays joined with `,`). */
  query?: Record<string, QueryValue>;
  /** Request body, sent as JSON. */
  body?: unknown;
  /** Per-call headers; they win over client headers. */
  headers?: Record<string, string>;
  /** Caller's signal; aborting it ends the call with `AbortError`. */
  signal?: AbortSignal;
  /** Per-attempt timeout in ms (headers and body); `0` or `Infinity` disables it. Default: the client's. */
  timeoutMs?: number;
  /** How the 2xx body is read; default `'auto'` (by content type; an empty body yields `undefined`). */
  parseAs?: ParseAs;
  /** `false`: never retried; `{ idempotent: true }`: a read-only POST retried under the client policy. */
  retry?: false | { idempotent: true };
}

/** Parsed body plus status and headers (`X-Total-Count`, `Retry-After`, `Content-Disposition`, …). */
export interface TransportResponse<T> {
  data: T;
  status: number;
  headers: Headers;
}

/** A downloaded file: the bytes, the filename from `Content-Disposition` and the `Content-Type`, when present. */
export interface DownloadResult {
  data: Blob;
  filename?: string;
  contentType?: string;
}

/** What the transport needs from its client. */
export interface TransportConfig {
  /** Base URL without a trailing `/`. */
  baseUrl: string;
  /** Default per-attempt timeout in ms (validated). */
  timeoutMs: number;
  /** Client-level headers (a `Content-Type` among them is ignored). */
  headers?: Record<string, string>;
  /** The configured credential header (at most one), if any. */
  credential?: CredentialHeader;
  /** `fetch` resolved per call. */
  fetch: (input: string, init: RequestInit) => Promise<Response>;
  /** The client's retry policy; `undefined` = no retry (the default). */
  retry?: ResolvedRetryPolicy;
}

declare const explicitTypeRequired: unique symbol;
/** Brand that makes a type argument mandatory on the explicit overloads. Never exported. */
type ExplicitTypeRequired = { readonly [explicitTypeRequired]: true };

/** Typed `query`: the declared keys with their types, plus any other key (filter keys stay allowed). */
type TypedQuery<P extends keyof ApiPaths, M extends HttpMethod> = [QueryParams<P, M>] extends [
  never,
]
  ? Record<string, QueryValue>
  : Partial<QueryParams<P, M>> & Record<string, QueryValue>;

/** Options of a typed call: path params checked (required when the path has some), query and JSON body typed. */
export type TypedOptions<P extends keyof ApiPaths, M extends HttpMethod> = Omit<
  TransportOptions,
  'params' | 'query' | 'body' | 'parseAs'
> &
  (HasPathParams<P, M> extends true ? { params: PathParams<P, M> } : { params?: undefined }) & {
    query?: TypedQuery<P, M>;
    /** Typed calls return the spec's body type, so only `'auto'` and `'json'` are allowed here. */
    parseAs?: 'auto' | 'json';
  } & ([JsonBody<P, M>] extends [never] ? { body?: undefined } : { body?: JsonBody<P, M> });

/** `options` is required when the operation has path parameters. */
export type TypedArgs<P extends keyof ApiPaths, M extends HttpMethod> =
  HasPathParams<P, M> extends true ? [options: TypedOptions<P, M>] : [options?: TypedOptions<P, M>];

/** Without an explicit type argument the explicit form accepts no call at all. */
type ExplicitArgs<T> = [T] extends [ExplicitTypeRequired]
  ? [options: never]
  : [options?: TransportOptions];

/** One request, built and validated before anything is sent. */
interface PreparedRequest {
  method: HttpMethod;
  url: string;
  headers: Headers;
  body?: BodyInit;
  timeoutMs: number;
  signal?: AbortSignal;
  parseAs: ParseAs;
  retry?: CallRetry;
}

function bodyOnGetError(): ValidationError {
  return new ValidationError('A GET request cannot carry a body', undefined, {
    status: 0,
    details: ['body'],
  });
}

/** How a request deviates from a JSON call: an already-encoded body, a multipart form, an `Accept` header. */
interface RequestShape {
  multipart?: FormData;
  accept?: string;
}

/** Options without the keys a method sets itself (a JavaScript caller may still pass them). */
function without<K extends keyof TransportOptions>(
  options: TransportOptions | undefined,
  ...keys: K[]
): TransportOptions {
  const copy: TransportOptions = { ...options };
  for (const key of keys) delete copy[key];
  return copy;
}

/**
 * Wraps a streamed 2xx body so that the caller's signal still ends it (`AbortError`), a read failure becomes a
 * `NetworkError`, and the signal scope is released when the body ends or is cancelled.
 */
function releaseOnEnd(
  body: ReadableStream<Uint8Array>,
  scope: SignalScope
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const chunk = await raceSignal(reader.read(), scope.signal);
        if (chunk.done) {
          scope.release();
          controller.close();
          return;
        }
        controller.enqueue(chunk.value);
      } catch (error) {
        const mapped = scope.classify(error);
        scope.release();
        reader.cancel(mapped).then(undefined, () => undefined);
        controller.error(mapped);
      }
    },
    cancel(reason) {
      // The caller stopped reading: end the request. The source's cancel is not awaited (it may settle late).
      scope.abort(new StreamStopMarker('The response body was cancelled'));
      scope.release();
      reader.cancel(reason).then(undefined, () => undefined);
    },
  });
}

/**
 * The SDK transport. Resources reach it as `this.transport`; it is not meant to be constructed by callers.
 *
 * Typed calls check the path, the method, the path parameters, the query keys and the JSON body against the
 * vendored spec and return the spec's success body type. The explicit form (`request<T>(…)`) takes a type argument
 * for hand-written types, spec paths with a wrong or empty schema, and `parseAs` other than `'auto'`/`'json'`.
 *
 * @internal
 */
export class Transport {
  constructor(private readonly config: TransportConfig) {}

  /**
   * Sends a request and returns the parsed body.
   * @throws {ValidationError} status 0 for an invalid argument (nothing is sent)
   * @throws {RtlsError} the class of the HTTP status, `AbortError`, `TimeoutError`, `NetworkError`,
   *   `ResponseParseError`
   */
  request<M extends HttpMethod, P extends PathsWithMethod<M>>(
    method: M,
    path: P,
    ...options: TypedArgs<P, M>
  ): Promise<SuccessBody<P, M>>;
  request<T = ExplicitTypeRequired>(
    method: HttpMethod,
    path: keyof ApiPaths,
    ...options: ExplicitArgs<T>
  ): Promise<T>;
  async request(method: HttpMethod, path: string, options?: TransportOptions): Promise<unknown> {
    const response = await this.send(method, path, options);
    return response.data;
  }

  /**
   * Like {@link Transport.request}, and also returns the status and the response headers.
   */
  requestWithResponse<M extends HttpMethod, P extends PathsWithMethod<M>>(
    method: M,
    path: P,
    ...options: TypedArgs<P, M>
  ): Promise<TransportResponse<SuccessBody<P, M>>>;
  requestWithResponse<T = ExplicitTypeRequired>(
    method: HttpMethod,
    path: keyof ApiPaths,
    ...options: ExplicitArgs<T>
  ): Promise<TransportResponse<T>>;
  async requestWithResponse(
    method: HttpMethod,
    path: string,
    options?: TransportOptions
  ): Promise<TransportResponse<unknown>> {
    return await this.send(method, path, options);
  }

  /**
   * Sends a multipart `POST`. Every `Content-Type` is removed, whatever its source or case, so that
   * `fetch` sets `multipart/form-data` with its boundary. An upload is never retried. Build the file part with
   * `toFormFile` so that it always carries a filename.
   *
   * @throws {ValidationError} status 0 when `formData` is not a `FormData` (nothing is sent)
   */
  async upload<T>(
    path: PathsWithMethod<'POST'>,
    formData: FormData,
    options?: Omit<TransportOptions, 'body' | 'retry'>
  ): Promise<T> {
    if (typeof FormData === 'undefined' || !(formData instanceof FormData)) {
      throw new ValidationError('upload() needs a FormData body', undefined, {
        status: 0,
        details: ['formData'],
      });
    }
    const prepared = this.prepare('POST', path, without(options, 'body', 'retry'), {
      multipart: formData,
    });
    const response = await this.attempt(prepared);
    return response.data as T;
  }

  /**
   * Downloads a file with a `GET`: the body as a `Blob`, the filename from `Content-Disposition`
   * (`filename*=UTF-8''…` wins over `filename=`) and the `Content-Type`. Both stay `undefined` when the header is
   * missing or unreadable.
   */
  async download(
    path: PathsWithMethod<'GET'>,
    options?: Omit<TransportOptions, 'body' | 'parseAs'>
  ): Promise<DownloadResult> {
    const response = await this.send('GET', path, {
      ...without(options, 'body', 'parseAs'),
      parseAs: 'blob',
    });
    const contentType = response.headers.get('content-type');
    return {
      // 204/205 carry no body: an empty Blob keeps the type honest. Any other body is what `response.blob()` gave,
      // kept as is: a custom `fetch` (node-fetch, a DOM test realm) returns a Blob that is not `instanceof Blob`.
      data: response.data === undefined ? new Blob([]) : (response.data as Blob),
      filename: parseContentDisposition(response.headers.get('content-disposition')),
      contentType: contentType === null || contentType.trim() === '' ? undefined : contentType,
    };
  }

  /**
   * Opens a server-sent events stream and yields its events (`data` is the raw string).
   *
   * A `GET` with `Accept: text/event-stream` and no total timeout: the idle timer starts with the request and is
   * reset by every received chunk, heartbeat comments included; on expiry the request is aborted and the iterator
   * throws `StreamError` with `reason: 'idle_timeout'`. A non-2xx status is mapped as usual and thrown by the first
   * `next()`; a 2xx that is not `text/event-stream` throws `StreamError` (`'protocol'`); a failure mid-stream throws
   * `StreamError` (`'network'`); the caller's signal ends it with `AbortError`. `break` / `return()` cancels the
   * request and ends the iterator without an error. A stream is never retried.
   *
   * @throws {ValidationError} status 0, at once, for an invalid argument (nothing is sent)
   *
   * @example
   * ```typescript
   * const controller = new AbortController();
   * for await (const event of transport.stream('/notifications/{namespace}/stream', {
   *   params: { namespace: 'my-namespace' },
   *   signal: controller.signal,
   * })) {
   *   if (event.event === 'item') console.log(JSON.parse(event.data));
   * }
   * ```
   */
  stream(path: PathsWithMethod<'GET'>, options?: StreamOptions): AsyncIterableIterator<SseEvent> {
    const idleTimeoutMs = checkTimeoutMs(
      options?.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
      'idleTimeoutMs'
    );
    const { idleTimeoutMs: _idle, ...rest } = options ?? {};
    const prepared = this.prepare(
      'GET',
      path,
      without(rest, 'body', 'parseAs', 'timeoutMs', 'retry'),
      {
        accept: 'text/event-stream',
      }
    );
    return this.streamEvents(prepared, idleTimeoutMs);
  }

  // ─── internals ──────────────────────────────────────────────────────────────

  private async *streamEvents(
    request: PreparedRequest,
    idleTimeoutMs: number
  ): AsyncGenerator<SseEvent, void, undefined> {
    // No total timer: only the idle timer below ends a quiet stream.
    const scope = openSignalScope(request.signal, 0);
    let idleFired = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const disarm = (): void => {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    };
    const arm = (): void => {
      disarm();
      if (idleTimeoutMs > 0 && Number.isFinite(idleTimeoutMs)) {
        timer = setTimeout(() => {
          timer = undefined;
          idleFired = true;
          scope.abort(new StreamStopMarker(`No data for ${idleTimeoutMs} ms`));
        }, idleTimeoutMs);
      }
    };
    const idleError = (cause: unknown): StreamError =>
      new StreamError(`The event stream sent no data for ${idleTimeoutMs} ms`, {
        reason: 'idle_timeout',
        cause,
      });
    const userAborted = (): AbortError | undefined =>
      request.signal?.aborted
        ? new AbortError(undefined, { cause: request.signal.reason })
        : undefined;

    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let finished = false;
    try {
      arm();
      let response: Response;
      try {
        response = await raceSignal(
          this.config.fetch(request.url, this.init(request, scope.signal)),
          scope.signal
        );
        if (!response.ok) throw await errorFromResponse(response, scope.signal);
      } catch (error) {
        throw idleFired ? idleError(error) : scope.classify(error);
      }
      const contentType = response.headers.get('content-type') ?? '';
      if (!EVENT_STREAM.test(contentType)) {
        throw new StreamError(
          `Expected a text/event-stream response, received ${contentType === '' ? 'no content type' : contentType}`,
          { reason: 'protocol', status: response.status }
        );
      }
      if (response.body === null) {
        finished = true;
        return;
      }
      const body = response.body.getReader();
      reader = body;
      // Any read failure after the headers is the stream's: idle timer, caller's abort, else a network failure.
      const mapMidStream = (error: unknown): RtlsError =>
        idleFired
          ? idleError(error)
          : (userAborted() ??
            new StreamError('The event stream failed', { reason: 'network', cause: error }));
      const signal = scope.signal;
      const read = async (): Promise<ReadableStreamReadResult<Uint8Array>> => {
        try {
          return await raceSignal(body.read(), signal);
        } catch (error) {
          throw mapMidStream(error);
        }
      };
      const chunks = async function* (): AsyncGenerator<Uint8Array, void, undefined> {
        for (let next = await read(); !next.done; next = await read()) {
          arm();
          yield next.value;
        }
      };
      for await (const event of parseSse(chunks())) yield event;
      finished = true;
    } finally {
      disarm();
      if (!finished) scope.abort(new StreamStopMarker('The event stream was closed by the SDK'));
      // Not awaited: the abort above already ends the connection, and a body source may settle its cancel late.
      // A body that is already errored or closed rejects the cancel; there is nothing left to release then.
      reader?.cancel().then(undefined, () => undefined);
      scope.release();
    }
  }

  private async send(
    method: HttpMethod,
    path: string,
    options: TransportOptions | undefined
  ): Promise<TransportResponse<unknown>> {
    const prepared = this.prepare(method, path, options);
    return await withRetry(
      this.config.retry,
      { method, retry: prepared.retry, signal: prepared.signal },
      () => this.attempt(prepared)
    );
  }

  /** Validates everything and builds URL, headers and body; throws before any request is sent. */
  private prepare(
    method: HttpMethod,
    path: string,
    options: TransportOptions | undefined,
    shape: RequestShape = {}
  ): PreparedRequest {
    const timeoutMs = resolveTimeoutMs(options?.timeoutMs, this.config.timeoutMs);
    const retry = checkCallRetry(options?.retry);
    const url = buildUrl(this.config.baseUrl, path, options?.params, options?.query);
    const hasJsonBody = options?.body !== undefined;
    if (hasJsonBody && method === 'GET') throw bodyOnGetError();
    const headers = buildRequestHeaders({
      client: this.config.headers,
      credential: this.config.credential,
      accept: shape.accept,
      perCall: options?.headers,
      jsonBody: hasJsonBody,
      multipart: shape.multipart !== undefined,
    });
    return {
      method,
      url,
      headers,
      body: shape.multipart ?? (hasJsonBody ? JSON.stringify(options?.body) : undefined),
      timeoutMs,
      signal: options?.signal,
      parseAs: options?.parseAs ?? 'auto',
      retry,
    };
  }

  private init(request: PreparedRequest, signal: AbortSignal): RequestInit {
    return { method: request.method, headers: request.headers, body: request.body, signal };
  }

  /** One attempt: the timer covers headers and body; a non-2xx status is mapped with `createError`. */
  private async attempt(request: PreparedRequest): Promise<TransportResponse<unknown>> {
    if (request.parseAs === 'stream') return await this.attemptStreamed(request);
    return await runWithSignals(
      { signal: request.signal, timeoutMs: request.timeoutMs },
      async (signal) => {
        const response = await raceSignal(
          this.config.fetch(request.url, this.init(request, signal)),
          signal
        );
        if (!response.ok) throw await errorFromResponse(response, signal);
        const data = await parseResponseBody(response, request.parseAs, signal);
        return { data, status: response.status, headers: response.headers };
      }
    );
  }

  /**
   * `parseAs: 'stream'`: the timer covers the headers only; the caller's signal stays attached until the returned
   * body ends or is cancelled, so it still aborts the body.
   */
  private async attemptStreamed(request: PreparedRequest): Promise<TransportResponse<unknown>> {
    const scope = openSignalScope(request.signal, request.timeoutMs);
    let response: Response;
    try {
      response = await raceSignal(
        this.config.fetch(request.url, this.init(request, scope.signal)),
        scope.signal
      );
      if (!response.ok) throw await errorFromResponse(response, scope.signal);
    } catch (error) {
      const mapped = scope.classify(error);
      scope.release();
      throw mapped;
    }
    scope.clearTimer();
    const body = response.body;
    if (body === null) scope.release();
    return {
      data: body === null ? null : releaseOnEnd(body, scope),
      status: response.status,
      headers: response.headers,
    };
  }
}
