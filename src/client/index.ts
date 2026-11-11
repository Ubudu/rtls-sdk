import {
  BaseClient,
  type RtlsClientOptions,
  type RequestOptions,
  type SharedConnection,
} from './base';
import { AssetsResource } from '../resources/assets';
import { AssetDocumentsResource } from '../resources/asset-documents';
import { AssetTreeResource } from '../resources/asset-tree';
import { DataModelsResource } from '../resources/data-models';
import { DeclaredLocationsResource } from '../resources/declared-locations';
import {
  TagActionsResource,
  type TagAction,
  type TagActionsResult,
} from '../resources/tag-actions';
import { PositionsResource } from '../resources/positions';
import { SpatialResource } from '../resources/spatial';
import { VenuesResource } from '../resources/venues';
import { ZonesResource } from '../resources/zones';
import { NavigationResource } from '../resources/navigation';
import { DashboardsResource } from '../resources/dashboards';
import { AlertsResource } from '../resources/alerts';
import { AlertRulesResource } from '../resources/alert-rules';
import { SettingsResource, type Settings } from '../resources/settings';
import { NotificationsResource } from '../resources/notifications';
import { EtlResource } from '../resources/etl';
import { ContextError, ServerError, ValidationError } from '../errors';
import { patchContext, type CallContext, type RtlsContext } from '../context';
import type { HealthStatus } from '../types';
import { splitCallOptions } from '../utils/args';
import { RtlsWebSocketClient, type WebSocketClientConfig } from '../websocket';

export type { RtlsClientOptions, RequestOptions, AuthMode, RetryPolicy } from './base';
export type { HttpMethod } from './paths';
export type {
  Transport,
  TransportOptions,
  TransportResponse,
  DownloadResult,
  ParseAs,
} from './transport';

/**
 * The main RTLS API client providing access to all resources.
 *
 * @example
 * ```typescript
 * import { RtlsClient } from 'ubudu-rtls-sdk';
 *
 * const client = new RtlsClient({ apiKey: 'your-api-key', namespace: 'my-namespace' });
 * const assets = await client.assets.list();
 * ```
 */
export class RtlsClient extends BaseClient {
  /** Asset records: list, get, create, update, delete, batch writes, history. */
  readonly assets: AssetsResource;
  /** Documents attached to assets. */
  readonly assetDocuments: AssetDocumentsResource;
  /** The namespace's asset tree (read only). */
  readonly assetTree: AssetTreeResource;
  /** The namespace's asset data model (read only). */
  readonly dataModels: DataModelsResource;
  /** Declared asset locations. */
  readonly declaredLocations: DeclaredLocationsResource;
  /** BLE and ESL tag actions. */
  readonly tagActions: TagActionsResource;
  /** Cached and historical positions. */
  readonly positions: PositionsResource;
  /** Spatial queries on zones, POIs and assets. */
  readonly spatial: SpatialResource;
  /** Venues, maps, POIs and paths. */
  readonly venues: VenuesResource;
  /** Venue zones and zone presence. */
  readonly zones: ZonesResource;
  /** Indoor routing. */
  readonly navigation: NavigationResource;
  /** Dashboards. */
  readonly dashboards: DashboardsResource;
  /** Alert events. */
  readonly alerts: AlertsResource;
  /** The namespace's alert rules. */
  readonly alertRules: AlertRulesResource;
  /** Namespace settings (read only). */
  readonly settings: SettingsResource;
  /** The notification center. */
  readonly notifications: NotificationsResource;
  /** ETL imports. */
  readonly etl: EtlResource;

  /**
   * @param options client options (see {@link RtlsClientOptions})
   * @throws {ValidationError} status 0 for an invalid option
   * @throws {ContextError} problem `'invalid'` for an invalid default context id
   */
  constructor(options?: RtlsClientOptions);
  /**
   * The scoped factories pass the parent's connection, so that a scoped client shares its transport and `raw` client.
   * @internal
   */
  constructor(options: RtlsClientOptions | undefined, shared: SharedConnection);
  constructor(options?: RtlsClientOptions, shared?: SharedConnection) {
    super(options, shared);

    this.assets = new AssetsResource(this);
    this.assetDocuments = new AssetDocumentsResource(this);
    this.assetTree = new AssetTreeResource(this);
    this.dataModels = new DataModelsResource(this);
    this.declaredLocations = new DeclaredLocationsResource(this);
    this.tagActions = new TagActionsResource(this);
    this.positions = new PositionsResource(this);
    this.spatial = new SpatialResource(this);
    this.venues = new VenuesResource(this);
    this.zones = new ZonesResource(this);
    this.navigation = new NavigationResource(this);
    this.dashboards = new DashboardsResource(this);
    this.alerts = new AlertsResource(this);
    this.alertRules = new AlertRulesResource(this);
    this.settings = new SettingsResource(this);
    this.notifications = new NotificationsResource(this);
    this.etl = new EtlResource(this);
  }

  /**
   * The API health (`GET /health`; public, no credential needed).
   *
   * @param options request options (`signal`, `timeoutMs`, `headers`)
   * @returns `{ status: 'OK' }`
   * @throws {ServiceUnavailableError} 503 when the API is not ready; `message` is the server's `status` text
   * @example
   * ```typescript
   * import { createRtlsClient } from 'ubudu-rtls-sdk';
   *
   * const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY });
   * const health = await client.health();
   * console.log('API status:', health.status); // 'OK'
   * ```
   */
  async health(options?: RequestOptions): Promise<HealthStatus> {
    const { request } = splitCallOptions(options);
    return await this.transport.request('GET', '/health', request);
  }

  /**
   * The settings document of a namespace.
   *
   * @deprecated since 0.3.0 — use `client.settings.get()`.
   * @param namespaceOrOptions a namespace (the 0.2.0 form), or a `CallContext & RequestOptions` bag; without a
   *   namespace the client's default namespace applies
   * @param options request options; they win over the request options of the bag
   * @throws {ContextError} when no namespace is given or set (nothing is sent)
   * @example
   * ```typescript
   * const settings = await client.settings.get({ namespace: 'my-namespace' });
   * ```
   */
  async getSettings(
    namespaceOrOptions?: string | (CallContext & RequestOptions),
    options?: RequestOptions
  ): Promise<Settings> {
    const bag =
      namespaceOrOptions === undefined || typeof namespaceOrOptions === 'object'
        ? namespaceOrOptions
        : { namespace: namespaceOrOptions };
    const { ctx, request } = splitCallOptions(bag, options);
    return await this.settings.get({ ...ctx, ...request });
  }

  /**
   * Runs an Elasticsearch query (`POST /es/query/{appNamespace}/{dataType}`). The query should carry a time `range`
   * and a `size` (the server rejects unbounded queries). Read-only, so it is retried under the client's retry policy.
   *
   * @deprecated since 0.3.0 — use `client.positions.query()`.
   * @param namespace the namespace (`''` = the client default)
   * @param dataType `'alerts'`, `'positions'` or `'zone_visits'`
   * @param query the Elasticsearch query body
   * @param options request options
   * @returns the search response as the server returns it (`hits`, …)
   * @throws {ContextError} when no namespace is given or set (nothing is sent)
   * @example
   * ```typescript
   * const result = await client.esQuery('my-namespace', 'alerts', {
   *   size: 10,
   *   query: { range: { timestamp: { gte: Date.now() - 3_600_000 } } },
   * });
   * ```
   */
  async esQuery(
    namespace: string,
    dataType: 'alerts' | 'positions' | 'zone_visits',
    query: Record<string, unknown>,
    options?: RequestOptions
  ): Promise<Record<string, unknown>> {
    // The 0.2.0 return type is an index signature, which the EsSearchResponse interface is not assignable to.
    return { ...(await this.positions.query(dataType, query, { ...options, namespace })) };
  }

  /**
   * Sends actions to tags (LED colours, UWB blink).
   *
   * @deprecated since 0.3.0 — use `client.tagActions.send()`.
   * @param namespace the namespace (`''` = the client default)
   * @param actions the actions to send
   * @param options request options
   * @returns the message and the number of tags reached
   * @throws {ServerError} status 500 when part of the actions failed, also when the server's answer says
   *   `success: false` (the 0.2.0 failure behaviour)
   * @example
   * ```typescript
   * const result = await client.tagActions.send(
   *   [{ macAddress: 'aabbccddeeff', action: 'ptlGreen' }],
   *   { namespace: 'my-namespace' }
   * );
   * ```
   */
  async sendTagActions(
    namespace: string,
    actions: TagAction[],
    options?: RequestOptions
  ): Promise<TagActionsResult> {
    const result = await this.tagActions.send(actions, { ...options, namespace });
    if (result.success === false) throw new ServerError(result.message, result, { status: 500 });
    return result;
  }

  // ─── Scoped Client Factories (Immutable) ─────────────────────────────────

  /**
   * Create a new client instance scoped to a specific namespace.
   * The new client inherits all other settings from the parent and shares its transport and `raw` client (middleware
   * added with `raw.use()` applies to both); only the context differs.
   * @param namespace - The namespace to scope to
   * @returns New RtlsClient instance (original unchanged)
   */
  forNamespace(namespace: string): RtlsClient {
    return new RtlsClient(
      {
        ...this.options,
        namespace,
        venueId: this._context.venueId,
        mapId: this._context.mapId,
        level: this._context.level,
      },
      this.sharedConnection()
    );
  }

  /**
   * Create a new client instance scoped to a specific venue.
   * The new client inherits namespace and other settings from the parent and shares its transport and `raw` client.
   * @throws {ContextError} problem `'invalid'` unless `venueId` (and `mapId`, `level`) are valid
   * @param venueId - The venue ID to scope to
   * @param options - Optional map ID and level overrides
   * @returns New RtlsClient instance (original unchanged)
   */
  forVenue(venueId: number, options?: { mapId?: number; level?: number }): RtlsClient {
    return new RtlsClient(
      {
        ...this.options,
        namespace: this._context.namespace,
        venueId,
        mapId: options?.mapId ?? this._context.mapId,
        level: options?.level ?? this._context.level,
      },
      this.sharedConnection()
    );
  }

  /**
   * Create a new client instance scoped to a specific map.
   * The new client inherits namespace, venue, and other settings from the parent and shares its transport and `raw`
   * client.
   * @throws {ContextError} problem `'invalid'` unless `mapId` (and `level`) are valid
   * @param mapId - The map ID to scope to
   * @param options - Optional level override
   * @returns New RtlsClient instance (original unchanged)
   */
  forMap(mapId: number, options?: { level?: number }): RtlsClient {
    return new RtlsClient(
      {
        ...this.options,
        namespace: this._context.namespace,
        venueId: this._context.venueId,
        mapId,
        level: options?.level ?? this._context.level,
      },
      this.sharedConnection()
    );
  }

  /**
   * Create a new client instance with merged context.
   * Values in the provided context override the parent's values; a key present with `undefined` or `null` clears
   * that value in the new client (0.2.0 kept the parent's value). The new client shares the parent's transport and
   * `raw` client.
   * @param context - Context values to set, override or clear
   * @returns New RtlsClient instance (original unchanged)
   * @throws {ContextError} problem `'invalid'` for an invalid value
   */
  withContext(context: Partial<RtlsContext>): RtlsClient {
    const next = patchContext(this._context, context);
    return new RtlsClient(
      {
        ...this.options,
        namespace: next.namespace,
        venueId: next.venueId,
        mapId: next.mapId,
        level: next.level,
      },
      this.sharedConnection()
    );
  }

  // ─── WebSocket Client Factory ─────────────────────────────────────────────

  /**
   * Creates a WebSocket client with this client's namespace, credential and base URL. Nothing is connected until
   * `connect()` is called.
   *
   * - Namespace: `options.namespace`, else the client's default namespace.
   * - Credential: the access token as `token` (unless `auth: 'apiKey'`), else the API key as `apiKey`.
   * - URLs from `baseUrl`: `https:` → `wss:`, `http:` → `ws:`, the path is kept, then `/ws/subscriber` and
   *   `/ws/publisher` (with the default `baseUrl`, the production broker URLs). A root-relative `baseUrl` is
   *   resolved against the page (`location`); outside a browser pass `subscriberUrl` and `publisherUrl`.
   *
   * Options passed here win over the derived values (`token`, `apiKey`, `subscriberUrl`, `publisherUrl`, …).
   *
   * @param options WebSocket options
   * @throws {ContextError} when no namespace is given or set
   * @throws {ValidationError} status 0 when neither the client nor `options` carry an API key or token, or when a
   *   root-relative `baseUrl` cannot be resolved (no `location`) and `options` do not give both URLs
   * @example
   * ```typescript
   * import { createRtlsClient, SubscriptionType } from 'ubudu-rtls-sdk';
   *
   * const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace' });
   * const ws = client.createWebSocket();
   * ws.on('POSITIONS', (position) => console.log(position));
   * await ws.connect();
   * await ws.subscribe([SubscriptionType.POSITIONS]);
   * ```
   */
  createWebSocket(options?: Partial<WebSocketClientConfig>): RtlsWebSocketClient {
    const { namespace } = this.resolveCtx({ namespace: options?.namespace });
    if (namespace === undefined || namespace === '') {
      throw new ContextError(
        'Namespace',
        'Pass { namespace } or set a default namespace on the client'
      );
    }
    const selected = this.selectedCredential();
    const credential =
      selected === undefined
        ? {}
        : selected.kind === 'bearer'
          ? { token: selected.value }
          : { apiKey: selected.value };
    const derived = webSocketUrls(this.options.baseUrl);
    const config: WebSocketClientConfig = {
      ...credential,
      ...derived,
      ...options,
      namespace,
    };
    if (!config.apiKey && !config.token) {
      throw new ValidationError('createWebSocket() needs an apiKey or accessToken', undefined, {
        status: 0,
        details: ['apiKey', 'accessToken'],
      });
    }
    if (
      derived.subscriberUrl === undefined &&
      (config.subscriberUrl === undefined || config.publisherUrl === undefined)
    ) {
      throw new ValidationError(
        'createWebSocket() cannot derive the broker URLs from a relative baseUrl here: pass subscriberUrl and publisherUrl',
        undefined,
        { status: 0, details: ['subscriberUrl', 'publisherUrl'] }
      );
    }
    return new RtlsWebSocketClient(config);
  }
}

/**
 * The broker URLs under `baseUrl`: `https:` → `wss:`, `http:` → `ws:`, the base path kept. A root-relative `baseUrl`
 * is resolved against `location`; without one there is nothing to derive (`{}`).
 */
function webSocketUrls(baseUrl: string): { subscriberUrl?: string; publisherUrl?: string } {
  const page = (globalThis as { location?: { href?: unknown } }).location?.href;
  if (baseUrl.startsWith('/') && typeof page !== 'string') return {};
  const url = new URL(baseUrl, typeof page === 'string' ? page : undefined);
  const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const base = `${protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}`;
  return { subscriberUrl: `${base}/ws/subscriber`, publisherUrl: `${base}/ws/publisher` };
}

/**
 * Creates a new RTLS API client instance.
 *
 * @param options - Client configuration options
 * @returns Configured RtlsClient instance
 * @throws {ValidationError} status 0 for an invalid option (`baseUrl`, `timeoutMs`, `auth`, `retry`, …)
 *
 * @example
 * ```typescript
 * import { createRtlsClient } from 'ubudu-rtls-sdk';
 *
 * const client = createRtlsClient({
 *   apiKey: 'your-api-key',
 *   namespace: 'my-namespace',
 *   timeoutMs: 10000,
 * });
 *
 * const assets = await client.assets.list();
 * ```
 *
 * @example
 * ```javascript
 * const { createRtlsClient } = require('ubudu-rtls-sdk');
 *
 * const client = createRtlsClient({
 *   apiKey: process.env.RTLS_API_KEY,
 * });
 * ```
 */
export function createRtlsClient(options?: RtlsClientOptions): RtlsClient {
  return new RtlsClient(options);
}
