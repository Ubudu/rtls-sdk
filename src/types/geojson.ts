/**
 * GeoJSON types of the venue routes (zones, POIs, path graph) and the flat item types the extractors build from
 * them. Hand-written: the spec's venue components do not match the wire (USI-P4-4, USI-P4-5).
 *
 * @module types/geojson
 */

// ─── Geometry ────────────────────────────────────────────────────────────────

/** A GeoJSON point, `[lon, lat]`. */
export interface GeoJSONPoint {
  type: 'Point';
  /** `[lon, lat]` */
  coordinates: [number, number];
}

/** A GeoJSON polygon (rings of `[lon, lat]` positions). */
export interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

/** A GeoJSON line string of `[lon, lat]` positions. */
export interface GeoJSONLineString {
  type: 'LineString';
  coordinates: [number, number][];
}

/** The geometries the venue routes return (O13: other GeoJSON types are not produced by the map editor). */
export type GeoJSONGeometry = GeoJSONPoint | GeoJSONPolygon | GeoJSONLineString;

// ─── Feature and collection ──────────────────────────────────────────────────

/** A GeoJSON feature with typed geometry and properties. */
export interface GeoJSONFeature<G extends GeoJSONGeometry, P = Record<string, unknown>> {
  type: 'Feature';
  geometry: G;
  properties: P;
}

/**
 * The `metadata` key of a venue collection. Hand-written: the spec does not describe it; the server fills it from
 * the unfiltered collection (`count` ignores a filter), and leaves it out on its upstream failure path.
 */
export interface CollectionMetadata<K extends string> {
  type: K;
  /** Number of features of the unfiltered collection. */
  count: number;
  /** ISO time the server built the collection. */
  timestamp: string;
  /** Set on the server's fallback path only. */
  error?: string;
}

/**
 * A GeoJSON feature collection as the venue routes return it. Hand-written: `metadata` is absent on some paths and
 * `total`/`hasMore` are added only when a filter was sent (USI-P4-5).
 */
export interface GeoJSONFeatureCollection<F> {
  type: 'FeatureCollection';
  features: F[];
  metadata?: CollectionMetadata<string>;
  /** Present when a filter was sent: the number of matching features. */
  total?: number;
  /** Present when a filter and `limit`/`offset` were sent (the SDK never sends `limit`/`offset`). */
  hasMore?: boolean;
}

// ─── Zones ───────────────────────────────────────────────────────────────────

/** Properties of a zone feature (keys as on the wire). */
export interface ZoneProperties {
  id: number;
  name: string;
  level: number;
  rgb_color: string;
  tags: string[];
  type: string;
}

/** A zone: polygon plus {@link ZoneProperties}. */
export type ZoneFeature = GeoJSONFeature<GeoJSONPolygon, ZoneProperties>;

/** `GET /venues/{ns}/{venueId}/zones`. Hand-written: the spec types `metadata` as required; it is not (USI-P4-5). */
export interface ZoneFeatureCollection extends GeoJSONFeatureCollection<ZoneFeature> {
  metadata?: CollectionMetadata<'zones'>;
}

// ─── POIs ────────────────────────────────────────────────────────────────────

/**
 * Properties of a POI feature. Hand-written: the server sets `id` to the POI's external id or, without one, its
 * string `_id`, and copies the raw POI fields, most of them optional (spec lists 14 required properties).
 */
export interface POIProperties {
  id: number | string;
  name: string;
  level: number;
  description?: string;
  color?: string;
  tags?: string[];
  _id?: string;
  coordinates?: { lat: number; lng: number };
  createdAt?: string;
  updatedAt?: string;
  externalId?: number;
  externalVenueId?: number;
  externalApplicationId?: number;
  index?: number;
}

/** A POI: point plus {@link POIProperties}. */
export type POIFeature = GeoJSONFeature<GeoJSONPoint, POIProperties>;

/** `GET /venues/{ns}/{venueId}/pois`. Hand-written: `metadata` optional, `total`/`hasMore` on filtered calls. */
export interface POIFeatureCollection extends GeoJSONFeatureCollection<POIFeature> {
  metadata?: CollectionMetadata<'pois'>;
}

// ─── Path graph ──────────────────────────────────────────────────────────────

/**
 * `node_type` of a path node. Hand-written: the spec's enum (`exit`, `stairs`) is not what the map editor stores
 * (`entrance` is seen live); other values are kept as strings.
 */
export type PathNodeType =
  | 'waypoint'
  | 'entrance'
  | 'elevator'
  | 'staircase'
  | 'restroom'
  | 'escalator'
  | 'emergency_exit'
  | (string & {});

/** One entry of `cross_level_connections`: a node id, or a target node with its connection type. */
export type CrossLevelConnection = number | { target_node_id: number; connection_type?: string };

/** Properties of a path node feature (keys as on the wire). Hand-written: the spec's node schema is stale. */
export interface PathNodeProperties {
  id: number;
  external_id: number;
  type: 'path_node';
  node_type: PathNodeType;
  name: string;
  level: number;
  is_active: boolean;
  cross_level_connections: CrossLevelConnection[];
  tags: string[];
  poi_type?: string;
  is_accessible?: boolean;
  is_emergency_exit?: boolean;
}

/** A path node: point plus {@link PathNodeProperties}. */
export type PathNodeFeature = GeoJSONFeature<GeoJSONPoint, PathNodeProperties>;

/** Accessibility flags of a path segment. */
export interface SegmentAccessibility {
  wheelchair: boolean;
  visual_impaired: boolean;
  hearing_impaired: boolean;
}

/**
 * Properties of a path segment feature (keys as on the wire). Hand-written: the 0.2 SDK typed names the server
 * never sends; these are the stored names.
 */
export interface PathSegmentProperties {
  id: number;
  external_id: number;
  type: 'path_segment';
  source_node_id: number;
  target_node_id: number;
  level: number;
  bidirectional: boolean;
  /** metres */
  distance: number;
  /** seconds */
  estimated_time: number;
  accessibility: SegmentAccessibility;
  penalty_factor: number;
  is_active: boolean;
  tags: string[];
  connection_type?: string;
}

/** A path segment: line string plus {@link PathSegmentProperties}. */
export type PathSegmentFeature = GeoJSONFeature<GeoJSONLineString, PathSegmentProperties>;

/** A feature of the path graph: a node or a segment. */
export type PathFeature = PathNodeFeature | PathSegmentFeature;

/** `GET /venues/{ns}/{venueId}/paths`. Hand-written: `metadata` optional, `total`/`hasMore` on filtered calls. */
export interface PathFeatureCollection extends GeoJSONFeatureCollection<PathFeature> {
  metadata?: CollectionMetadata<'paths'>;
}

// ─── Flat items (built by the extract*FromGeoJSON helpers) ───────────────────

/** A zone as a flat object (`color` from `rgb_color`). */
export interface Zone {
  id: number;
  name: string;
  level: number;
  /** From `rgb_color`. */
  color: string;
  tags: string[];
  type: string;
  geometry?: GeoJSONPolygon;
}

/** A POI as a flat object (`lat`/`lng` from the point). */
export interface POI {
  id: number | string;
  name: string;
  description?: string;
  level: number;
  color?: string;
  /** `[]` when the feature has no tags. */
  tags: string[];
  lat: number;
  lng: number;
}

/** A path node as a flat object. */
export interface PathNode {
  id: number;
  externalId: number;
  nodeType: PathNodeType;
  name: string;
  level: number;
  isActive: boolean;
  crossLevelConnections: CrossLevelConnection[];
  tags: string[];
  lat: number;
  lng: number;
  poiType?: string;
  isAccessible?: boolean;
  isEmergencyExit?: boolean;
}

/** A path segment as a flat object. */
export interface PathSegment {
  id: number;
  externalId: number;
  sourceNodeId: number;
  targetNodeId: number;
  level: number;
  bidirectional: boolean;
  /** metres */
  distance: number;
  /** seconds */
  estimatedTime: number;
  accessibility: SegmentAccessibility;
  penaltyFactor: number;
  isActive: boolean;
  tags: string[];
  connectionType?: string;
  /** `[lon, lat]` positions of the line. */
  coordinates: [number, number][];
}
