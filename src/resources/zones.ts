import type { BaseClient, RequestOptions } from '../client/base';
import type { ZoneFeatureCollection, Zone } from '../types';
import type { CallContext } from '../context';
import { extractZonesFromGeoJSON } from '../utils/geojson';

export interface ZonePresenceOptions {
  timestampFrom: number;
  timestampTo: number;
  key?: string;
  value?: string;
  interval?: string;
}

export class ZonesResource {
  constructor(private client: BaseClient) {}

  // ─── List Zones ─────────────────────────────────────────────────────────────

  /**
   * List zones for a venue as GeoJSON FeatureCollection.
   *
   * @example
   * // Using default namespace/venue
   * const zones = await client.zones.list();
   *
   * // Override venue in options
   * const zones = await client.zones.list({ venueId: 123 });
   *
   * // Explicit namespace and venue (legacy)
   * const zones = await client.zones.list('my-namespace', 456);
   */
  async list(options?: CallContext, requestOptions?: RequestOptions): Promise<ZoneFeatureCollection>;
  async list(namespace: string, venueId: string | number, requestOptions?: RequestOptions): Promise<ZoneFeatureCollection>;
  async list(
    arg1?: string | CallContext,
    arg2?: string | number | RequestOptions,
    arg3?: RequestOptions
  ): Promise<ZoneFeatureCollection> {
    let namespace: string;
    let venueId: number;
    let requestOptions: RequestOptions | undefined;

    if (typeof arg1 === 'string') {
      namespace = arg1;
      venueId = Number(arg2);
      requestOptions = arg3;
    } else {
      namespace = this.client.requireNs(arg1);
      venueId = this.client.requireVenue(arg1);
      requestOptions = arg2 as RequestOptions | undefined;
    }

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/venues/{namespace}/{venueId}/zones', {
          params: {
            path: { namespace, venueId: String(venueId) },
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<ZoneFeatureCollection>;
  }

  // ─── List Zones as Array ────────────────────────────────────────────────────

  /**
   * List zones for a venue as flat array.
   *
   * @example
   * // Using default namespace/venue
   * const zones = await client.zones.listAsArray();
   *
   * // Explicit namespace and venue (legacy)
   * const zones = await client.zones.listAsArray('my-namespace', 456);
   */
  async listAsArray(options?: CallContext, requestOptions?: RequestOptions): Promise<Zone[]>;
  async listAsArray(namespace: string, venueId: string | number, requestOptions?: RequestOptions): Promise<Zone[]>;
  async listAsArray(
    arg1?: string | CallContext,
    arg2?: string | number | RequestOptions,
    arg3?: RequestOptions
  ): Promise<Zone[]> {
    const geoJson = await this.list(arg1 as any, arg2 as any, arg3);
    return extractZonesFromGeoJSON(geoJson);
  }

  // ─── List Zones by Map ──────────────────────────────────────────────────────

  /**
   * List zones for a specific map as GeoJSON FeatureCollection.
   *
   * @example
   * // Using default namespace/venue/map
   * const zones = await client.zones.listByMap();
   *
   * // Explicit (legacy)
   * const zones = await client.zones.listByMap('my-namespace', 456, 789);
   */
  async listByMap(options?: CallContext, requestOptions?: RequestOptions): Promise<ZoneFeatureCollection>;
  async listByMap(namespace: string, venueId: string | number, mapId: string | number, requestOptions?: RequestOptions): Promise<ZoneFeatureCollection>;
  async listByMap(
    arg1?: string | CallContext,
    arg2?: string | number | RequestOptions,
    arg3?: string | number | RequestOptions,
    arg4?: RequestOptions
  ): Promise<ZoneFeatureCollection> {
    let namespace: string;
    let venueId: number;
    let mapId: number;
    let requestOptions: RequestOptions | undefined;

    if (typeof arg1 === 'string') {
      namespace = arg1;
      venueId = Number(arg2);
      mapId = Number(arg3);
      requestOptions = arg4;
    } else {
      namespace = this.client.requireNs(arg1);
      venueId = this.client.requireVenue(arg1);
      mapId = this.client.requireMap(arg1);
      requestOptions = arg2 as RequestOptions | undefined;
    }

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/venues/{namespace}/{venueId}/maps/{mapId}/zones', {
          params: {
            path: { namespace, venueId, mapId },
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<ZoneFeatureCollection>;
  }

  // ─── List Zones by Map as Array ─────────────────────────────────────────────

  /**
   * List zones for a specific map as flat array.
   */
  async listByMapAsArray(options?: CallContext, requestOptions?: RequestOptions): Promise<Zone[]>;
  async listByMapAsArray(namespace: string, venueId: string | number, mapId: string | number, requestOptions?: RequestOptions): Promise<Zone[]>;
  async listByMapAsArray(
    arg1?: string | CallContext,
    arg2?: string | number | RequestOptions,
    arg3?: string | number | RequestOptions,
    arg4?: RequestOptions
  ): Promise<Zone[]> {
    const geoJson = await this.listByMap(arg1 as any, arg2 as any, arg3 as any, arg4);
    return extractZonesFromGeoJSON(geoJson);
  }

  // ─── Zone Presence ──────────────────────────────────────────────────────────

  /**
   * Get zone presence data from Elasticsearch.
   *
   * @example
   * // Using default namespace
   * const presence = await client.zones.getPresence({
   *   timestampFrom: Date.now() - 86400000,
   *   timestampTo: Date.now(),
   * });
   *
   * // Explicit namespace (legacy)
   * const presence = await client.zones.getPresence('my-namespace', {...});
   */
  async getPresence(options: ZonePresenceOptions & CallContext, requestOptions?: RequestOptions): Promise<Record<string, unknown>[]>;
  async getPresence(namespace: string, options: ZonePresenceOptions, requestOptions?: RequestOptions): Promise<Record<string, unknown>[]>;
  async getPresence(
    arg1: string | (ZonePresenceOptions & CallContext),
    arg2?: ZonePresenceOptions | RequestOptions,
    arg3?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    let namespace: string;
    let options: ZonePresenceOptions;
    let requestOptions: RequestOptions | undefined;

    if (typeof arg1 === 'string') {
      namespace = arg1;
      options = arg2 as ZonePresenceOptions;
      requestOptions = arg3;
    } else {
      namespace = this.client.requireNs(arg1);
      options = arg1 as ZonePresenceOptions;
      requestOptions = arg2 as RequestOptions | undefined;
    }

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/es/zone_presence/{appNamespace}', {
          params: {
            path: { appNamespace: namespace },
            query: {
              timestampFrom: String(options.timestampFrom),
              timestampTo: String(options.timestampTo),
              key: options.key,
              value: options.value,
              interval: options.interval,
            },
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<Record<string, unknown>[]>;
  }

  // ─── Iterate ────────────────────────────────────────────────────────────────

  /**
   * Get all zones as async generator.
   */
  iterate(options?: CallContext): AsyncGenerator<Zone>;
  iterate(namespace: string, venueId: string | number): AsyncGenerator<Zone>;
  async *iterate(
    arg1?: string | CallContext,
    arg2?: string | number
  ): AsyncGenerator<Zone> {
    const zones = await this.listAsArray(arg1 as any, arg2 as any);
    for (const zone of zones) {
      yield zone;
    }
  }

  // ─── Get All ────────────────────────────────────────────────────────────────

  /**
   * Get all zones as array.
   */
  async getAll(options?: CallContext, requestOptions?: RequestOptions): Promise<Zone[]>;
  async getAll(namespace: string, venueId: string | number, requestOptions?: RequestOptions): Promise<Zone[]>;
  async getAll(
    arg1?: string | CallContext,
    arg2?: string | number | RequestOptions,
    arg3?: RequestOptions
  ): Promise<Zone[]> {
    return this.listAsArray(arg1 as any, arg2 as any, arg3);
  }
}
