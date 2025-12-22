import { BaseClient, type RtlsClientOptions, type RequestOptions } from './base';
import { AssetsResource } from '../resources/assets';
import { PositionsResource } from '../resources/positions';
import { ZonesResource } from '../resources/zones';
import { VenuesResource } from '../resources/venues';
import { AlertsResource } from '../resources/alerts';
import { DashboardsResource } from '../resources/dashboards';
import { NavigationResource } from '../resources/navigation';
import { SpatialResource } from '../resources/spatial';

export { type RtlsClientOptions, type RequestOptions } from './base';

/**
 * The main RTLS API client providing access to all resources.
 *
 * @example
 * ```typescript
 * import { RtlsClient } from '@ubudu/rtls-sdk';
 *
 * const client = new RtlsClient({ apiKey: 'your-api-key' });
 * const assets = await client.assets.list('namespace');
 * ```
 */
export class RtlsClient extends BaseClient {
  readonly assets: AssetsResource;
  readonly positions: PositionsResource;
  readonly zones: ZonesResource;
  readonly venues: VenuesResource;
  readonly alerts: AlertsResource;
  readonly dashboards: DashboardsResource;
  readonly navigation: NavigationResource;
  readonly spatial: SpatialResource;

  constructor(options?: RtlsClientOptions) {
    super(options);

    this.assets = new AssetsResource(this);
    this.positions = new PositionsResource(this);
    this.zones = new ZonesResource(this);
    this.venues = new VenuesResource(this);
    this.alerts = new AlertsResource(this);
    this.dashboards = new DashboardsResource(this);
    this.navigation = new NavigationResource(this);
    this.spatial = new SpatialResource(this);
  }

  /**
   * Check the health status of the RTLS API.
   *
   * @param requestOptions - Optional request configuration (timeout, signal)
   * @returns Health status object from the API
   *
   * @example
   * ```typescript
   * const health = await client.health();
   * console.log('API Status:', health.status);
   * ```
   */
  async health(requestOptions?: RequestOptions): Promise<Record<string, unknown>> {
    return this.request(
      (fetchOpts) => this.raw.GET('/health', fetchOpts),
      requestOptions
    ) as unknown as Promise<Record<string, unknown>>;
  }

  /**
   * Get application settings for a namespace.
   *
   * @param namespace - The application namespace
   * @param requestOptions - Optional request configuration
   * @returns Settings object for the namespace
   *
   * @example
   * ```typescript
   * const settings = await client.getSettings('my-namespace');
   * ```
   */
  async getSettings(
    namespace: string,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.request(
      (fetchOpts) =>
        this.raw.GET('/settings/{app_namespace}', {
          params: { path: { app_namespace: namespace } },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<Record<string, unknown>>;
  }

  /**
   * Execute a custom Elasticsearch query.
   *
   * @param namespace - The application namespace
   * @param dataType - The type of data to query: 'alerts', 'positions', or 'zone_visits'
   * @param query - Elasticsearch query object
   * @param requestOptions - Optional request configuration
   * @returns Query results from Elasticsearch
   *
   * @example
   * ```typescript
   * const results = await client.esQuery('namespace', 'positions', {
   *   query: { match_all: {} },
   *   size: 10
   * });
   * ```
   */
  async esQuery(
    namespace: string,
    dataType: 'alerts' | 'positions' | 'zone_visits',
    query: Record<string, unknown>,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.request(
      (fetchOpts) =>
        this.raw.POST('/es/query/{appNamespace}/{dataType}', {
          params: { path: { appNamespace: namespace, dataType } },
          body: query as never,
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<Record<string, unknown>>;
  }

  /**
   * Send actions to tags (e.g., LED control, blink).
   *
   * @param namespace - The application namespace
   * @param actions - Array of tag actions to execute
   * @param requestOptions - Optional request configuration
   * @returns Result with message and count of affected tags
   *
   * @example
   * ```typescript
   * const result = await client.sendTagActions('namespace', [
   *   { macAddress: 'AA:BB:CC:DD:EE:FF', action: 'ptlGreen' },
   *   { macAddress: '11:22:33:44:55:66', action: 'uwbBlink' }
   * ]);
   * console.log(`Sent actions to ${result.tagCount} tags`);
   * ```
   */
  async sendTagActions(
    namespace: string,
    actions: Array<{
      macAddress: string;
      action: 'ptlRed' | 'ptlGreen' | 'uwbBlink' | 'ptlRedUwbBlink' | 'ptlGreenUwbBlink';
    }>,
    requestOptions?: RequestOptions
  ): Promise<{ message: string; tagCount: number }> {
    return this.request(
      (fetchOpts) =>
        this.raw.POST('/tag-actions/{appNamespace}', {
          params: { path: { appNamespace: namespace } },
          body: actions as never,
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<{ message: string; tagCount: number }>;
  }
}

/**
 * Creates a new RTLS API client instance.
 *
 * @param options - Client configuration options
 * @returns Configured RtlsClient instance
 *
 * @example
 * ```typescript
 * import { createRtlsClient } from '@ubudu/rtls-sdk';
 *
 * const client = createRtlsClient({
 *   apiKey: 'your-api-key',
 *   timeoutMs: 10000,
 * });
 *
 * const assets = await client.assets.list('namespace');
 * ```
 *
 * @example
 * ```javascript
 * const { createRtlsClient } = require('@ubudu/rtls-sdk');
 *
 * const client = createRtlsClient({
 *   apiKey: process.env.RTLS_API_KEY,
 * });
 * ```
 */
export function createRtlsClient(options?: RtlsClientOptions): RtlsClient {
  return new RtlsClient(options);
}
