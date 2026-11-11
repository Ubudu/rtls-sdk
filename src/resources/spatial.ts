/**
 * `client.spatial`: zone, POI and asset lookups around a point.
 *
 * Server behaviour every caller should know:
 * - Zone and POI lookups read the zones and POIs of the namespace's **first venue** only; there is no venue
 *   parameter (USI-P3-12). Zone items are GeoJSON Features: read `zone.properties.name`, not `zone.name`.
 * - The zone GETs (`zonesContainingPoint`, `nearestZones`, `zonesWithinRadius`) return no zones today, while
 *   `total_zones` still counts the zones found (USI-P3-1).
 *   Working alternative: `analyzeCustomZones` over the features of `client.zones.list()`.
 * - The POI GETs (`nearestPois`, `poisWithinRadius`, `poisByTag`) return no POIs either, and they read top-level
 *   `coordinates`/`tags`, which GeoJSON POIs carry under `properties` (USI-P3-2). Working alternatives:
 *   `analyzeCustomPois` over the features of `client.venues.listPois()`, and `client.venues.listPois({ tag })`.
 * - `poiStatistics`: `total_pois` and `levels` are right, `tags` and `venues` stay empty (USI-P3-3).
 * - The POST routes (`zoneDistances`, `analyzeCustomZones`, `analyzeCustomPois`) reject a reference point whose
 *   `lat` or `lon` is exactly `0` with a 400, and drop custom POIs with a `0` coordinate (USI-P3-6). Their JSON
 *   body is limited to 100 kB (413 `PayloadTooLargeError` above it).
 * - Every method checks `lat`/`lon` before sending (finite, lat in [-90, 90], lon in [-180, 180]): an
 *   out-of-range point throws `ValidationError` with status 0 and sends nothing (the server would answer 500).
 *
 * @module resources/spatial
 */
import type { RequestOptions } from '../client/base';
import type { CallContext } from '../context';
import { ValidationError } from '../errors';
import type {
  AnalyzeCustomPoisOptions,
  AnalyzeCustomPoisRequest,
  AnalyzeCustomPoisResult,
  AnalyzeCustomZonesOptions,
  AnalyzeCustomZonesRequest,
  AnalyzeCustomZonesResult,
  CustomPoiInput,
  CustomPoiOperationOptions,
  NearestAssetsOptions,
  NearestAssetsRealtimeOptions,
  NearestPoisResult,
  NearestQueryOptions,
  NearestZonesResult,
  PoiStatistics,
  PoisByTagOptions,
  PoisByTagResult,
  PoisWithinRadiusResult,
  PoiTagsOption,
  PointQueryOptions,
  RadiusQueryOptions,
  SpatialAssetsResponse,
  SpatialCallOptions,
  SpatialReferencePoint,
  ZoneDistancesOptions,
  ZoneDistancesResult,
  ZonesContainingPointResult,
  ZonesWithinRadiusResult,
} from '../types/spatial';
import { splitCallOptions } from '../utils/args';
import { ResourceBase } from '../client/resource';

export type {
  AnalyzeCustomPoisOptions,
  AnalyzeCustomZonesOptions,
  AssetSearch,
  NearestAssetsOptions,
  NearestAssetsRealtimeOptions,
  NearestQueryOptions,
  PoisByTagOptions,
  PoiTagsOption,
  PointQueryOptions,
  RadiusQueryOptions,
  SpatialCallOptions,
  SpatialLevelOption,
  SpatialQueryOptions,
  ZoneDistancesOptions,
} from '../types/spatial';

/** Any bag a spatial method receives (object form, legacy options or legacy wire body). */
type AnyBag = Record<string, unknown> & {
  level?: number | null;
  reference_point?: Partial<SpatialReferencePoint>;
};

/** Keys the server reads as a custom POI's location before `lat`/`lon`; never sent. */
const LOCATION_KEYS = ['location', 'position', 'coordinates', 'latitude', 'longitude'] as const;

function isCoordinate(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= max;
}

/**
 * The reference point, checked: finite `lat` in [-90, 90] and `lon` in [-180, 180]; `0` is allowed.
 * @throws {ValidationError} status 0, `details` the offending key; nothing is sent
 */
function point(lat: unknown, lon: unknown): SpatialReferencePoint {
  if (!isCoordinate(lat, 90) || !isCoordinate(lon, 180))
    throw new ValidationError(
      `Invalid coordinates (lat ${String(lat)}, lon ${String(lon)}): lat must be a finite number in [-90, 90] and lon in [-180, 180]`,
      undefined,
      { status: 0, details: [isCoordinate(lat, 90) ? 'lon' : 'lat'] }
    );
  return { lat, lon };
}

/**
 * `max_age`: a string verbatim; a number of milliseconds is sent truncated, and the sent value must be a finite
 * integer of at least 1 (a value below 1 ms would send `max_age=0`, which removes the time bound).
 */
function maxAgeParam(maxAge: string | number | undefined): string | undefined {
  if (typeof maxAge !== 'number') return maxAge;
  const ms = Math.trunc(maxAge);
  if (!(Number.isFinite(ms) && ms >= 1))
    throw new ValidationError(
      `maxAge must be a finite number of at least 1 millisecond or a string such as '15m' (got ${maxAge})`,
      undefined,
      { status: 0, details: ['maxAge'] }
    );
  return String(ms);
}

/** A custom POI as the server reads it: a Point Feature flattened, the location keys removed. */
function flatPoi(item: unknown): Record<string, unknown> {
  const it = item as { type?: unknown; properties?: object; geometry: { coordinates: number[] } };
  const flat: Record<string, unknown> =
    it.type === 'Feature'
      ? { ...it.properties, lat: it.geometry.coordinates[1], lon: it.geometry.coordinates[0] }
      : { ...it };
  for (const key of LOCATION_KEYS) delete flat[key];
  return flat;
}

/**
 * Spatial lookups. Methods with a legacy overload take `(namespace, options, requestOptions?)` when the first
 * argument is a string; the object form takes the namespace and request options in its bag.
 *
 * `level` (zone and POI lookups only): omitted → the client default `level` applies when set; `null` → all levels,
 * even with a client default; any integer is sent, `0` included. A non-integer throws `ContextError`.
 *
 * @example
 * ```typescript
 * const zones = await client.zones.list({ venueId: 1 });
 * const res = await client.spatial.analyzeCustomZones({ lat: 48.85, lon: 2.35, customZones: zones.features });
 * console.log(res.containing_zones.map((z) => z.properties.name));
 * ```
 */
export class SpatialResource extends ResourceBase {
  /** Splits the arguments of a method with a legacy overload (legacy when `arg1` is a string). */
  private args(arg1: unknown, arg2: unknown, arg3: unknown) {
    const legacy = typeof arg1 === 'string';
    const bag = ((legacy ? arg2 : arg1) ?? {}) as AnyBag;
    const { ctx, request, rest } = splitCallOptions(
      bag as AnyBag & CallContext,
      (legacy ? arg3 : arg2) as RequestOptions | undefined
    );
    const namespace = this.ns(legacy ? { namespace: arg1 } : ctx);
    return { legacy, bag, ctx, request, rest: rest as Record<string, unknown>, namespace };
  }

  /** The `level` query value: `null` on the raw bag opts out, else per-call or client default. */
  private levelOf(bag: AnyBag, ctx: CallContext): number | undefined {
    return bag.level === null ? undefined : this.level(ctx);
  }

  // ─── Zones ──────────────────────────────────────────────────────────────────────────────────────────────────

  /**
   * Zones of the first venue that contain the point (GET `/spatial/zones/{namespace}/containing-point`).
   *
   * Known issue USI-P3-1: the server returns no zones today. Use `analyzeCustomZones` with the features of
   * `client.zones.list()`; its `containing_zones` is the working equivalent.
   *
   * @throws {ValidationError} status 0 for an out-of-range point (nothing sent)
   * @throws {ContextError} no namespace, or a non-integer `level`
   * @example
   * ```typescript
   * const res = await client.spatial.zonesContainingPoint({ lat: 48.85, lon: 2.35, level: null });
   * res.containing_zones.forEach((z) => console.log(z.properties.name, z.level));
   * ```
   */
  zonesContainingPoint(
    options: PointQueryOptions & SpatialCallOptions,
    /** @deprecated since 0.3.0 — pass `signal`/`timeoutMs`/`headers` in `options` */
    requestOptions?: RequestOptions
  ): Promise<ZonesContainingPointResult>;
  /** Legacy positional form (namespace first); the object form is `zonesContainingPoint({ ...options, namespace })`. */
  zonesContainingPoint(
    namespace: string,
    options: PointQueryOptions,
    requestOptions?: RequestOptions
  ): Promise<ZonesContainingPointResult>;
  async zonesContainingPoint(
    arg1: string | (PointQueryOptions & SpatialCallOptions),
    arg2?: PointQueryOptions | RequestOptions,
    arg3?: RequestOptions
  ): Promise<ZonesContainingPointResult> {
    const { bag, ctx, request, rest, namespace } = this.args(arg1, arg2, arg3);
    return this.transport.request<ZonesContainingPointResult>(
      'GET',
      '/spatial/zones/{namespace}/containing-point',
      {
        params: { namespace },
        query: { ...point(rest.lat, rest.lon), level: this.levelOf(bag, ctx) },
        ...request,
      }
    );
  }

  /**
   * Zones of the first venue nearest to the point, with distances in whole metres (GET
   * `/spatial/zones/{namespace}/nearest-to-point`). `limit` defaults to 10 on the server; `hasMore` is not
   * meaningful here (USI-P3-13).
   *
   * Known issue USI-P3-1: `total_zones` counts zones but `zones` is empty today. Use `analyzeCustomZones` with the
   * features of `client.zones.list()`; its `nearby_zones` are sorted by distance.
   *
   * @throws {ValidationError} status 0 for an out-of-range point (nothing sent)
   * @throws {ContextError} no namespace, or a non-integer `level`
   */
  nearestZones(
    options: NearestQueryOptions & SpatialCallOptions,
    /** @deprecated since 0.3.0 — pass `signal`/`timeoutMs`/`headers` in `options` */
    requestOptions?: RequestOptions
  ): Promise<NearestZonesResult>;
  /** Legacy positional form (namespace first); the object form is `nearestZones({ ...options, namespace })`. */
  nearestZones(
    namespace: string,
    options: NearestQueryOptions,
    requestOptions?: RequestOptions
  ): Promise<NearestZonesResult>;
  async nearestZones(
    arg1: string | (NearestQueryOptions & SpatialCallOptions),
    arg2?: NearestQueryOptions | RequestOptions,
    arg3?: RequestOptions
  ): Promise<NearestZonesResult> {
    const { bag, ctx, request, rest, namespace } = this.args(arg1, arg2, arg3);
    return this.transport.request<NearestZonesResult>(
      'GET',
      '/spatial/zones/{namespace}/nearest-to-point',
      {
        params: { namespace },
        query: {
          ...point(rest.lat, rest.lon),
          limit: rest.limit as number | undefined,
          max_distance_meters: rest.maxDistanceMeters as number | undefined,
          level: this.levelOf(bag, ctx),
        },
        ...request,
      }
    );
  }

  /**
   * Zones of the first venue within `radiusMeters` of the point (GET `/spatial/zones/{namespace}/within-radius`;
   * server cap 1000 results). A radius `<= 0` is rejected by the server (400 `Radius must be positive`).
   *
   * Known issue USI-P3-1: `zones` is empty today. Use `analyzeCustomZones` with the features of
   * `client.zones.list()` and filter `nearby_zones` by `distance_meters`.
   *
   * @throws {ValidationError} status 0 for an out-of-range point (nothing sent)
   * @throws {ContextError} no namespace, or a non-integer `level`
   */
  zonesWithinRadius(
    options: RadiusQueryOptions & SpatialCallOptions,
    /** @deprecated since 0.3.0 — pass `signal`/`timeoutMs`/`headers` in `options` */
    requestOptions?: RequestOptions
  ): Promise<ZonesWithinRadiusResult>;
  /** Legacy positional form (namespace first); the object form is `zonesWithinRadius({ ...options, namespace })`. */
  zonesWithinRadius(
    namespace: string,
    options: RadiusQueryOptions,
    requestOptions?: RequestOptions
  ): Promise<ZonesWithinRadiusResult>;
  async zonesWithinRadius(
    arg1: string | (RadiusQueryOptions & SpatialCallOptions),
    arg2?: RadiusQueryOptions | RequestOptions,
    arg3?: RequestOptions
  ): Promise<ZonesWithinRadiusResult> {
    const { bag, ctx, request, rest, namespace } = this.args(arg1, arg2, arg3);
    return this.transport.request<ZonesWithinRadiusResult>(
      'GET',
      '/spatial/zones/{namespace}/within-radius',
      {
        params: { namespace },
        query: {
          ...point(rest.lat, rest.lon),
          radius_meters: rest.radiusMeters as number,
          level: this.levelOf(bag, ctx),
        },
        ...request,
      }
    );
  }

  /**
   * Distances from the point to the given zones of the first venue, ascending boundary distance (POST
   * `/spatial/zones/{namespace}/calculate-distances`). Not affected by USI-P3-1.
   *
   * `zoneIds` must be the `properties.id` values exactly as `client.zones.list()` returns them: the server compares
   * them strictly (`1` and `'1'` differ); an empty array is a 400. A reference point with `lat` or `lon` exactly
   * `0` is rejected by the server (USI-P3-6). Read-only: retried under the client's retry policy.
   *
   * @throws {ValidationError} status 0 for an out-of-range point (nothing sent)
   * @example
   * ```typescript
   * const zones = await client.zones.list({ venueId: 1 });
   * const res = await client.spatial.zoneDistances({
   *   lat: 48.85,
   *   lon: 2.35,
   *   zoneIds: zones.features.map((z) => z.properties.id),
   * });
   * console.log(res.zones[0]?.zone_name, res.zones[0]?.boundary_distance_meters);
   * ```
   */
  async zoneDistances(
    options: ZoneDistancesOptions & SpatialCallOptions
  ): Promise<ZoneDistancesResult> {
    const { ctx, request, rest } = splitCallOptions(options);
    return this.transport.request<ZoneDistancesResult>(
      'POST',
      '/spatial/zones/{namespace}/calculate-distances',
      {
        params: { namespace: this.ns(ctx) },
        body: { reference_point: point(rest.lat, rest.lon), zone_ids: rest.zoneIds },
        retry: { idempotent: true },
        ...request,
      }
    );
  }

  /**
   * Point-in-polygon and distances against the caller's polygons (POST `/spatial/zones/{namespace}/analyze-custom`).
   * The reliable zone lookup today: pass the features of `client.zones.list()` (USI-P3-1 does not affect it).
   *
   * `customZones` is an array of polygon Features (wrapped into a FeatureCollection) or a FeatureCollection (sent
   * as given). Only polygons count, outer ring only; `index` in the result is the position in the input. The
   * legacy form sends `request` verbatim. A reference point with `lat` or `lon` exactly `0` is rejected by the
   * server (USI-P3-6); the body is limited to 100 kB. Read-only: retried under the client's retry policy.
   *
   * @throws {ValidationError} status 0 for an out-of-range point, legacy `reference_point` included (nothing sent)
   * @example
   * ```typescript
   * const zones = await client.zones.list({ venueId: 1 });
   * const res = await client.spatial.analyzeCustomZones({ lat: 48.85, lon: 2.35, customZones: zones.features });
   * const inside = res.containing_zones.map((z) => z.properties.name);
   * ```
   */
  analyzeCustomZones<P = Record<string, unknown>>(
    options: AnalyzeCustomZonesOptions<P> & SpatialCallOptions,
    /** @deprecated since 0.3.0 — pass `signal`/`timeoutMs`/`headers` in `options` */
    requestOptions?: RequestOptions
  ): Promise<AnalyzeCustomZonesResult<P>>;
  /** Legacy positional form (namespace first); the object form is `analyzeCustomZones({ lat, lon, customZones, namespace })`. */
  analyzeCustomZones<P = Record<string, unknown>>(
    namespace: string,
    request: AnalyzeCustomZonesRequest<P>,
    requestOptions?: RequestOptions
  ): Promise<AnalyzeCustomZonesResult<P>>;
  async analyzeCustomZones<P = Record<string, unknown>>(
    arg1: string | (AnalyzeCustomZonesOptions<P> & SpatialCallOptions),
    arg2?: AnalyzeCustomZonesRequest<P> | RequestOptions,
    arg3?: RequestOptions
  ): Promise<AnalyzeCustomZonesResult<P>> {
    const { legacy, bag, request, rest, namespace } = this.args(arg1, arg2, arg3);
    const reference_point = point(
      legacy ? bag.reference_point?.lat : rest.lat,
      legacy ? bag.reference_point?.lon : rest.lon
    );
    const zones = rest.customZones as AnalyzeCustomZonesOptions<P>['customZones'];
    return this.transport.request<AnalyzeCustomZonesResult<P>>(
      'POST',
      '/spatial/zones/{namespace}/analyze-custom',
      {
        params: { namespace },
        body: legacy
          ? bag
          : {
              reference_point,
              custom_zones: Array.isArray(zones)
                ? { type: 'FeatureCollection', features: zones }
                : zones,
            },
        retry: { idempotent: true },
        ...request,
      }
    );
  }

  // ─── POIs ───────────────────────────────────────────────────────────────────────────────────────────────────

  /**
   * POIs of the first venue nearest to the point (GET `/spatial/pois/{namespace}/nearest-to-point`). `tags` is an
   * OR filter, echoed as `tags_filter`.
   *
   * Known issue USI-P3-2: the server returns no POIs today. Use `analyzeCustomPois` with the features of
   * `client.venues.listPois()` (Point Features are flattened for you).
   *
   * @throws {ValidationError} status 0 for an out-of-range point (nothing sent)
   * @throws {ContextError} no namespace, or a non-integer `level`
   */
  nearestPois(
    options: NearestQueryOptions & PoiTagsOption & SpatialCallOptions,
    /** @deprecated since 0.3.0 — pass `signal`/`timeoutMs`/`headers` in `options` */
    requestOptions?: RequestOptions
  ): Promise<NearestPoisResult>;
  /** Legacy positional form (namespace first); the object form is `nearestPois({ ...options, namespace })`. */
  nearestPois(
    namespace: string,
    options: NearestQueryOptions & PoiTagsOption,
    requestOptions?: RequestOptions
  ): Promise<NearestPoisResult>;
  async nearestPois(
    arg1: string | (NearestQueryOptions & PoiTagsOption & SpatialCallOptions),
    arg2?: (NearestQueryOptions & PoiTagsOption) | RequestOptions,
    arg3?: RequestOptions
  ): Promise<NearestPoisResult> {
    const { bag, ctx, request, rest, namespace } = this.args(arg1, arg2, arg3);
    return this.transport.request<NearestPoisResult>(
      'GET',
      '/spatial/pois/{namespace}/nearest-to-point',
      {
        params: { namespace },
        query: {
          ...point(rest.lat, rest.lon),
          limit: rest.limit as number | undefined,
          max_distance_meters: rest.maxDistanceMeters as number | undefined,
          tags: rest.tags as string[] | undefined,
          level: this.levelOf(bag, ctx),
        },
        ...request,
      }
    );
  }

  /**
   * POIs of the first venue within `radiusMeters` of the point (GET `/spatial/pois/{namespace}/within-radius`;
   * server cap 1000 results).
   *
   * Known issue USI-P3-2: the server returns no POIs today. Use `analyzeCustomPois` with
   * `operation: 'within-radius'` over the features of `client.venues.listPois()`.
   *
   * @throws {ValidationError} status 0 for an out-of-range point (nothing sent)
   * @throws {ContextError} no namespace, or a non-integer `level`
   */
  poisWithinRadius(
    options: RadiusQueryOptions & PoiTagsOption & SpatialCallOptions,
    /** @deprecated since 0.3.0 — pass `signal`/`timeoutMs`/`headers` in `options` */
    requestOptions?: RequestOptions
  ): Promise<PoisWithinRadiusResult>;
  /** Legacy positional form (namespace first); the object form is `poisWithinRadius({ ...options, namespace })`. */
  poisWithinRadius(
    namespace: string,
    options: RadiusQueryOptions & PoiTagsOption,
    requestOptions?: RequestOptions
  ): Promise<PoisWithinRadiusResult>;
  async poisWithinRadius(
    arg1: string | (RadiusQueryOptions & PoiTagsOption & SpatialCallOptions),
    arg2?: (RadiusQueryOptions & PoiTagsOption) | RequestOptions,
    arg3?: RequestOptions
  ): Promise<PoisWithinRadiusResult> {
    const { bag, ctx, request, rest, namespace } = this.args(arg1, arg2, arg3);
    return this.transport.request<PoisWithinRadiusResult>(
      'GET',
      '/spatial/pois/{namespace}/within-radius',
      {
        params: { namespace },
        query: {
          ...point(rest.lat, rest.lon),
          radius_meters: rest.radiusMeters as number,
          tags: rest.tags as string[] | undefined,
          level: this.levelOf(bag, ctx),
        },
        ...request,
      }
    );
  }

  /**
   * POIs of the first venue carrying `tag` (GET `/spatial/pois/{namespace}/by-tag`); an empty tag is a 400.
   *
   * Known issue USI-P3-2: the server returns no POIs today. Use `client.venues.listPois({ tag })`.
   *
   * @throws {ContextError} no namespace, or a non-integer `level`
   */
  async poisByTag(options: PoisByTagOptions & SpatialCallOptions): Promise<PoisByTagResult> {
    const { bag, ctx, request, rest, namespace } = this.args(options, undefined, undefined);
    return this.transport.request<PoisByTagResult>('GET', '/spatial/pois/{namespace}/by-tag', {
      params: { namespace },
      query: { tag: rest.tag as string, level: this.levelOf(bag, ctx) },
      ...request,
    });
  }

  /**
   * POI counts of the first venue (GET `/spatial/pois/{namespace}/statistics`). `total_pois` and `levels` are
   * right; `tags` and `venues` stay empty for GeoJSON POIs (USI-P3-3): count tags over `client.venues.listPois()`.
   * Never sends `level`.
   *
   * @throws {ContextError} no namespace
   */
  async poiStatistics(options?: SpatialCallOptions): Promise<PoiStatistics> {
    const { ctx, request } = splitCallOptions(options);
    return this.transport.request<PoiStatistics>('GET', '/spatial/pois/{namespace}/statistics', {
      params: { namespace: this.ns(ctx) },
      ...request,
    });
  }

  /**
   * Nearest or within-radius search over the caller's POIs (POST `/spatial/pois/{namespace}/analyze-custom`). The
   * reliable POI lookup today: pass the features of `client.venues.listPois()` (USI-P3-2 does not affect it).
   *
   * Each item is a flat `{ lat, lon, ... }` object or a GeoJSON Point Feature, flattened to
   * `{ ...properties, lat, lon }`; the keys `location`, `position`, `coordinates`, `latitude`, `longitude` are
   * removed (the server would read them first). `operation` defaults to `'nearest'` (`limit`, server default 10,
   * and `maxDistanceMeters` apply); `'within-radius'` needs a positive `radiusMeters`. The legacy form sends
   * `request` verbatim. The server rejects a reference point with `lat` or `lon` exactly `0` and silently drops
   * custom POIs with a `0` coordinate (USI-P3-6); the body is limited to 100 kB. Read-only: retried under the
   * client's retry policy.
   *
   * @throws {ValidationError} status 0 for an out-of-range point or a missing / non-positive `radiusMeters` with
   *   `'within-radius'` (nothing sent)
   * @example
   * ```typescript
   * const pois = await client.venues.listPois({ venueId: 1 });
   * const res = await client.spatial.analyzeCustomPois({
   *   lat: 48.85,
   *   lon: 2.35,
   *   customPois: pois.features,
   *   operation: 'within-radius',
   *   radiusMeters: 50,
   * });
   * res.pois.forEach((p) => console.log(p.name, p.distance_meters));
   * ```
   */
  analyzeCustomPois<T extends CustomPoiInput = CustomPoiInput>(
    options: AnalyzeCustomPoisOptions<T> & SpatialCallOptions,
    /** @deprecated since 0.3.0 — pass `signal`/`timeoutMs`/`headers` in `options` */
    requestOptions?: RequestOptions
  ): Promise<AnalyzeCustomPoisResult<T>>;
  /** Legacy positional form (namespace first); the object form is `analyzeCustomPois({ lat, lon, customPois, operation, namespace })`. */
  analyzeCustomPois<T extends CustomPoiInput = CustomPoiInput>(
    namespace: string,
    request: AnalyzeCustomPoisRequest<T>,
    requestOptions?: RequestOptions
  ): Promise<AnalyzeCustomPoisResult<T>>;
  async analyzeCustomPois<T extends CustomPoiInput = CustomPoiInput>(
    arg1: string | (AnalyzeCustomPoisOptions<T> & SpatialCallOptions),
    arg2?: AnalyzeCustomPoisRequest<T> | RequestOptions,
    arg3?: RequestOptions
  ): Promise<AnalyzeCustomPoisResult<T>> {
    const { legacy, bag, request, rest, namespace } = this.args(arg1, arg2, arg3);
    const reference_point = point(
      legacy ? bag.reference_point?.lat : rest.lat,
      legacy ? bag.reference_point?.lon : rest.lon
    );
    const o = rest as Partial<AnalyzeCustomPoisOptions<T>>;
    const operation = o.operation ?? 'nearest';
    const radius = o.radiusMeters;
    if (!legacy && operation === 'within-radius' && !(typeof radius === 'number' && radius > 0))
      throw new ValidationError(
        `radiusMeters must be a positive number for operation 'within-radius' (got ${String(radius)})`,
        undefined,
        { status: 0, details: ['radiusMeters'] }
      );
    const options: CustomPoiOperationOptions =
      operation === 'within-radius'
        ? { radius }
        : { limit: o.limit, maxDistance: o.maxDistanceMeters };
    return this.transport.request<AnalyzeCustomPoisResult<T>>(
      'POST',
      '/spatial/pois/{namespace}/analyze-custom',
      {
        params: { namespace },
        body: legacy
          ? bag
          : {
              reference_point,
              custom_pois: o.customPois?.map(flatPoi),
              operation,
              options: Object.values(options).some((v) => v !== undefined) ? options : undefined,
            },
        retry: { idempotent: true },
        ...request,
      }
    );
  }

  // ─── Assets ─────────────────────────────────────────────────────────────────────────────────────────────────

  /**
   * Assets nearest to the point, from the namespace's position cache (GET
   * `/spatial/assets/{namespace}/nearest-to-point`), ascending `distance_meters`.
   *
   * `maxAge` is applied by the server **after** `limit`, so fewer than `limit` fresh assets can come back; when no
   * cached asset is left the server falls back to an Elasticsearch search, which today yields no assets
   * (USI-P3-8). Pass `maxAge` so that this fallback stays time-bounded. `search` keeps (`include`) or drops
   * (`exclude`) the assets whose `field` matches the regex `pattern`. Never sends `level`.
   *
   * @throws {ValidationError} status 0 for an out-of-range point or a numeric `maxAge` that is not finite or is
   *   below 1 ms once truncated (nothing sent); status 400 for `limit` outside 1–100 or an invalid `maxAge` string
   * @example
   * ```typescript
   * const res = await client.spatial.nearestAssets({ lat: 48.85, lon: 2.35, limit: 5, maxAge: '15m' });
   * res.assets.forEach((a) => console.log(a.user_udid, a.distance_meters));
   * ```
   */
  async nearestAssets(
    options: NearestAssetsOptions & SpatialCallOptions
  ): Promise<SpatialAssetsResponse> {
    return this.assets('/spatial/assets/{namespace}/nearest-to-point', options, true);
  }

  /**
   * Assets nearest to the point, from the position cache only (GET `/spatial/assets/{namespace}/nearest-realtime`),
   * ascending `distance_meters`; items carry `color`, `model`, `speed`, `path`. Never sends `max_age` or `level`.
   *
   * @throws {ValidationError} status 0 for an out-of-range point (nothing sent); status 400 for `limit` outside
   *   1–100
   */
  async nearestAssetsRealtime(
    options: NearestAssetsRealtimeOptions & SpatialCallOptions
  ): Promise<SpatialAssetsResponse> {
    return this.assets('/spatial/assets/{namespace}/nearest-realtime', options, false);
  }

  private assets(
    path:
      | '/spatial/assets/{namespace}/nearest-to-point'
      | '/spatial/assets/{namespace}/nearest-realtime',
    options: NearestAssetsOptions & SpatialCallOptions,
    withMaxAge: boolean
  ): Promise<SpatialAssetsResponse> {
    const { ctx, request, rest } = splitCallOptions(options);
    return this.transport.request<SpatialAssetsResponse>('GET', path, {
      params: { namespace: this.ns(ctx) },
      query: {
        ...point(rest.lat, rest.lon),
        limit: rest.limit,
        max_distance: rest.maxDistanceMeters,
        search_field: rest.search?.field,
        search_value: rest.search?.pattern,
        search_mode: rest.search?.mode,
        max_age: withMaxAge ? maxAgeParam(rest.maxAge) : undefined,
      },
      ...request,
    });
  }
}
