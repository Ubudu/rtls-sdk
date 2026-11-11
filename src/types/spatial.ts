/**
 * Request, option and result types of `client.spatial`.
 *
 * The spec declares no 200 schema for the zone and POI operations (spec gap: USI-P3-10), so their results are
 * hand-written from the server's responses; the spatial-asset results are the generated schemas.
 *
 * @module types/spatial
 */
import type { RequestOptions } from '../client/base';
import type { CallContext } from '../context';
import type { Schema } from '../types';
import type {
  GeoJSONFeature,
  GeoJSONFeatureCollection,
  GeoJSONPoint,
  GeoJSONPolygon,
  POIFeature,
  ZoneFeature,
} from './geojson';

// ─── Common ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** A WGS84 point as the spatial routes read and echo it. */
export interface SpatialReferencePoint {
  lat: number;
  lon: number;
}

/** A computed point (centroid), same shape as {@link SpatialReferencePoint}. */
export interface SpatialPoint {
  lat: number;
  lon: number;
}

/**
 * Floor filter of the zone and POI lookups. Omitted: the client default `level` applies (when set). `null`: all
 * levels, even when the client has a default level. Sent when defined, `0` included.
 */
export interface SpatialLevelOption {
  level?: number | null;
}

/**
 * Per-call context and request options of every spatial method. `level` is not part of it: only the zone and POI
 * lookups take it, as their own option ({@link SpatialLevelOption}).
 */
export type SpatialCallOptions = Omit<CallContext, 'level'> & RequestOptions;

// ─── Options ────────────────────────────────────────────────────────────────────────────────────────────────────

/** A point lookup: `lat` in [-90, 90], `lon` in [-180, 180] (checked before the request). */
export type PointQueryOptions = { lat: number; lon: number } & SpatialLevelOption;

/** Nearest-item lookup: `limit` (server default 10) caps the result, `maxDistanceMeters` filters by distance. */
export type NearestQueryOptions = PointQueryOptions & {
  limit?: number;
  maxDistanceMeters?: number;
};

/** Radius lookup: `radiusMeters` must be positive (server cap 1000). */
export type RadiusQueryOptions = PointQueryOptions & { radiusMeters: number };

/** POI tag filter: sent as CSV with OR semantics; an empty array sends nothing. */
export interface PoiTagsOption {
  tags?: string[];
}

/** `poisByTag` options. */
export type PoisByTagOptions = { tag: string } & SpatialLevelOption;

/**
 * `zoneDistances` options. `zoneIds` are the `properties.id` values exactly as `zones.list()` returns them: the
 * server matches them with strict equality, so `1` and `'1'` differ.
 */
export interface ZoneDistancesOptions {
  lat: number;
  lon: number;
  zoneIds: Array<number | string>;
}

/** A polygon Feature with caller-defined properties. */
export type SpatialPolygonFeature<P = Record<string, unknown>> = GeoJSONFeature<GeoJSONPolygon, P>;

/** `analyzeCustomZones` options: an array of polygon Features is wrapped into a FeatureCollection. */
export interface AnalyzeCustomZonesOptions<P = Record<string, unknown>> {
  lat: number;
  lon: number;
  customZones: SpatialPolygonFeature<P>[] | GeoJSONFeatureCollection<SpatialPolygonFeature<P>>;
}

/** Wire body of `POST /spatial/zones/{namespace}/analyze-custom` (legacy form, sent verbatim). */
export interface AnalyzeCustomZonesRequest<P = Record<string, unknown>> {
  reference_point: SpatialReferencePoint;
  custom_zones: GeoJSONFeatureCollection<SpatialPolygonFeature<P>>;
}

/** A flat custom POI: its own `lat`/`lon` plus any extra keys, echoed in the result. */
export interface CustomPoiInput {
  lat: number;
  lon: number;
  name?: string;
  tags?: string[];
  [k: string]: unknown;
}

/** Operation of `analyzeCustomPois`. */
export type CustomPoiOperation = 'nearest' | 'within-radius';

/**
 * `analyzeCustomPois` options. `operation` defaults to `'nearest'` (`limit`, `maxDistanceMeters` apply);
 * `'within-radius'` needs a positive `radiusMeters`. GeoJSON Point Features are flattened to
 * `{ ...properties, lat, lon }`.
 */
export interface AnalyzeCustomPoisOptions<T = CustomPoiInput> {
  lat: number;
  lon: number;
  /** Flat points or GeoJSON Point Features (`client.venues.listPois()` features included). */
  customPois: Array<T | GeoJSONFeature<GeoJSONPoint, object>>;
  operation?: CustomPoiOperation;
  limit?: number;
  maxDistanceMeters?: number;
  radiusMeters?: number;
}

/** Options block of the custom-POI wire body and result. */
export interface CustomPoiOperationOptions {
  limit?: number;
  maxDistance?: number;
  radius?: number;
}

/** Wire body of `POST /spatial/pois/{namespace}/analyze-custom` (legacy form, sent verbatim). */
export interface AnalyzeCustomPoisRequest<T = CustomPoiInput> {
  reference_point: SpatialReferencePoint;
  custom_pois: T[];
  operation: CustomPoiOperation;
  options?: CustomPoiOperationOptions;
}

/** Regex search on a dot path of the cached position (`user_name`, `data.type`, `zone.name`…), case-sensitive. */
export interface AssetSearch {
  field: string;
  /** A JavaScript regular expression, sent unchanged. */
  pattern: string;
  /** `include` (server default) keeps the matches, `exclude` drops them. */
  mode?: 'include' | 'exclude';
}

/** `nearestAssets` options. */
export interface NearestAssetsOptions {
  lat: number;
  lon: number;
  /** 1–100, server default 10. */
  limit?: number;
  /** Metres; sent as `max_distance`. */
  maxDistanceMeters?: number;
  search?: AssetSearch;
  /**
   * Freshness bound: a string such as `'15m'`, `'2h'`, `'1d'` (sent verbatim), or a number of milliseconds
   * (truncated to an integer, which must be at least 1).
   */
  maxAge?: string | number;
}

/** `nearestAssetsRealtime` options: as {@link NearestAssetsOptions}, without `maxAge`. */
export type NearestAssetsRealtimeOptions = Omit<NearestAssetsOptions, 'maxAge'>;

// ─── Zone results ───────────────────────────────────────────────────────────────────────────────────────────────

/** A venue zone Feature as the zone lookups return it, with a top-level `level` (`properties.level`, else 0). */
export type SpatialZoneFeature = ZoneFeature & { level: number };

/** A zone Feature with its distances to the reference point (whole metres). */
export type SpatialZoneMatch = SpatialZoneFeature & {
  distance_meters: number;
  centroid_distance_meters: number;
  /** Average of the ring vertices; can lie outside a concave zone. */
  centroid: SpatialPoint;
  is_inside: boolean;
};

/** Result of `zonesContainingPoint`. */
export interface ZonesContainingPointResult {
  reference_point: SpatialReferencePoint;
  level: number | null;
  containing_zones: SpatialZoneFeature[];
  total: number;
  hasMore?: boolean;
}

/** Result of `nearestZones`. `hasMore` is not meaningful here (USI-P3-13). */
export interface NearestZonesResult {
  reference_point: SpatialReferencePoint;
  level: number | null;
  max_distance_meters: number | null;
  total_zones: number;
  zones: SpatialZoneMatch[];
  hasMore?: boolean;
}

/** Result of `zonesWithinRadius`. */
export interface ZonesWithinRadiusResult {
  reference_point: SpatialReferencePoint;
  radius_meters: number;
  level: number | null;
  total_zones: number;
  zones: SpatialZoneMatch[];
  hasMore?: boolean;
}

/** One zone of `zoneDistances` (ascending boundary distance; non-polygon zones are skipped). */
export interface ZoneDistance {
  zone_id: number | string;
  zone_name: string;
  /** `properties.level`; absent when the zone has none. */
  level?: number;
  boundary_distance_meters: number;
  centroid_distance_meters: number;
  is_inside: boolean;
  centroid: SpatialPoint;
}

/** Result of `zoneDistances`. */
export interface ZoneDistancesResult {
  reference_point: SpatialReferencePoint;
  requested_zones: number;
  found_zones: number;
  zones: ZoneDistance[];
}

/** One custom zone of `analyzeCustomZones`: its index in the input and its echoed properties. */
export interface CustomZoneMatch<P = Record<string, unknown>> {
  index: number;
  /** The Feature's properties (`{}` when absent). */
  properties: P;
  distance_meters: number;
  centroid_distance_meters: number;
  is_inside: boolean;
  centroid: SpatialPoint;
}

/** Result of `analyzeCustomZones`. */
export interface AnalyzeCustomZonesResult<P = Record<string, unknown>> {
  reference_point: SpatialReferencePoint;
  /** Every input feature. */
  total_zones: number;
  containing_zones: CustomZoneMatch<P>[];
  /** Every polygon feature, ascending distance. */
  nearby_zones: CustomZoneMatch<P>[];
}

// ─── POI results ────────────────────────────────────────────────────────────────────────────────────────────────

/** A POI of the nearest / within-radius lookups (server-code shape). */
export interface SpatialPoiMatch {
  _id?: string;
  name?: string;
  description?: string;
  coordinates?: { lat: number; lng: number };
  level?: number;
  tags?: string[];
  color?: string;
  venue_id?: number | string;
  venue_name?: string;
  map_id?: number | string;
  map_name?: string;
  distance_meters: number;
}

/** A POI Feature of `poisByTag`. */
export type SpatialPoiFeature = POIFeature & { venue_id: number | string; level: number };

/** Result of `nearestPois`. */
export interface NearestPoisResult {
  reference_point: SpatialReferencePoint;
  level: number | null;
  max_distance_meters: number | null;
  tags_filter: string[] | null;
  total_pois: number;
  pois: SpatialPoiMatch[];
  hasMore?: boolean;
}

/** Result of `poisWithinRadius`. */
export interface PoisWithinRadiusResult {
  reference_point: SpatialReferencePoint;
  radius_meters: number;
  level: number | null;
  tags_filter: string[] | null;
  total_pois: number;
  pois: SpatialPoiMatch[];
  hasMore?: boolean;
}

/** Result of `poisByTag`. */
export interface PoisByTagResult {
  tag: string;
  level: number | null;
  total_pois: number;
  pois: SpatialPoiFeature[];
  hasMore?: boolean;
}

/** Result of `poiStatistics` (`tags` and `venues` stay empty for Feature POIs, USI-P3-3). */
export interface PoiStatistics {
  total_pois: number;
  levels: Record<string, number>;
  tags: Record<string, number>;
  venues: Record<string, number>;
}

/** One custom POI of `analyzeCustomPois`: the sent item plus its index, position and (unrounded) distance. */
export type CustomPoiMatch<T = CustomPoiInput> = T & {
  index: number;
  lat: number;
  lon: number;
  distance_meters: number;
};

/** Result of `analyzeCustomPois`. */
export interface AnalyzeCustomPoisResult<T = CustomPoiInput> {
  reference_point: SpatialReferencePoint;
  operation: CustomPoiOperation;
  options?: CustomPoiOperationOptions;
  total_custom_pois: number;
  matching_pois: number;
  /** Ascending distance. */
  pois: CustomPoiMatch<T>[];
}

// ─── Asset results (generated) ──────────────────────────────────────────────────────────────────────────────────

// spec gap: USI-P3-10 — the spec's SpatialAssetItem.zone lacks `tags`, which the server returns.
/** One asset of {@link SpatialAssetsResponse}, ascending `distance_meters` (generated schema, `zone.tags` added). */
export type SpatialAssetItem = Omit<Schema<'SpatialAssetItem'>, 'zone'> & {
  /** The zone the asset is in, when known. */
  zone?: NonNullable<Schema<'SpatialAssetItem'>['zone']> & { tags?: string[] };
};

/** Result of `nearestAssets` / `nearestAssetsRealtime` (generated schema, items as {@link SpatialAssetItem}). */
export type SpatialAssetsResponse = Omit<Schema<'SpatialAssetsResponse'>, 'assets'> & {
  /** Ascending `distance_meters`. */
  assets: SpatialAssetItem[];
};

// ─── Deprecated aliases ─────────────────────────────────────────────────────────────────────────────────────────

/** @deprecated since 0.3.0 — use {@link NearestQueryOptions}. */
export type SpatialQueryOptions = NearestQueryOptions;

/** @deprecated since 0.3.0 — use {@link SpatialZoneMatch} (a GeoJSON Feature: read `properties.name`). */
export type ZoneWithDistance = SpatialZoneMatch;

/** @deprecated since 0.3.0 — use {@link SpatialPoiMatch}. */
export type POIWithDistance = SpatialPoiMatch;
