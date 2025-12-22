// Main client
export {
  RtlsClient,
  createRtlsClient,
  type RtlsClientOptions,
  type RequestOptions,
} from './client';

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
  POI,
  PathNode,
  PathSegment,
  Venue,
  MapData,
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
  // GeoJSON types
  GeoJSONPoint,
  GeoJSONPolygon,
  GeoJSONLineString,
  GeoJSONGeometry,
  GeoJSONFeature,
  GeoJSONFeatureCollection,
  ZoneProperties,
  ZoneFeature,
  ZoneFeatureCollection,
  POIProperties,
  POIFeature,
  POIFeatureCollection,
  PathNodeProperties,
  PathNodeFeature,
  PathSegmentProperties,
  PathSegmentFeature,
  PathFeature,
  PathFeatureCollection,
  // Spatial response types
  SpatialReferencePoint,
  ZonesContainingPointResult,
  NearestZonesResult,
  ZonesWithinRadiusResult,
  NearestPoisResult,
  PoisWithinRadiusResult,
  ZoneWithDistance,
  POIWithDistance,
  AnalyzeCustomZonesRequest,
  AnalyzeCustomPoisRequest,
} from './types';

// Utility exports
export {
  paginate,
  collectAll,
  buildQueryParams,
  filter,
  filters,
  combineFilters,
  normalizeListResponse,
  isArrayResponse,
  extractDataArray,
  extractZonesFromGeoJSON,
  extractPoisFromGeoJSON,
  extractPathNodesFromGeoJSON,
  extractPathSegmentsFromGeoJSON,
} from './utils';

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
