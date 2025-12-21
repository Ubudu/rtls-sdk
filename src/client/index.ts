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

  async health(requestOptions?: RequestOptions): Promise<Record<string, unknown>> {
    return this.request(
      (fetchOpts) => this.raw.GET('/health', fetchOpts),
      requestOptions
    ) as unknown as Promise<Record<string, unknown>>;
  }

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

export function createRtlsClient(options?: RtlsClientOptions): RtlsClient {
  return new RtlsClient(options);
}
