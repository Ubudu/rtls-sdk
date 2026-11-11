// Public surface of ubudu-rtls-sdk. Domain modules reach the root through the `export *` of the types,
// resources and websocket barrels; the explicit disambiguations at the end resolve the names two of them share.

import type { Transport as TransportClass } from './client';

// Main client
export { RtlsClient, createRtlsClient } from './client';
/**
 * The type of `client.transport`, for resource authors. A type only: the class is not a runtime export.
 * An alias, because the declaration bundle emits `export type { Transport }` of a class as a value export.
 *
 * @internal Like the class it names.
 */
export type Transport = TransportClass;
export type {
  RtlsClientOptions,
  RequestOptions,
  RetryPolicy,
  AuthMode,
  HttpMethod,
  TransportOptions,
  TransportResponse,
  DownloadResult,
  ParseAs,
} from './client';

// Error classes (createError included; the internal body parser is not exported by errors.ts)
export * from './errors';

// Context types and utilities
export type {
  RtlsContext,
  CallContext,
  ResolvedNamespaceContext,
  ResolvedVenueContext,
  ResolvedMapContext,
} from './context';
export { resolveContext, requireNamespace, requireVenueId, requireMapId } from './context';

// Core and domain types
export * from './types';

// Utilities (public names only)
export {
  paginate,
  collectAll,
  paginatePages,
  paginateOffset,
  normalizePage,
  buildQueryParams,
  filter,
  filters,
  combineFilters,
  serializeFilters,
  applyFilters,
  normalizeListResponse,
  isArrayResponse,
  extractDataArray,
  extractZonesFromGeoJSON,
  extractPoisFromGeoJSON,
  extractPathNodesFromGeoJSON,
  extractPathSegmentsFromGeoJSON,
  normalizeMac,
  formatMac,
  isValidMac,
  toEpochMs,
} from './utils';
export type { SseEvent, UploadFile, TimeInput, FilterGrammar, QueryValue } from './utils';

// Resources
export * from './resources';

// WebSocket
export * from './websocket';

// Names shared by two star exports (TS2308 otherwise), each with its 0.2.0 root meaning: the REST publish payload,
// the GeoJSON zone types. The WebSocket publish payload stays reachable under its 0.2.0 alias.
export type { PublishPositionData } from './resources';
export type { ZoneProperties, ZoneFeature } from './types';
export type { PublishPositionData as WebSocketPublishPositionData } from './websocket';
