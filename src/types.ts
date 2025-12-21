import type { components, paths, operations } from './generated/schema';

// Core data types - using index signature for flexibility with generated types
export type Asset = components['schemas'] extends { Asset: infer T } ? T : Record<string, unknown>;
export type AssetPosition = components['schemas'] extends { AssetPosition: infer T }
  ? T
  : Record<string, unknown>;
export type CachedAssetPosition = components['schemas'] extends { CachedAssetPosition: infer T }
  ? T
  : Record<string, unknown>;
export type Zone = components['schemas'] extends { Zone: infer T } ? T : Record<string, unknown>;
export type Venue = components['schemas'] extends { Venue: infer T } ? T : Record<string, unknown>;
export type MapData = components['schemas'] extends { Map: infer T } ? T : Record<string, unknown>;
export type POI = components['schemas'] extends { POI: infer T } ? T : Record<string, unknown>;
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
