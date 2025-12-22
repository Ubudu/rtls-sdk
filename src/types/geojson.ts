// GeoJSON geometry types
export interface GeoJSONPoint {
  type: 'Point';
  coordinates: [number, number]; // [lon, lat]
}

export interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface GeoJSONLineString {
  type: 'LineString';
  coordinates: [number, number][];
}

export type GeoJSONGeometry = GeoJSONPoint | GeoJSONPolygon | GeoJSONLineString;

// Generic feature and collection
export interface GeoJSONFeature<G extends GeoJSONGeometry, P = Record<string, unknown>> {
  type: 'Feature';
  geometry: G;
  properties: P;
}

export interface GeoJSONFeatureCollection<F> {
  type: 'FeatureCollection';
  features: F[];
  metadata?: {
    type: string;
    count?: number;
    timestamp: string;
  };
}

// Zone-specific types
export interface ZoneProperties {
  id: number;
  name: string;
  level: number;
  rgb_color: string;
  tags: string[];
  type: string;
}

export type ZoneFeature = GeoJSONFeature<GeoJSONPolygon, ZoneProperties>;

export interface ZoneFeatureCollection {
  type: 'FeatureCollection';
  features: ZoneFeature[];
  metadata: {
    type: 'zones';
    count: number;
    timestamp: string;
  };
}

// POI-specific types
export interface POIProperties {
  id: number;
  name: string;
  description: string;
  level: number;
  color: string;
  tags: string[];
  _id: string;
  coordinates: { lat: number; lng: number };
  createdAt: string;
  updatedAt: string;
  externalId: number;
  externalVenueId: number;
  externalApplicationId: number;
  index: number;
}

export type POIFeature = GeoJSONFeature<GeoJSONPoint, POIProperties>;

export interface POIFeatureCollection {
  type: 'FeatureCollection';
  features: POIFeature[];
  metadata: {
    type: 'pois';
    count: number;
    timestamp: string;
  };
}

// Path node types
export interface PathNodeProperties {
  id: number;
  external_id: number;
  type: 'path_node';
  node_type: 'waypoint' | 'entrance' | 'exit' | 'elevator' | 'stairs';
  name: string;
  level: number;
  is_active: boolean;
  cross_level_connections: number[];
  tags: string[];
}

export type PathNodeFeature = GeoJSONFeature<GeoJSONPoint, PathNodeProperties>;

// Path segment types
export interface PathSegmentProperties {
  id: number;
  type: 'path_segment';
  start_node_id: number;
  end_node_id: number;
  is_bidirectional: boolean;
  weight: number;
  level: number;
}

export type PathSegmentFeature = GeoJSONFeature<GeoJSONLineString, PathSegmentProperties>;

export type PathFeature = PathNodeFeature | PathSegmentFeature;

export interface PathFeatureCollection {
  type: 'FeatureCollection';
  features: PathFeature[];
  metadata: {
    type: 'paths';
    timestamp: string;
  };
}
