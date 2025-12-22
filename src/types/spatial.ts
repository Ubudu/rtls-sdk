import type { ZoneProperties, POIProperties } from './geojson';

// Base spatial query result
export interface SpatialReferencePoint {
  lat: number;
  lon: number;
}

// Zone spatial query results
export interface ZonesContainingPointResult {
  reference_point: SpatialReferencePoint;
  level: number | null;
  containing_zones: ZoneWithDistance[];
  total: number;
}

export interface NearestZonesResult {
  reference_point: SpatialReferencePoint;
  level: number | null;
  max_distance_meters: number | null;
  total_zones: number;
  zones: ZoneWithDistance[];
  hasMore: boolean;
}

export interface ZonesWithinRadiusResult {
  reference_point: SpatialReferencePoint;
  radius_meters: number;
  level: number | null;
  total_zones: number;
  zones: ZoneWithDistance[];
}

// POI spatial query results
export interface NearestPoisResult {
  reference_point: SpatialReferencePoint;
  level: number | null;
  max_distance_meters: number | null;
  total_pois: number;
  pois: POIWithDistance[];
  hasMore: boolean;
}

export interface PoisWithinRadiusResult {
  reference_point: SpatialReferencePoint;
  radius_meters: number;
  level: number | null;
  total_pois: number;
  pois: POIWithDistance[];
}

// Zone/POI with distance field
export interface ZoneWithDistance extends ZoneProperties {
  distance_meters?: number;
  geometry?: {
    type: 'Polygon';
    coordinates: number[][][];
  };
}

export interface POIWithDistance extends POIProperties {
  distance_meters?: number;
  geometry?: {
    type: 'Point';
    coordinates: [number, number];
  };
}

// Analyze custom request types
export interface AnalyzeCustomZonesRequest {
  reference_point: SpatialReferencePoint;
  zones: Array<{
    type: 'Feature';
    geometry: { type: 'Polygon'; coordinates: number[][][] };
    properties?: Record<string, unknown>;
  }>;
}

export interface AnalyzeCustomPoisRequest {
  reference_point: SpatialReferencePoint;
  pois: Array<{
    type: 'Feature';
    geometry: { type: 'Point'; coordinates: [number, number] };
    properties?: Record<string, unknown>;
  }>;
}
