import { BaseClient, type RequestOptions } from '../client/base';
import type { CallContext } from '../context';
import type {
  ZonesContainingPointResult,
  NearestZonesResult,
  ZonesWithinRadiusResult,
  NearestPoisResult,
  PoisWithinRadiusResult,
  AnalyzeCustomZonesRequest,
  AnalyzeCustomPoisRequest,
} from '../types';

export interface PointQueryOptions {
  lat: number;
  lon: number;
  level?: number;
}

export interface NearestQueryOptions extends PointQueryOptions {
  limit?: number;
  maxDistanceMeters?: number;
}

export interface RadiusQueryOptions extends PointQueryOptions {
  radiusMeters: number;
}

// Keep old type exports for backwards compatibility
export type SpatialQueryOptions = NearestQueryOptions;

export class SpatialResource {
  constructor(private client: BaseClient) {}

  // ─── Zones Containing Point ─────────────────────────────────────────────────

  /**
   * Find zones containing a geographic point.
   *
   * @example
   * // Using default namespace
   * const result = await client.spatial.zonesContainingPoint({ lat: 48.8, lon: 2.3 });
   *
   * // Explicit namespace (legacy)
   * const result = await client.spatial.zonesContainingPoint('my-namespace', { lat: 48.8, lon: 2.3 });
   */
  async zonesContainingPoint(
    options: PointQueryOptions & CallContext,
    requestOptions?: RequestOptions
  ): Promise<ZonesContainingPointResult>;
  async zonesContainingPoint(
    namespace: string,
    options: PointQueryOptions,
    requestOptions?: RequestOptions
  ): Promise<ZonesContainingPointResult>;
  async zonesContainingPoint(
    arg1: string | (PointQueryOptions & CallContext),
    arg2?: PointQueryOptions | RequestOptions,
    arg3?: RequestOptions
  ): Promise<ZonesContainingPointResult> {
    let namespace: string;
    let options: PointQueryOptions;
    let requestOptions: RequestOptions | undefined;

    if (typeof arg1 === 'string') {
      namespace = arg1;
      options = arg2 as PointQueryOptions;
      requestOptions = arg3;
    } else {
      namespace = this.client.requireNs(arg1);
      options = arg1;
      requestOptions = arg2 as RequestOptions | undefined;
    }

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/spatial/zones/{namespace}/containing-point', {
          params: {
            path: { namespace },
            query: {
              lat: options.lat,
              lon: options.lon,
              level: options.level,
            },
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<ZonesContainingPointResult>;
  }

  // ─── Nearest Zones ──────────────────────────────────────────────────────────

  /**
   * Find nearest zones to a geographic point.
   *
   * @example
   * // Using default namespace
   * const result = await client.spatial.nearestZones({ lat: 48.8, lon: 2.3, limit: 5 });
   *
   * // Explicit namespace (legacy)
   * const result = await client.spatial.nearestZones('my-namespace', { lat: 48.8, lon: 2.3 });
   */
  async nearestZones(
    options: NearestQueryOptions & CallContext,
    requestOptions?: RequestOptions
  ): Promise<NearestZonesResult>;
  async nearestZones(
    namespace: string,
    options: NearestQueryOptions,
    requestOptions?: RequestOptions
  ): Promise<NearestZonesResult>;
  async nearestZones(
    arg1: string | (NearestQueryOptions & CallContext),
    arg2?: NearestQueryOptions | RequestOptions,
    arg3?: RequestOptions
  ): Promise<NearestZonesResult> {
    let namespace: string;
    let options: NearestQueryOptions;
    let requestOptions: RequestOptions | undefined;

    if (typeof arg1 === 'string') {
      namespace = arg1;
      options = arg2 as NearestQueryOptions;
      requestOptions = arg3;
    } else {
      namespace = this.client.requireNs(arg1);
      options = arg1;
      requestOptions = arg2 as RequestOptions | undefined;
    }

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/spatial/zones/{namespace}/nearest-to-point', {
          params: {
            path: { namespace },
            query: {
              lat: options.lat,
              lon: options.lon,
              limit: options.limit,
              level: options.level,
              max_distance_meters: options.maxDistanceMeters,
            },
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<NearestZonesResult>;
  }

  // ─── Zones Within Radius ────────────────────────────────────────────────────

  /**
   * Find zones within a radius of a geographic point.
   *
   * @example
   * // Using default namespace
   * const result = await client.spatial.zonesWithinRadius({ lat: 48.8, lon: 2.3, radiusMeters: 100 });
   *
   * // Explicit namespace (legacy)
   * const result = await client.spatial.zonesWithinRadius('my-namespace', { ... });
   */
  async zonesWithinRadius(
    options: RadiusQueryOptions & CallContext,
    requestOptions?: RequestOptions
  ): Promise<ZonesWithinRadiusResult>;
  async zonesWithinRadius(
    namespace: string,
    options: RadiusQueryOptions,
    requestOptions?: RequestOptions
  ): Promise<ZonesWithinRadiusResult>;
  async zonesWithinRadius(
    arg1: string | (RadiusQueryOptions & CallContext),
    arg2?: RadiusQueryOptions | RequestOptions,
    arg3?: RequestOptions
  ): Promise<ZonesWithinRadiusResult> {
    let namespace: string;
    let options: RadiusQueryOptions;
    let requestOptions: RequestOptions | undefined;

    if (typeof arg1 === 'string') {
      namespace = arg1;
      options = arg2 as RadiusQueryOptions;
      requestOptions = arg3;
    } else {
      namespace = this.client.requireNs(arg1);
      options = arg1;
      requestOptions = arg2 as RequestOptions | undefined;
    }

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/spatial/zones/{namespace}/within-radius', {
          params: {
            path: { namespace },
            query: {
              lat: options.lat,
              lon: options.lon,
              radius_meters: options.radiusMeters,
              level: options.level,
            },
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<ZonesWithinRadiusResult>;
  }

  // ─── Analyze Custom Zones ───────────────────────────────────────────────────

  /**
   * Analyze custom zone geometries against a reference point.
   *
   * @example
   * // Using default namespace
   * const result = await client.spatial.analyzeCustomZones({
   *   lat: 48.8, lon: 2.3, customZones: [...]
   * });
   *
   * // Explicit namespace (legacy)
   * const result = await client.spatial.analyzeCustomZones('my-namespace', { ... });
   */
  async analyzeCustomZones(
    request: { lat: number; lon: number; customZones: unknown[] } & CallContext,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>>;
  async analyzeCustomZones(
    namespace: string,
    request: AnalyzeCustomZonesRequest,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>>;
  async analyzeCustomZones(
    arg1: string | ({ lat: number; lon: number; customZones: unknown[] } & CallContext),
    arg2?: AnalyzeCustomZonesRequest | RequestOptions,
    arg3?: RequestOptions
  ): Promise<Record<string, unknown>> {
    let namespace: string;
    let request: AnalyzeCustomZonesRequest;
    let requestOptions: RequestOptions | undefined;

    if (typeof arg1 === 'string') {
      namespace = arg1;
      request = arg2 as AnalyzeCustomZonesRequest;
      requestOptions = arg3;
    } else {
      namespace = this.client.requireNs(arg1);
      request = {
        reference_point: { lat: arg1.lat, lon: arg1.lon },
        zones: arg1.customZones as AnalyzeCustomZonesRequest['zones'],
      };
      requestOptions = arg2 as RequestOptions | undefined;
    }

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.POST('/spatial/zones/{namespace}/analyze-custom', {
          params: { path: { namespace } },
          body: {
            reference_point: request.reference_point,
            zones: request.zones,
          } as never,
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<Record<string, unknown>>;
  }

  // ─── Nearest POIs ───────────────────────────────────────────────────────────

  /**
   * Find nearest POIs to a geographic point.
   *
   * @example
   * // Using default namespace
   * const result = await client.spatial.nearestPois({ lat: 48.8, lon: 2.3 });
   *
   * // Explicit namespace (legacy)
   * const result = await client.spatial.nearestPois('my-namespace', { lat: 48.8, lon: 2.3 });
   */
  async nearestPois(
    options: NearestQueryOptions & CallContext,
    requestOptions?: RequestOptions
  ): Promise<NearestPoisResult>;
  async nearestPois(
    namespace: string,
    options: NearestQueryOptions,
    requestOptions?: RequestOptions
  ): Promise<NearestPoisResult>;
  async nearestPois(
    arg1: string | (NearestQueryOptions & CallContext),
    arg2?: NearestQueryOptions | RequestOptions,
    arg3?: RequestOptions
  ): Promise<NearestPoisResult> {
    let namespace: string;
    let options: NearestQueryOptions;
    let requestOptions: RequestOptions | undefined;

    if (typeof arg1 === 'string') {
      namespace = arg1;
      options = arg2 as NearestQueryOptions;
      requestOptions = arg3;
    } else {
      namespace = this.client.requireNs(arg1);
      options = arg1;
      requestOptions = arg2 as RequestOptions | undefined;
    }

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/spatial/pois/{namespace}/nearest-to-point', {
          params: {
            path: { namespace },
            query: {
              lat: options.lat,
              lon: options.lon,
              limit: options.limit,
              level: options.level,
              max_distance_meters: options.maxDistanceMeters,
            },
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<NearestPoisResult>;
  }

  // ─── POIs Within Radius ─────────────────────────────────────────────────────

  /**
   * Find POIs within a radius of a geographic point.
   *
   * @example
   * // Using default namespace
   * const result = await client.spatial.poisWithinRadius({ lat: 48.8, lon: 2.3, radiusMeters: 100 });
   *
   * // Explicit namespace (legacy)
   * const result = await client.spatial.poisWithinRadius('my-namespace', { ... });
   */
  async poisWithinRadius(
    options: RadiusQueryOptions & CallContext,
    requestOptions?: RequestOptions
  ): Promise<PoisWithinRadiusResult>;
  async poisWithinRadius(
    namespace: string,
    options: RadiusQueryOptions,
    requestOptions?: RequestOptions
  ): Promise<PoisWithinRadiusResult>;
  async poisWithinRadius(
    arg1: string | (RadiusQueryOptions & CallContext),
    arg2?: RadiusQueryOptions | RequestOptions,
    arg3?: RequestOptions
  ): Promise<PoisWithinRadiusResult> {
    let namespace: string;
    let options: RadiusQueryOptions;
    let requestOptions: RequestOptions | undefined;

    if (typeof arg1 === 'string') {
      namespace = arg1;
      options = arg2 as RadiusQueryOptions;
      requestOptions = arg3;
    } else {
      namespace = this.client.requireNs(arg1);
      options = arg1;
      requestOptions = arg2 as RequestOptions | undefined;
    }

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/spatial/pois/{namespace}/within-radius', {
          params: {
            path: { namespace },
            query: {
              lat: options.lat,
              lon: options.lon,
              radius_meters: options.radiusMeters,
              level: options.level,
            },
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<PoisWithinRadiusResult>;
  }

  // ─── Analyze Custom POIs ────────────────────────────────────────────────────

  /**
   * Analyze custom POI geometries against a reference point.
   *
   * @example
   * // Using default namespace
   * const result = await client.spatial.analyzeCustomPois({
   *   lat: 48.8, lon: 2.3, customPois: [...]
   * });
   *
   * // Explicit namespace (legacy)
   * const result = await client.spatial.analyzeCustomPois('my-namespace', { ... });
   */
  async analyzeCustomPois(
    request: { lat: number; lon: number; customPois: unknown[] } & CallContext,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>>;
  async analyzeCustomPois(
    namespace: string,
    request: AnalyzeCustomPoisRequest,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>>;
  async analyzeCustomPois(
    arg1: string | ({ lat: number; lon: number; customPois: unknown[] } & CallContext),
    arg2?: AnalyzeCustomPoisRequest | RequestOptions,
    arg3?: RequestOptions
  ): Promise<Record<string, unknown>> {
    let namespace: string;
    let request: AnalyzeCustomPoisRequest;
    let requestOptions: RequestOptions | undefined;

    if (typeof arg1 === 'string') {
      namespace = arg1;
      request = arg2 as AnalyzeCustomPoisRequest;
      requestOptions = arg3;
    } else {
      namespace = this.client.requireNs(arg1);
      request = {
        reference_point: { lat: arg1.lat, lon: arg1.lon },
        pois: arg1.customPois as AnalyzeCustomPoisRequest['pois'],
      };
      requestOptions = arg2 as RequestOptions | undefined;
    }

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.POST('/spatial/pois/{namespace}/analyze-custom', {
          params: { path: { namespace } },
          body: {
            reference_point: request.reference_point,
            pois: request.pois,
          } as never,
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<Record<string, unknown>>;
  }
}
