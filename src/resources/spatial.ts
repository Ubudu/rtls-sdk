import { BaseClient, type RequestOptions } from '../client/base';
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

  /**
   * Find zones containing a geographic point.
   * @returns Structured result with reference point, level, and matching zones
   */
  async zonesContainingPoint(
    namespace: string,
    options: PointQueryOptions,
    requestOptions?: RequestOptions
  ): Promise<ZonesContainingPointResult> {
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

  /**
   * Find nearest zones to a geographic point.
   * @returns Structured result with zones sorted by distance
   */
  async nearestZones(
    namespace: string,
    options: NearestQueryOptions,
    requestOptions?: RequestOptions
  ): Promise<NearestZonesResult> {
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

  /**
   * Find zones within a radius of a geographic point.
   * @returns Structured result with zones within the specified radius
   */
  async zonesWithinRadius(
    namespace: string,
    options: RadiusQueryOptions,
    requestOptions?: RequestOptions
  ): Promise<ZonesWithinRadiusResult> {
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

  /**
   * Analyze custom zone geometries against a reference point.
   * Requires reference_point in the request body.
   */
  async analyzeCustomZones(
    namespace: string,
    request: AnalyzeCustomZonesRequest,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
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

  /**
   * Find nearest POIs to a geographic point.
   * @returns Structured result with POIs sorted by distance
   */
  async nearestPois(
    namespace: string,
    options: NearestQueryOptions,
    requestOptions?: RequestOptions
  ): Promise<NearestPoisResult> {
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

  /**
   * Find POIs within a radius of a geographic point.
   * @returns Structured result with POIs within the specified radius
   */
  async poisWithinRadius(
    namespace: string,
    options: RadiusQueryOptions,
    requestOptions?: RequestOptions
  ): Promise<PoisWithinRadiusResult> {
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

  /**
   * Analyze custom POI geometries against a reference point.
   * Requires reference_point in the request body.
   */
  async analyzeCustomPois(
    namespace: string,
    request: AnalyzeCustomPoisRequest,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
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
