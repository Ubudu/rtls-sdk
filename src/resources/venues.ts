import { BaseClient, type RequestOptions } from '../client/base';
import type {
  POIFeatureCollection,
  PathFeatureCollection,
  POI,
  PathNode,
  PathSegment,
} from '../types';
import {
  extractPoisFromGeoJSON,
  extractPathNodesFromGeoJSON,
  extractPathSegmentsFromGeoJSON,
  extractDataArray,
} from '../utils';

export type ListVenuesOptions = Record<string, unknown>;

export class VenuesResource {
  constructor(private client: BaseClient) {}

  /**
   * List all venues for a namespace.
   * API returns direct array, not paginated.
   */
  async list(
    namespace: string,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    const response = await this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/venues/{namespace}', {
          params: { path: { namespace } },
          ...fetchOpts,
        }),
      requestOptions
    );
    return extractDataArray<Record<string, unknown>>(response);
  }

  /**
   * Get a single venue by ID.
   */
  async get(
    namespace: string,
    venueId: string | number,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/venues/{namespace}/{venueId}', {
          params: { path: { namespace, venueId: Number(venueId) } },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<Record<string, unknown>>;
  }

  /**
   * List maps for a venue.
   * API returns direct array.
   */
  async listMaps(
    namespace: string,
    venueId: string | number,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    const response = await this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/venues/{namespace}/{venueId}/maps', {
          params: {
            path: { namespace, venueId: Number(venueId) },
          },
          ...fetchOpts,
        }),
      requestOptions
    );
    return extractDataArray<Record<string, unknown>>(response);
  }

  /**
   * List POIs for a venue as GeoJSON FeatureCollection.
   */
  async listPois(
    namespace: string,
    venueId: string | number,
    requestOptions?: RequestOptions
  ): Promise<POIFeatureCollection> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/venues/{namespace}/{venueId}/pois', {
          params: {
            path: { namespace, venueId: String(venueId) },
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<POIFeatureCollection>;
  }

  /**
   * List POIs for a venue as flat array.
   */
  async listPoisAsArray(
    namespace: string,
    venueId: string | number,
    requestOptions?: RequestOptions
  ): Promise<POI[]> {
    const geoJson = await this.listPois(namespace, venueId, requestOptions);
    return extractPoisFromGeoJSON(geoJson);
  }

  /**
   * List POIs for a specific map as GeoJSON FeatureCollection.
   */
  async listMapPois(
    namespace: string,
    venueId: string | number,
    mapId: string | number,
    requestOptions?: RequestOptions
  ): Promise<POIFeatureCollection> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/venues/{namespace}/{venueId}/maps/{mapId}/pois', {
          params: {
            path: { namespace, venueId: Number(venueId), mapId: Number(mapId) },
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<POIFeatureCollection>;
  }

  /**
   * List POIs for a specific map as flat array.
   */
  async listMapPoisAsArray(
    namespace: string,
    venueId: string | number,
    mapId: string | number,
    requestOptions?: RequestOptions
  ): Promise<POI[]> {
    const geoJson = await this.listMapPois(namespace, venueId, mapId, requestOptions);
    return extractPoisFromGeoJSON(geoJson);
  }

  /**
   * List navigation paths for a venue as GeoJSON FeatureCollection.
   * Contains both path nodes (Points) and path segments (LineStrings).
   */
  async listPaths(
    namespace: string,
    venueId: string | number,
    requestOptions?: RequestOptions
  ): Promise<PathFeatureCollection> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/venues/{namespace}/{venueId}/paths', {
          params: {
            path: { namespace, venueId: String(venueId) },
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<PathFeatureCollection>;
  }

  /**
   * List path nodes for a venue as flat array.
   */
  async listPathNodes(
    namespace: string,
    venueId: string | number,
    requestOptions?: RequestOptions
  ): Promise<PathNode[]> {
    const geoJson = await this.listPaths(namespace, venueId, requestOptions);
    return extractPathNodesFromGeoJSON(geoJson);
  }

  /**
   * List path segments for a venue as flat array.
   */
  async listPathSegments(
    namespace: string,
    venueId: string | number,
    requestOptions?: RequestOptions
  ): Promise<PathSegment[]> {
    const geoJson = await this.listPaths(namespace, venueId, requestOptions);
    return extractPathSegmentsFromGeoJSON(geoJson);
  }

  /**
   * Iterate over all venues.
   * Since API returns all venues at once, yields each venue.
   */
  async *iterate(
    namespace: string,
    requestOptions?: RequestOptions
  ): AsyncGenerator<Record<string, unknown>, void, unknown> {
    const venues = await this.list(namespace, requestOptions);
    for (const venue of venues) {
      yield venue;
    }
  }
}
