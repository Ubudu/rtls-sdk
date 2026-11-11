import createClient, { type Client } from 'openapi-fetch';
import type { paths } from '../types';
import { ValidationError } from '../errors';
import type { RtlsContext, CallContext } from '../context';
import {
  checkLevel,
  checkMapId,
  checkNamespace,
  checkVenueId,
  patchContext,
  resolveContext,
  requireNamespace,
  requireVenueId,
  requireMapId,
} from '../context';
import {
  applyCredential,
  checkTimeoutMs,
  clientHeadersOf,
  credentialHeadersOf,
  withoutCredentialHeaders,
  type CredentialHeader,
} from './http';
import { Transport } from './transport';
import { resolveRetryPolicy, type ResolvedRetryPolicy, type RetryPolicy } from './retry';

export type { RetryPolicy } from './retry';

/** Default API base URL. */
export const DEFAULT_BASE_URL = 'https://rtls.ubudu.com/api';
/** Default per-attempt timeout in milliseconds. */
export const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Which credential is sent (exactly one per request).
 * - `'auto'` (default): `Authorization: Bearer <accessToken>` when `accessToken` is set, else `X-API-Key: <apiKey>`.
 * - `'apiKey'`: always `X-API-Key` (requires `apiKey`).
 * - `'bearer'`: always `Authorization: Bearer` (requires `accessToken`).
 */
export type AuthMode = 'auto' | 'apiKey' | 'bearer';

const AUTH_MODES: readonly AuthMode[] = ['auto', 'apiKey', 'bearer'];

export interface RtlsClientOptions {
  /**
   * API base URL, `http:` or `https:`, or a root-relative path such as `/rtls-api` (a same-origin proxy in a browser,
   * resolved by `fetch` against the page); default `https://rtls.ubudu.com/api`; trailing `/` stripped.
   */
  baseUrl?: string;
  /** API key, sent as `X-API-Key` (unless `accessToken` wins, see `auth`). */
  apiKey?: string;
  /** Bearer token, sent as `Authorization: Bearer <token>` (wins over `apiKey` unless `auth` says otherwise). */
  accessToken?: string;
  /** Credential selection when both `apiKey` and `accessToken` are set; default `'auto'` (Bearer wins). */
  auth?: AuthMode;
  /** Per-attempt timeout in ms (headers and body); default 30 000; `0` or `Infinity` disables it. */
  timeoutMs?: number;
  /**
   * Retry of idempotent requests; default `false`. `true` applies the {@link RetryPolicy} defaults: GET only,
   * 2 retries on 429/502/503/504, network errors and timeouts, `Retry-After` honoured up to 60 s. Uploads, streams
   * and non-idempotent writes are never retried: the SDK opts those calls out itself (there is no per-call option).
   */
  retry?: boolean | RetryPolicy;
  /**
   * `fetch` implementation. Default: the global `fetch`, looked up on every call (so a `fetch` patched after the client
   * was created, for example by a test harness, applies).
   */
  fetch?: typeof fetch;
  /** Headers sent on every request; a `Content-Type` here is ignored (it is set only with a JSON body). */
  headers?: Record<string, string>;
  /** Default namespace for all API calls */
  namespace?: string;
  /** Default venue ID for venue-scoped API calls */
  venueId?: number;
  /** Default map ID for map-scoped API calls */
  mapId?: number;
  /** Default floor level for spatial queries */
  level?: number;
}

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

function optionError(option: string, message: string): ValidationError {
  return new ValidationError(message, undefined, { status: 0, details: [option] });
}

/** Normalised, validated client options. */
interface ResolvedClientOptions extends RtlsClientOptions {
  baseUrl: string;
  timeoutMs: number;
  auth: AuthMode;
  /** The validated `retry` option; `undefined` = no retry. */
  retryPolicy: ResolvedRetryPolicy | undefined;
}

function normaliseBaseUrl(value: unknown): string {
  if (value === undefined) return DEFAULT_BASE_URL;
  if (typeof value !== 'string') {
    throw optionError('baseUrl', 'baseUrl must be an http(s) URL string');
  }
  // A root-relative path (not `//host`, which names another host): 0.2.0 accepted it, fetch resolves it in a browser.
  if (/^\/(?!\/)/.test(value)) return value.replace(/\/+$/, '');
  let url: URL;
  try {
    url = new URL(value);
  } catch (cause) {
    throw new ValidationError('baseUrl must be an http(s) URL', undefined, {
      status: 0,
      details: ['baseUrl'],
      cause,
    });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw optionError('baseUrl', `baseUrl must use http: or https:, not ${url.protocol}`);
  }
  return value.replace(/\/+$/, '');
}

function configured(value: unknown, option: 'apiKey' | 'accessToken'): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw optionError(option, `${option} must be a string`);
  return value;
}

/** Validates the constructor options (ValidationError with status 0) and fills the defaults. */
function resolveClientOptions(options: RtlsClientOptions): ResolvedClientOptions {
  const auth = options.auth ?? 'auto';
  if (!AUTH_MODES.includes(auth)) {
    throw optionError('auth', `auth must be one of 'auto', 'apiKey', 'bearer'`);
  }
  const apiKey = configured(options.apiKey, 'apiKey');
  const accessToken = configured(options.accessToken, 'accessToken');
  if (auth === 'apiKey' && apiKey === undefined) {
    throw optionError('auth', "auth: 'apiKey' needs an apiKey");
  }
  if (auth === 'bearer' && accessToken === undefined) {
    throw optionError('auth', "auth: 'bearer' needs an accessToken");
  }
  if (options.fetch !== undefined && typeof options.fetch !== 'function') {
    throw optionError('fetch', 'fetch must be a function');
  }
  return {
    ...options,
    baseUrl: normaliseBaseUrl(options.baseUrl),
    timeoutMs: checkTimeoutMs(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 'timeoutMs'),
    auth,
    retryPolicy: resolveRetryPolicy(options.retry),
  };
}

/**
 * What a scoped client (`forNamespace`, `forVenue`, `forMap`, `withContext`) shares with its parent: the transport
 * and the `raw` openapi-fetch client, so middleware added with `raw.use()` applies to both. Only the context differs.
 * @internal
 */
export interface SharedConnection {
  readonly transport: Transport;
  readonly raw: Client<paths>;
}

export class BaseClient {
  protected readonly client: Client<paths>;
  protected readonly options: ResolvedClientOptions;

  /**
   * The typed transport resources use (`this.transport` in a resource).
   * @internal
   */
  readonly transport: Transport;

  /** Internal mutable context state */
  protected _context: RtlsContext;

  /**
   * @param options client options, validated here (`ValidationError` with status 0) and the default context
   *   (`ContextError` for an invalid id)
   * @param shared internal: the transport and `raw` client of the parent of a scoped client
   */
  constructor(options: RtlsClientOptions = {}, shared?: SharedConnection) {
    this.options = resolveClientOptions(options);

    this._context = patchContext({}, options);

    this.client = shared?.raw ?? this.createRawClient();
    this.transport =
      shared?.transport ??
      new Transport({
        baseUrl: this.options.baseUrl,
        timeoutMs: this.options.timeoutMs,
        headers: this.options.headers,
        credential: this.credentialHeader(),
        fetch: this.fetchImpl,
        retry: this.options.retryPolicy,
      });
  }

  /**
   * The connection a scoped client of this client shares (see {@link SharedConnection}).
   * @internal
   */
  protected sharedConnection(): SharedConnection {
    return { transport: this.transport, raw: this.client };
  }

  /**
   * The credential header this client sends (at most one), or `undefined` without a credential. Per-call or
   * client-level `Authorization` / `X-API-Key` headers replace it.
   * @internal
   */
  protected credentialHeader(): CredentialHeader | undefined {
    const credential = this.selectedCredential();
    if (credential === undefined) return undefined;
    return credential.kind === 'bearer'
      ? ['Authorization', `Bearer ${credential.value}`]
      : ['X-API-Key', credential.value];
  }

  /**
   * The one credential this client uses: the access token unless `auth: 'apiKey'`, else the API key.
   * @internal
   */
  protected selectedCredential(): { kind: 'bearer' | 'apiKey'; value: string } | undefined {
    const apiKey = configured(this.options.apiKey, 'apiKey');
    const accessToken = configured(this.options.accessToken, 'accessToken');
    // The constructor guarantees that a forced mode has its credential.
    if (accessToken !== undefined && this.options.auth !== 'apiKey') {
      return { kind: 'bearer', value: accessToken };
    }
    if (apiKey !== undefined) return { kind: 'apiKey', value: apiKey };
    return undefined;
  }

  /** `fetch` resolved per call: the configured one, else the global one at call time. */
  protected readonly fetchImpl = (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => (this.options.fetch ?? globalThis.fetch)(input, init);

  /**
   * The openapi-fetch client behind `raw`: same base URL, no forced `Content-Type` (openapi-fetch sets it only with a
   * JSON body), client headers minus `Content-Type`, and exactly one credential, added by a first middleware when
   * the request carries none.
   */
  private createRawClient(): Client<paths> {
    const clientHeaders = clientHeadersOf(this.options.headers);
    const clientCredentials = credentialHeadersOf(clientHeaders);
    const baseHeaders: Record<string, string> = {};
    withoutCredentialHeaders(clientHeaders).forEach((value, name) => {
      baseHeaders[name] = value;
    });
    const credential = this.credentialHeader();
    const raw = createClient<paths>({
      baseUrl: this.options.baseUrl,
      fetch: this.fetchImpl,
      headers: baseHeaders,
    });
    raw.use({
      onRequest({ request }) {
        applyCredential(request.headers, clientCredentials, credential);
        return undefined;
      },
    });
    return raw;
  }

  get raw(): Client<paths> {
    return this.client;
  }

  // ─── Context Getters ───────────────────────────────────────────────────────

  /** Get current default context (read-only copy) */
  get context(): Readonly<RtlsContext> {
    return { ...this._context };
  }

  /** Get current default namespace */
  get namespace(): string | undefined {
    return this._context.namespace;
  }

  /** Get current default venue ID */
  get venueId(): number | undefined {
    return this._context.venueId;
  }

  /** Get current default map ID */
  get mapId(): number | undefined {
    return this._context.mapId;
  }

  /** Get current default level */
  get level(): number | undefined {
    return this._context.level;
  }

  // ─── Context Setters (Mutable, Chainable) ──────────────────────────────────

  /**
   * Set default namespace. Chainable.
   * @throws {ContextError} problem `'invalid'` for a non-string
   */
  setNamespace(namespace: string): this {
    this._context.namespace = checkNamespace(namespace);
    return this;
  }

  /**
   * Set default venue ID. Chainable.
   * @throws {ContextError} problem `'invalid'` unless an integer `>= 0`
   */
  setVenue(venueId: number): this {
    this._context.venueId = checkVenueId(venueId);
    return this;
  }

  /**
   * Set default map ID. Chainable.
   * @throws {ContextError} problem `'invalid'` unless an integer `>= 0`
   */
  setMap(mapId: number): this {
    this._context.mapId = checkMapId(mapId);
    return this;
  }

  /**
   * Set default level. Chainable.
   * @throws {ContextError} problem `'invalid'` unless an integer (negative levels are allowed)
   */
  setLevel(level: number): this {
    this._context.level = checkLevel(level);
    return this;
  }

  /**
   * Set multiple context values at once. Chainable. A key present with `undefined` or `null` clears that value; an
   * absent key keeps it; other values are validated.
   * @throws {ContextError} problem `'invalid'` for an invalid value (nothing is changed then)
   */
  setContext(context: Partial<RtlsContext>): this {
    this._context = patchContext(this._context, context);
    return this;
  }

  /** Clear all default context values. Chainable. */
  clearContext(): this {
    this._context = {};
    return this;
  }

  // ─── Context Resolution (Protected, for Resources) ─────────────────────────

  /**
   * Resolve context by merging client defaults with call-time overrides.
   * @internal Used by resource classes
   */
  resolveCtx(overrides?: CallContext): RtlsContext {
    return resolveContext(this._context, overrides);
  }

  /**
   * Resolve context and require namespace to be present.
   * @internal Used by resource classes
   * @throws {ContextError} If namespace is not available
   */
  requireNs(overrides?: CallContext): string {
    return requireNamespace(this.resolveCtx(overrides)).namespace;
  }

  /**
   * Resolve context and require venueId to be present.
   * @internal Used by resource classes
   * @throws {ContextError} If venueId is not available
   */
  requireVenue(overrides?: CallContext): number {
    return requireVenueId(this.resolveCtx(overrides)).venueId;
  }

  /**
   * Resolve context and require mapId to be present.
   * @internal Used by resource classes
   * @throws {ContextError} If mapId is not available
   */
  requireMap(overrides?: CallContext): number {
    return requireMapId(this.resolveCtx(overrides)).mapId;
  }
}
