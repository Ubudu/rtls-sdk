// Main client
export { RtlsClient, createRtlsClient, type RtlsClientOptions, type RequestOptions } from './client';

// Error classes
export {
  RtlsError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  TimeoutError,
  NetworkError,
  createError,
} from './errors';

// Type exports
export type {
  Asset,
  AssetPosition,
  CachedAssetPosition,
  Zone,
  Venue,
  MapData,
  POI,
  Dashboard,
  AlertRule,
  NavigationResponse,
  HealthStatus,
  BatchSaveResult,
  BatchDeleteResult,
  PaginatedResponse,
  QueryOptions,
  FilterOptions,
  FilterOperator,
} from './types';

// Utility exports
export { paginate, collectAll, buildQueryParams, filter, filters, combineFilters } from './utils';

// Resource exports
export {
  AssetsResource,
  PositionsResource,
  ZonesResource,
  VenuesResource,
  AlertsResource,
  DashboardsResource,
  NavigationResource,
  SpatialResource,
} from './resources';

// Resource type exports
export type {
  ListAssetsOptions,
  ListPositionsOptions,
  PositionHistoryOptions,
  PublishPositionData,
  ListZonesOptions,
  ZonePresenceOptions,
  ListVenuesOptions,
  GetAlertsOptions,
  CreateDashboardData,
  UpdateDashboardData,
  SharePermissions,
  ShortestPathRequest,
  AccessiblePathRequest,
  MultiStopRequest,
  SpatialQueryOptions,
  RadiusQueryOptions,
} from './resources';
