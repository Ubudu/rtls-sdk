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

// Context types and utilities
export type {
  RtlsContext,
  CallContext,
  ResolvedNamespaceContext,
  ResolvedVenueContext,
  ResolvedMapContext,
} from './context';
export {
  resolveContext,
  requireNamespace,
  requireVenueId,
  requireMapId,
  ContextError,
} from './context';

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

// ─── WebSocket Exports ──────────────────────────────────────────────────────

// WebSocket client classes
export {
  RtlsWebSocketClient,
  RtlsWebSocketSubscriber,
  RtlsWebSocketPublisher,
} from './websocket';

// WebSocket types and utilities
export {
  // Subscription type enum/const
  SubscriptionType,

  // Type guards
  isPositionMessage,
  isZoneEntryExitMessage,
  isZoneStatsMessage,
  isAlertMessage,
  isAssetMessage,
  isSubscriptionConfirmation,
  classifyMessage,

  // MAC address utilities
  normalizeMacAddress,
  isValidMacAddress,

  // Error classes
  WebSocketError,
  WebSocketConnectionError,
  WebSocketAuthenticationError,
  WebSocketSubscriptionError,
  WebSocketSendError,

  // Constants
  WEBSOCKET_URLS,
  WEBSOCKET_DEFAULTS,
  POSITION_ORIGIN,
} from './websocket';

// WebSocket type exports
export type {
  // Configuration types
  WebSocketClientConfig,
  WebSocketSubscriberConfig,
  WebSocketPublisherConfig,
  WebSocketBaseConfig,

  // Event maps
  SubscriberEventMap,
  PublisherEventMap,

  // Message types
  PositionMessage,
  ZoneEntryExitMessage,
  ZoneStatsMessage,
  AlertMessage,
  AssetMessage,
  WebSocketMessage,

  // Publishing types
  PublishPositionData as WebSocketPublishPositionData,
  PublishResult,
  BatchPublishResult,

  // Subscription types
  SubscriptionResult,
  SubscribeMessage,
  SubscriptionConfirmation,

  // Connection types
  ConnectionState,
  ConnectionStatus,
  UnifiedConnectionStatus,
  ConnectionEventData,
  DisconnectionEventData,
  ErrorEventData,
  ReconnectionEventData,
} from './websocket';
