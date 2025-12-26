import type { BaseClient, RequestOptions } from '../client/base';
import type {
  POIFeatureCollection,
  PathFeatureCollection,
  POI,
  PathNode,
  PathSegment,
} from '../types';
import type { CallContext } from '../context';
import {
  extractPoisFromGeoJSON,
  extractPathNodesFromGeoJSON,
  extractPathSegmentsFromGeoJSON,
  extractDataArray,
} from '../utils';

export type ListVenuesOptions = CallContext & Record<string, unknown>;

export class VenuesResource {
  constructor(private client: BaseClient) {}

  // ─── List Venues ────────────────────────────────────────────────────────────

  /**
   * List all venues for a namespace.
   *
   * @example
   * // Using default namespace
   * const venues = await client.venues.list();
   *
   * // Explicit namespace (legacy)
   * const venues = await client.venues.list('my-namespace');
   */
  async list(requestOptions?: RequestOptions): Promise<Record<string, unknown>[]>;
  async list(
    namespace: string,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]>;
  async list(
    arg1?: string | RequestOptions,
    arg2?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    let namespace: string;
    let requestOptions: RequestOptions | undefined;

    if (typeof arg1 === 'string') {
      namespace = arg1;
      requestOptions = arg2;
    } else {
      namespace = this.client.requireNs();
      requestOptions = arg1;
    }

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

  // ─── Get Venue ──────────────────────────────────────────────────────────────

  /**
   * Get a single venue by ID.
   *
   * @example
   * // Using default namespace/venue
   * const venue = await client.venues.get();
   *
   * // Using default namespace with explicit venue
   * const venue = await client.venues.get({ venueId: 123 });
   *
   * // Explicit namespace and venue (legacy)
   * const venue = await client.venues.get('my-namespace', 456);
   */
  async get(
    options?: CallContext,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>>;
  async get(
    namespace: string,
    venueId: string | number,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>>;
  async get(
    arg1?: string | CallContext,
    arg2?: string | number | RequestOptions,
    arg3?: RequestOptions
  ): Promise<Record<string, unknown>> {
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
        this.client.raw.GET('/venues/{namespace}/{venueId}', {
          params: { path: { namespace, venueId } },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<Record<string, unknown>>;
  }

  // ─── List Maps ──────────────────────────────────────────────────────────────

  /**
   * List maps for a venue.
   *
   * @example
   * // Using default namespace/venue
   * const maps = await client.venues.listMaps();
   *
   * // Explicit (legacy)
   * const maps = await client.venues.listMaps('my-namespace', 456);
   */
  async listMaps(
    options?: CallContext,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]>;
  async listMaps(
    namespace: string,
    venueId: string | number,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]>;
  async listMaps(
    arg1?: string | CallContext,
    arg2?: string | number | RequestOptions,
    arg3?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
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

    const response = await this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/venues/{namespace}/{venueId}/maps', {
          params: {
            path: { namespace, venueId },
          },
          ...fetchOpts,
        }),
      requestOptions
    );
    return extractDataArray<Record<string, unknown>>(response);
  }

  // ─── List POIs ──────────────────────────────────────────────────────────────

  /**
   * List POIs for a venue as GeoJSON FeatureCollection.
   */
  async listPois(
    options?: CallContext,
    requestOptions?: RequestOptions
  ): Promise<POIFeatureCollection>;
  async listPois(
    namespace: string,
    venueId: string | number,
    requestOptions?: RequestOptions
  ): Promise<POIFeatureCollection>;
  async listPois(
    arg1?: string | CallContext,
    arg2?: string | number | RequestOptions,
    arg3?: RequestOptions
  ): Promise<POIFeatureCollection> {
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
  async listPoisAsArray(options?: CallContext, requestOptions?: RequestOptions): Promise<POI[]>;
  async listPoisAsArray(
    namespace: string,
    venueId: string | number,
    requestOptions?: RequestOptions
  ): Promise<POI[]>;
  async listPoisAsArray(
    arg1?: string | CallContext,
    arg2?: string | number | RequestOptions,
    arg3?: RequestOptions
  ): Promise<POI[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const geoJson = await this.listPois(arg1 as any, arg2 as any, arg3);
    return extractPoisFromGeoJSON(geoJson);
  }

  // ─── List Map POIs ──────────────────────────────────────────────────────────

  /**
   * List POIs for a specific map as GeoJSON FeatureCollection.
   */
  async listMapPois(
    options?: CallContext,
    requestOptions?: RequestOptions
  ): Promise<POIFeatureCollection>;
  async listMapPois(
    namespace: string,
    venueId: string | number,
    mapId: string | number,
    requestOptions?: RequestOptions
  ): Promise<POIFeatureCollection>;
  async listMapPois(
    arg1?: string | CallContext,
    arg2?: string | number | RequestOptions,
    arg3?: string | number | RequestOptions,
    arg4?: RequestOptions
  ): Promise<POIFeatureCollection> {
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
        this.client.raw.GET('/venues/{namespace}/{venueId}/maps/{mapId}/pois', {
          params: {
            path: { namespace, venueId, mapId },
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<POIFeatureCollection>;
  }

  /**
   * List POIs for a specific map as flat array.
   */
  async listMapPoisAsArray(options?: CallContext, requestOptions?: RequestOptions): Promise<POI[]>;
  async listMapPoisAsArray(
    namespace: string,
    venueId: string | number,
    mapId: string | number,
    requestOptions?: RequestOptions
  ): Promise<POI[]>;
  async listMapPoisAsArray(
    arg1?: string | CallContext,
    arg2?: string | number | RequestOptions,
    arg3?: string | number | RequestOptions,
    arg4?: RequestOptions
  ): Promise<POI[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const geoJson = await this.listMapPois(arg1 as any, arg2 as any, arg3 as any, arg4);
    return extractPoisFromGeoJSON(geoJson);
  }

  // ─── List Paths ─────────────────────────────────────────────────────────────

  /**
   * List navigation paths for a venue as GeoJSON FeatureCollection.
   */
  async listPaths(
    options?: CallContext,
    requestOptions?: RequestOptions
  ): Promise<PathFeatureCollection>;
  async listPaths(
    namespace: string,
    venueId: string | number,
    requestOptions?: RequestOptions
  ): Promise<PathFeatureCollection>;
  async listPaths(
    arg1?: string | CallContext,
    arg2?: string | number | RequestOptions,
    arg3?: RequestOptions
  ): Promise<PathFeatureCollection> {
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
  async listPathNodes(options?: CallContext, requestOptions?: RequestOptions): Promise<PathNode[]>;
  async listPathNodes(
    namespace: string,
    venueId: string | number,
    requestOptions?: RequestOptions
  ): Promise<PathNode[]>;
  async listPathNodes(
    arg1?: string | CallContext,
    arg2?: string | number | RequestOptions,
    arg3?: RequestOptions
  ): Promise<PathNode[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const geoJson = await this.listPaths(arg1 as any, arg2 as any, arg3);
    return extractPathNodesFromGeoJSON(geoJson);
  }

  /**
   * List path segments for a venue as flat array.
   */
  async listPathSegments(
    options?: CallContext,
    requestOptions?: RequestOptions
  ): Promise<PathSegment[]>;
  async listPathSegments(
    namespace: string,
    venueId: string | number,
    requestOptions?: RequestOptions
  ): Promise<PathSegment[]>;
  async listPathSegments(
    arg1?: string | CallContext,
    arg2?: string | number | RequestOptions,
    arg3?: RequestOptions
  ): Promise<PathSegment[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const geoJson = await this.listPaths(arg1 as any, arg2 as any, arg3);
    return extractPathSegmentsFromGeoJSON(geoJson);
  }

  // ─── Iterate ────────────────────────────────────────────────────────────────

  /**
   * Iterate over all venues.
   */
  iterate(requestOptions?: RequestOptions): AsyncGenerator<Record<string, unknown>>;
  iterate(
    namespace: string,
    requestOptions?: RequestOptions
  ): AsyncGenerator<Record<string, unknown>>;
  async *iterate(
    arg1?: string | RequestOptions,
    arg2?: RequestOptions
  ): AsyncGenerator<Record<string, unknown>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const venues = await this.list(arg1 as any, arg2);
    for (const venue of venues) {
      yield venue;
    }
  }
}
