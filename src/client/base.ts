import createClient, { type Client } from 'openapi-fetch';
import type { paths } from '../generated/schema';
import { createError, NetworkError, TimeoutError, RtlsError } from '../errors';
import type { RtlsContext, CallContext } from '../context';
import { resolveContext, requireNamespace, requireVenueId, requireMapId } from '../context';

export interface RtlsClientOptions {
  baseUrl?: string;
  apiKey?: string;
  accessToken?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
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

export class BaseClient {
  protected readonly client: Client<paths>;
  protected readonly options: Required<Pick<RtlsClientOptions, 'baseUrl' | 'timeoutMs'>> &
    RtlsClientOptions;

  /** Internal mutable context state */
  protected _context: RtlsContext;

  constructor(options: RtlsClientOptions = {}) {
    this.options = {
      baseUrl: 'https://rtls.ubudu.com/api',
      timeoutMs: 30000,
      ...options,
    };

    this._context = {
      namespace: options.namespace,
      venueId: options.venueId,
      mapId: options.mapId,
      level: options.level,
    };

    this.client = createClient<paths>({
      baseUrl: this.options.baseUrl,
      fetch: this.options.fetch,
      headers: this.buildHeaders(),
    });
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.options.headers,
    };

    if (this.options.apiKey) {
      headers['X-API-Key'] = this.options.apiKey;
    }

    if (this.options.accessToken) {
      headers['Authorization'] = `Bearer ${this.options.accessToken}`;
    }

    return headers;
  }

  protected createTimeoutSignal(timeoutMs?: number): AbortSignal {
    const timeout = timeoutMs ?? this.options.timeoutMs;
    return AbortSignal.timeout(timeout);
  }

  protected mergeSignals(userSignal?: AbortSignal, timeoutMs?: number): AbortSignal {
    const timeoutSignal = this.createTimeoutSignal(timeoutMs);
    if (!userSignal) {
      return timeoutSignal;
    }
    if ('any' in AbortSignal) {
      return (
        AbortSignal as typeof AbortSignal & { any: (signals: AbortSignal[]) => AbortSignal }
      ).any([userSignal, timeoutSignal]);
    }
    return timeoutSignal;
  }

  protected async handleResponse<T>(response: {
    data?: T;
    error?: unknown;
    response: Response;
  }): Promise<T> {
    if (response.error !== undefined || !response.response.ok) {
      const status = response.response.status;
      let body = response.error;

      if (body === undefined) {
        try {
          body = await response.response.clone().json();
        } catch {
          try {
            body = await response.response.clone().text();
          } catch {
            body = null;
          }
        }
      }

      throw createError(status, body);
    }

    return response.data as T;
  }

  protected async request<T>(
    executor: (options: {
      signal?: AbortSignal;
      headers?: Record<string, string>;
    }) => Promise<{ data?: T; error?: unknown; response: Response }>,
    requestOptions?: RequestOptions
  ): Promise<T> {
    const signal = this.mergeSignals(requestOptions?.signal, requestOptions?.timeoutMs);

    try {
      const response = await executor({ signal, headers: requestOptions?.headers });
      return this.handleResponse(response);
    } catch (error) {
      if (error instanceof RtlsError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError' || error.name === 'TimeoutError') {
          throw new TimeoutError();
        }
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
          throw new NetworkError(error.message, error);
        }
      }

      throw new NetworkError('Unknown error occurred', error as Error);
    }
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

  /** Set default namespace. Chainable. */
  setNamespace(namespace: string): this {
    this._context.namespace = namespace;
    return this;
  }

  /** Set default venue ID. Chainable. */
  setVenue(venueId: number): this {
    this._context.venueId = venueId;
    return this;
  }

  /** Set default map ID. Chainable. */
  setMap(mapId: number): this {
    this._context.mapId = mapId;
    return this;
  }

  /** Set default level. Chainable. */
  setLevel(level: number): this {
    this._context.level = level;
    return this;
  }

  /** Set multiple context values at once. Chainable. */
  setContext(context: Partial<RtlsContext>): this {
    if (context.namespace !== undefined) this._context.namespace = context.namespace;
    if (context.venueId !== undefined) this._context.venueId = context.venueId;
    if (context.mapId !== undefined) this._context.mapId = context.mapId;
    if (context.level !== undefined) this._context.level = context.level;
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
