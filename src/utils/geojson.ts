import type {
  ZoneFeatureCollection,
  ZoneFeature,
  POIFeatureCollection,
  POIFeature,
  PathFeatureCollection,
  PathNodeFeature,
  PathSegmentFeature,
} from '../types/geojson';
import type { Zone, POI, PathNode, PathSegment } from '../types';

/**
 * Extracts flat Zone objects from GeoJSON FeatureCollection.
 */
export function extractZonesFromGeoJSON(geoJson: ZoneFeatureCollection): Zone[] {
  return geoJson.features.map((feature: ZoneFeature) => ({
    id: feature.properties.id,
    name: feature.properties.name,
    level: feature.properties.level,
    color: feature.properties.rgb_color,
    tags: feature.properties.tags,
    type: feature.properties.type,
    geometry: feature.geometry,
  }));
}

/**
 * Extracts flat POI objects from GeoJSON FeatureCollection.
 */
export function extractPoisFromGeoJSON(geoJson: POIFeatureCollection): POI[] {
  return geoJson.features.map((feature: POIFeature) => ({
    id: feature.properties.id,
    name: feature.properties.name,
    description: feature.properties.description,
    level: feature.properties.level,
    color: feature.properties.color,
    tags: feature.properties.tags,
    lat: feature.geometry.coordinates[1],
    lng: feature.geometry.coordinates[0],
  }));
}

/**
 * Extracts path nodes from GeoJSON FeatureCollection.
 */
export function extractPathNodesFromGeoJSON(geoJson: PathFeatureCollection): PathNode[] {
  return geoJson.features
    .filter((f): f is PathNodeFeature => f.properties.type === 'path_node')
    .map((feature) => ({
      id: feature.properties.id,
      externalId: feature.properties.external_id,
      nodeType: feature.properties.node_type,
      name: feature.properties.name,
      level: feature.properties.level,
      isActive: feature.properties.is_active,
      crossLevelConnections: feature.properties.cross_level_connections,
      tags: feature.properties.tags,
      lat: feature.geometry.coordinates[1],
      lng: feature.geometry.coordinates[0],
    }));
}

/**
 * Extracts path segments from GeoJSON FeatureCollection.
 */
export function extractPathSegmentsFromGeoJSON(geoJson: PathFeatureCollection): PathSegment[] {
  return geoJson.features
    .filter((f): f is PathSegmentFeature => f.properties.type === 'path_segment')
    .map((feature) => ({
      id: feature.properties.id,
      startNodeId: feature.properties.start_node_id,
      endNodeId: feature.properties.end_node_id,
      isBidirectional: feature.properties.is_bidirectional,
      weight: feature.properties.weight,
      level: feature.properties.level,
      coordinates: feature.geometry.coordinates,
    }));
}
