import { BaseClient, type RequestOptions } from '../client/base';
import type { ZoneFeatureCollection, Zone } from '../types';
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

  /**
   * List zones for a venue as GeoJSON FeatureCollection.
   * @returns GeoJSON FeatureCollection with zone polygons
   */
  async list(
    namespace: string,
    venueId: string | number,
    requestOptions?: RequestOptions
  ): Promise<ZoneFeatureCollection> {
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

  /**
   * List zones for a venue as flat array.
   * Convenience method that extracts properties from GeoJSON features.
   * @returns Array of Zone objects
   */
  async listAsArray(
    namespace: string,
    venueId: string | number,
    requestOptions?: RequestOptions
  ): Promise<Zone[]> {
    const geoJson = await this.list(namespace, venueId, requestOptions);
    return extractZonesFromGeoJSON(geoJson);
  }

  /**
   * List zones for a specific map as GeoJSON FeatureCollection.
   */
  async listByMap(
    namespace: string,
    venueId: string | number,
    mapId: string | number,
    requestOptions?: RequestOptions
  ): Promise<ZoneFeatureCollection> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/venues/{namespace}/{venueId}/maps/{mapId}/zones', {
          params: {
            path: { namespace, venueId: Number(venueId), mapId: Number(mapId) },
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<ZoneFeatureCollection>;
  }

  /**
   * List zones for a specific map as flat array.
   */
  async listByMapAsArray(
    namespace: string,
    venueId: string | number,
    mapId: string | number,
    requestOptions?: RequestOptions
  ): Promise<Zone[]> {
    const geoJson = await this.listByMap(namespace, venueId, mapId, requestOptions);
    return extractZonesFromGeoJSON(geoJson);
  }

  /**
   * Get zone presence data from Elasticsearch.
   */
  async getPresence(
    namespace: string,
    options: ZonePresenceOptions,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
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

  /**
   * Get all zones as async generator.
   * Since API returns all zones at once (no pagination), yields all in one batch.
   */
  async *iterate(
    namespace: string,
    venueId: string | number,
    requestOptions?: RequestOptions
  ): AsyncGenerator<Zone, void, unknown> {
    const zones = await this.listAsArray(namespace, venueId, requestOptions);
    for (const zone of zones) {
      yield zone;
    }
  }

  /**
   * Get all zones as array.
   * Convenience method equivalent to listAsArray.
   */
  async getAll(
    namespace: string,
    venueId: string | number,
    requestOptions?: RequestOptions
  ): Promise<Zone[]> {
    return this.listAsArray(namespace, venueId, requestOptions);
  }
}
