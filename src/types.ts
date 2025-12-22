import type { components, paths, operations } from './generated/schema';

// Core data types - using index signature for flexibility with generated types
export type Asset = components['schemas'] extends { Asset: infer T } ? T : Record<string, unknown>;
export type AssetPosition = components['schemas'] extends { AssetPosition: infer T }
  ? T
  : Record<string, unknown>;
export type CachedAssetPosition = components['schemas'] extends { CachedAssetPosition: infer T }
  ? T
  : Record<string, unknown>;
export type GeneratedZone = components['schemas'] extends { Zone: infer T }
  ? T
  : Record<string, unknown>;
export type Venue = components['schemas'] extends { Venue: infer T } ? T : Record<string, unknown>;
export type MapData = components['schemas'] extends { Map: infer T } ? T : Record<string, unknown>;
export type GeneratedPOI = components['schemas'] extends { POI: infer T }
  ? T
  : Record<string, unknown>;
export type Dashboard = components['schemas'] extends { Dashboard: infer T }
  ? T
  : Record<string, unknown>;
export type AlertRule = components['schemas'] extends { AlertRule: infer T }
  ? T
  : Record<string, unknown>;
export type NavigationResponse = components['schemas'] extends { NavigationResponse: infer T }
  ? T
  : Record<string, unknown>;
export type HealthStatus = components['schemas'] extends { HealthStatus: infer T }
  ? T
  : Record<string, unknown>;
export type BatchSaveResult = components['schemas'] extends { BatchSaveResult: infer T }
  ? T
  : Record<string, unknown>;
export type BatchDeleteResult = components['schemas'] extends { BatchDeleteResult: infer T }
  ? T
  : Record<string, unknown>;

// Path types for internal use
export type { paths, operations, components };

// Pagination response wrapper
export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// Filter operators supported by the API
export type FilterOperator =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'starts'
  | 'ends'
  | 'regex'
  | 'in'
  | 'nin'
  | 'exists'
  | 'between'
  | 'size'
  | 'all'
  | 'elem';

// Query options for list endpoints
export interface QueryOptions {
  page?: number;
  limit?: number;
  sort?: string | string[];
  fields?: string[];
}

// Filter options type
export type FilterOptions = {
  [K in `${string}:${FilterOperator}`]?: string | number | boolean;
};

// GeoJSON types
export * from './types/geojson';

// Spatial response types
export * from './types/spatial';

// Flat zone type (extracted from GeoJSON feature)
export interface Zone {
  id: number;
  name: string;
  level: number;
  color: string; // Mapped from rgb_color
  tags: string[];
  type: string;
  geometry?: {
    type: 'Polygon';
    coordinates: number[][][];
  };
}

// Flat POI type (extracted from GeoJSON feature)
export interface POI {
  id: number;
  name: string;
  description: string;
  level: number;
  color: string;
  tags: string[];
  lat: number;
  lng: number;
}

// Flat path node type
export interface PathNode {
  id: number;
  externalId: number;
  nodeType: 'waypoint' | 'entrance' | 'exit' | 'elevator' | 'stairs';
  name: string;
  level: number;
  isActive: boolean;
  crossLevelConnections: number[];
  tags: string[];
  lat: number;
  lng: number;
}

// Flat path segment type
export interface PathSegment {
  id: number;
  startNodeId: number;
  endNodeId: number;
  isBidirectional: boolean;
  weight: number;
  level: number;
  coordinates: [number, number][];
}
