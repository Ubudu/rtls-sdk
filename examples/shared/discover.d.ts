// Types of examples/shared/discover.js.

/** The GeoJSON zone features a Discovery holds (Polygon and MultiPolygon, coordinates [lng, lat]). */
export interface GeoJsonFeature {
  type: 'Feature';
  id?: string | number;
  geometry:
    | { type: 'Polygon'; coordinates: number[][][] }
    | { type: 'MultiPolygon'; coordinates: number[][][][] };
  properties?: Record<string, unknown> | null;
}

/** What `discover()` returns: the first usable venue map and its zones. */
export interface Discovery {
  venueId: number;
  mapId: number;
  mapUuid: string;
  level: number;
  /** `[[lat, lng], [lat, lng]]`, lat-first */
  mapBounds: [[number, number], [number, number]];
  /** venue zones ∪ the chosen map's `map_features`, polygonal features only, deduplicated by `properties.id` */
  zones: GeoJsonFeature[];
  /** a point inside the first zone of the map's level (else the first zone) */
  zoneCentroid: { lat: number; lng: number };
  /** id of a path node of the venue (map level first), or null */
  pathNodeId: string | number | null;
}

export declare const EDGE_MARGIN_M: number;
export declare const GRID_SIZE: number;
export declare const BOUNDS_INSET: number;

/** No venue or no usable map. */
export declare class DiscoveryError extends Error {
  constructor(message: string);
}

/** `[[lat, lng], [lat, lng]]` with finite numbers. */
export declare function isMapBounds(b: unknown): b is [[number, number], [number, number]];
/** The id of the first venue with an integer id, else null. */
export declare function firstVenueId(venues: unknown): number | null;
/** True when the point lies inside a polygon of any zone (holes excluded). */
export declare function insideAnyZone(
  point: { lat: number; lng: number },
  zones: GeoJsonFeature[]
): boolean;
/** Smallest distance in metres from the point to any zone edge. */
export declare function edgeDistanceM(
  point: { lat: number; lng: number },
  zones: GeoJsonFeature[]
): number;
/** A point inside the zone (its area centroid when inside, else the nearest inside grid point). */
export declare function zoneInteriorPoint(zone: GeoJsonFeature): { lat: number; lng: number };

/** Pure: the selection and zone union of discover() from responses already read. */
export declare function buildDiscovery(inputs: {
  venues: unknown;
  maps: unknown;
  venueZones: unknown;
  paths?: unknown;
}): Discovery;

/**
 * Raw GETs with the loadConfig() credentials + buildDiscovery; `client` accepted for call-site compatibility and
 * unused; never GET …/maps/{mapId}/zones. Examples obtain their Discovery only from this call.
 */
export declare function discover(client?: unknown): Promise<Discovery>;

/**
 * Reads `mapBounds`, `level` and `zones` only: 9 × 9 grid inset 10 %, ordered by distance from the centre, the
 * first point outside every zone polygon and ≥ 10 m from every edge; null when none qualifies.
 */
export declare function safePublishPoint(
  discovery: Discovery
): { lat: number; lng: number; level: number } | null;
