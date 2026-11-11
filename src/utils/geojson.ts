/**
 * Flatten the GeoJSON collections of the venue routes into plain items. Every extractor skips features whose
 * `geometry` is `null` (the server's validator lets such features through).
 *
 * @module utils/geojson
 */
import type {
  GeoJSONGeometry,
  PathFeatureCollection,
  PathNode,
  PathNodeFeature,
  PathSegment,
  PathSegmentFeature,
  POI,
  POIFeatureCollection,
  Zone,
  ZoneFeatureCollection,
} from '../types/geojson';

/** A feature whose geometry is set (`null` geometries are skipped). */
function hasGeometry(feature: { geometry: GeoJSONGeometry | null }): boolean {
  return feature.geometry != null;
}

/**
 * Extracts flat {@link Zone} objects from a zone collection (`color` from `rgb_color`, `geometry` kept).
 *
 * @example
 * ```typescript
 * import { extractZonesFromGeoJSON } from 'ubudu-rtls-sdk';
 *
 * const zones = extractZonesFromGeoJSON(await client.zones.list());
 * ```
 */
export function extractZonesFromGeoJSON(geoJson: ZoneFeatureCollection): Zone[] {
  return geoJson.features.filter(hasGeometry).map(({ properties: p, geometry }) => ({
    id: p.id,
    name: p.name,
    level: p.level,
    color: p.rgb_color,
    tags: p.tags,
    type: p.type,
    geometry,
  }));
}

/**
 * Extracts flat {@link POI} objects from a POI collection (`[lon, lat]` → `lat`/`lng`; missing `tags` → `[]`).
 *
 * @example
 * ```typescript
 * import { extractPoisFromGeoJSON } from 'ubudu-rtls-sdk';
 *
 * const pois = extractPoisFromGeoJSON(await client.venues.listPois());
 * ```
 */
export function extractPoisFromGeoJSON(geoJson: POIFeatureCollection): POI[] {
  return geoJson.features.filter(hasGeometry).map(({ properties: p, geometry }) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    level: p.level,
    color: p.color,
    tags: p.tags ?? [],
    lat: geometry.coordinates[1],
    lng: geometry.coordinates[0],
  }));
}

/**
 * Extracts the path nodes of a path collection (segments are ignored).
 *
 * @example
 * ```typescript
 * import { extractPathNodesFromGeoJSON } from 'ubudu-rtls-sdk';
 *
 * const nodes = extractPathNodesFromGeoJSON(await client.venues.listPaths());
 * ```
 */
export function extractPathNodesFromGeoJSON(geoJson: PathFeatureCollection): PathNode[] {
  return geoJson.features
    .filter((f): f is PathNodeFeature => hasGeometry(f) && f.properties.type === 'path_node')
    .map(({ properties: p, geometry }) => ({
      id: p.id,
      externalId: p.external_id,
      nodeType: p.node_type,
      name: p.name,
      level: p.level,
      isActive: p.is_active,
      crossLevelConnections: p.cross_level_connections,
      tags: p.tags,
      lat: geometry.coordinates[1],
      lng: geometry.coordinates[0],
      poiType: p.poi_type,
      isAccessible: p.is_accessible,
      isEmergencyExit: p.is_emergency_exit,
    }));
}

/**
 * Extracts the path segments of a path collection (nodes are ignored), with the stored property names.
 *
 * @example
 * ```typescript
 * import { extractPathSegmentsFromGeoJSON } from 'ubudu-rtls-sdk';
 *
 * const segments = extractPathSegmentsFromGeoJSON(await client.venues.listPaths());
 * ```
 */
export function extractPathSegmentsFromGeoJSON(geoJson: PathFeatureCollection): PathSegment[] {
  return geoJson.features
    .filter((f): f is PathSegmentFeature => hasGeometry(f) && f.properties.type === 'path_segment')
    .map(({ properties: p, geometry }) => ({
      id: p.id,
      externalId: p.external_id,
      sourceNodeId: p.source_node_id,
      targetNodeId: p.target_node_id,
      level: p.level,
      bidirectional: p.bidirectional,
      distance: p.distance,
      estimatedTime: p.estimated_time,
      accessibility: p.accessibility,
      penaltyFactor: p.penalty_factor,
      isActive: p.is_active,
      tags: p.tags,
      connectionType: p.connection_type,
      coordinates: geometry.coordinates,
    }));
}
