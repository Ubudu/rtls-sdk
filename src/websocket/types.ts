/**
 * WebSocket Types and Utilities
 *
 * This module contains all type definitions, constants, type guards,
 * and utility functions for the WebSocket client.
 */

// ============================================================================
// CONSTANTS
// ============================================================================

/** Default WebSocket URLs */
export const WEBSOCKET_URLS = {
  SUBSCRIBER: 'wss://rtls.ubudu.com/api/ws/subscriber',
  PUBLISHER: 'wss://rtls.ubudu.com/api/ws/publisher',
} as const;

/** Default configuration values */
export const WEBSOCKET_DEFAULTS = {
  RECONNECT_INTERVAL_MS: 5000,
  MAX_RECONNECT_DELAY_MS: 30000,
  CONNECTION_TIMEOUT_MS: 10000,
  MAX_RECONNECT_ATTEMPTS: Infinity,
} as const;

/** Position origin values */
export const POSITION_ORIGIN = {
  GEOLOCATION: 1,
  INDOOR_SDK: 2,
  UWB: 3,
  EXTERNAL_API: 4, // Use this for published positions
} as const;

/** WebSocket close codes */
export const WS_CLOSE_CODES = {
  NORMAL_CLOSURE: 1000,
  GOING_AWAY: 1001,
  PROTOCOL_ERROR: 1002,
  ABNORMAL_CLOSURE: 1006,
  NO_STATUS: 1005,
} as const;

// ============================================================================
// CONNECTION TYPES
// ============================================================================

/** WebSocket connection state */
export type ConnectionState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'CLOSING'
  | 'RECONNECTING';

/** Authentication method for WebSocket connection */
export type WebSocketAuthMethod = 'apiKey' | 'token';

/** Base configuration shared by all WebSocket clients */
export interface WebSocketBaseConfig {
  /** API key for authentication (sent as ?apiKey=) */
  apiKey?: string;
  /** JWT token for authentication (sent as ?token=) */
  token?: string;
  /** Application namespace (required for subscription) */
  namespace: string;
  /** Enable debug logging */
  debug?: boolean;
  /** Reconnection interval in ms (default: 5000) */
  reconnectInterval?: number;
  /** Maximum reconnection attempts (default: Infinity) */
  maxReconnectAttempts?: number;
  /** Connection timeout in ms (default: 10000) */
  connectionTimeout?: number;
}

/** Subscriber-specific configuration */
export interface WebSocketSubscriberConfig extends WebSocketBaseConfig {
  /** WebSocket URL for subscriber (default: wss://rtls.ubudu.com/api/ws/subscriber) */
  subscriberUrl?: string;
  /** Optional map UUID filter */
  mapUuid?: string;
}

/** Publisher-specific configuration */
export interface WebSocketPublisherConfig extends WebSocketBaseConfig {
  /** WebSocket URL for publisher (default: wss://rtls.ubudu.com/api/ws/publisher) */
  publisherUrl?: string;
  /** Map UUID (required for publishing) */
  mapUuid: string;
}

/** Unified client configuration */
export interface WebSocketClientConfig extends WebSocketBaseConfig {
  /** WebSocket URL for subscriber */
  subscriberUrl?: string;
  /** WebSocket URL for publisher */
  publisherUrl?: string;
  /** Map UUID (required for publishing) */
  mapUuid?: string;
}

// ============================================================================
// SUBSCRIPTION TYPES
// ============================================================================

/** Available subscription types matching server expectations */
export const SubscriptionType = {
  POSITIONS: 'POSITIONS',
  ZONES_ENTRIES_EVENTS: 'ZONES_ENTRIES_EVENTS',
  ZONE_STATS_EVENTS: 'ZONE_STATS_EVENTS',
  ALERTS: 'ALERTS',
  ASSETS: 'ASSETS',
} as const;

export type SubscriptionType = (typeof SubscriptionType)[keyof typeof SubscriptionType];

/** Message sent to server to subscribe */
export interface SubscribeMessage {
  type: 'SUBSCRIBE';
  app_namespace: string;
  map_uuid?: string;
  data_type_filter?: SubscriptionType[];
}

/** Server confirmation of subscription */
export interface SubscriptionConfirmation {
  type?: 'SUBSCRIPTION_CONFIRMATION';
  types?: SubscriptionType[];
  action?: 'subscribeEvent';
  app_namespace?: string;
}

// ============================================================================
// POSITION MESSAGE TYPES
// ============================================================================

/** Device info included in position messages */
export interface DeviceInfo {
  model?: string;
  system_build_number?: string;
  system_name?: string;
  system_version?: string;
}

/** Position message from server */
export interface PositionMessage {
  /** Application namespace */
  app_namespace: string;
  /** Latitude coordinate */
  lat: number;
  /** Longitude coordinate */
  lon: number;
  /** Device identifier (MAC address without colons) */
  user_uuid?: string;
  /** Alternative device identifier */
  user_udid?: string;
  /** User-friendly name */
  user_name?: string;
  /** Device type (e.g., 'tag') */
  user_type?: string;
  /** Device model */
  model?: string;
  /** Map UUID */
  map_uuid?: string;
  /** Timestamp (ISO string or Unix ms) */
  timestamp?: string | number;
  /** Visual color for the tag */
  color?: string;
  /** Origin type (4 = external system) */
  origin?: number;
  /** Device information */
  device_info?: DeviceInfo;
  /** Custom data object */
  data?: Record<string, unknown>;
  /** Message type (if present) */
  type?: 'POSITIONS' | string;
}

/** Position data for publishing */
export interface PublishPositionData {
  /** MAC address of the tag (with or without colons) */
  macAddress: string;
  /** Latitude coordinate */
  latitude: number;
  /** Longitude coordinate */
  longitude: number;
  /** Optional: Tag model name */
  model?: string;
  /** Optional: User-friendly name */
  name?: string;
  /** Optional: Hex color code (e.g., '#FF0000') */
  color?: string;
  /** Optional: Override app namespace */
  appNamespace?: string;
  /** Optional: Override map UUID */
  mapUuid?: string;
  /** Optional: Additional custom data */
  data?: Record<string, unknown>;
}

// ============================================================================
// ZONE EVENT TYPES
// ============================================================================

/** Zone event types */
export type ZoneEventType =
  | 'ENTER_ZONE'
  | 'EXIT_ZONE'
  | 'ENTER'
  | 'EXIT'
  | 'ZONE_ENTRY'
  | 'ZONE_EXIT';

/** Zone geometry (GeoJSON) */
export interface ZoneGeometry {
  type: 'Polygon';
  coordinates: number[][][];
}

/** Zone properties */
export interface ZoneProperties {
  id: number;
  name: string;
  level?: number;
  rgb_color?: string;
  tags?: string[];
  type?: string;
}

/** Zone feature (GeoJSON) */
export interface ZoneFeature {
  type: 'Feature';
  geometry: ZoneGeometry;
  properties: ZoneProperties;
}

/** Zone entry/exit event message */
export interface ZoneEntryExitMessage {
  app_namespace: string;
  map_uuid?: string;
  event_type: ZoneEventType;
  zone?: ZoneFeature | string;
  user_uuid?: string;
  user_udid?: string;
  user_name?: string;
  user_type?: string;
  timestamp?: string | number;
  action?: string;
  data?: Record<string, unknown>;
  type?: 'ZONES_ENTRIES_EVENTS' | string;
}

/** Zone statistics event message */
export interface ZoneStatsMessage {
  app_namespace: string;
  event_type: 'UPDATE_ZONE_COUNTER';
  zone_id?: number;
  zone_name?: string;
  total_count?: number;
  tag_count?: number;
  mobile_count?: number;
  avg_time_seconds?: number;
  timestamp?: string | number;
  type?: 'ZONE_STATS_EVENTS' | string;
}

// ============================================================================
// ALERT/NOTIFICATION TYPES
// ============================================================================

/** Alert notification style */
export type AlertStyle = 'info' | 'warning' | 'error';

/** Alert parameters */
export interface AlertParams {
  /** Alert display style */
  style?: AlertStyle;
  /** Alert title */
  title?: string;
  /** Alert message text */
  text?: string;
  /** Display duration in ms */
  duration?: number;
  /** Minimum seconds between similar alerts */
  coalescence?: number;
  /** Grouping identifier */
  coalescence_group?: string;
  /** Icon to display */
  icon?: string;
  /** Play sound */
  sound?: boolean;
  /** Vibrate device */
  vibration?: boolean;
  /** Priority level */
  priority?: 'low' | 'normal' | 'high';
  /** URL to open on click */
  action_url?: string;
}

/** Alert/notification message */
export interface AlertMessage {
  app_namespace: string;
  map_uuid?: string;
  event_type: 'NOTIFICATION';
  action?: 'notifyEvent';
  user_uuid?: string;
  user_udid?: string;
  user_type?: string;
  zone?: ZoneFeature;
  params: AlertParams;
  timestamp?: string | number;
  type?: 'ALERTS' | 'NOTIFICATION' | string;
  alert_type?: string;
}

// ============================================================================
// ASSET TYPES
// ============================================================================

/** Asset action type */
export type AssetAction = 'update' | 'create' | 'delete';

/** Asset data */
export interface AssetData {
  color?: string;
  createdBy?: string;
  dateChanged?: number;
  dateCreated?: number;
  external_id?: string;
  model?: string;
  path?: string;
  data?: Record<string, unknown>;
  user_motion?: 'moving' | 'stationary' | string;
  user_name?: string;
  user_type?: string;
  user_udid?: string;
  user_uuid?: string;
}

/** Asset message */
export interface AssetMessage {
  action: AssetAction;
  app_namespace: string;
  mac_address: string;
  type: 'assets';
  data?: AssetData;
}

// ============================================================================
// UNIFIED MESSAGE TYPE
// ============================================================================

/** Any message that can be received from the server */
export type WebSocketMessage =
  | PositionMessage
  | ZoneEntryExitMessage
  | ZoneStatsMessage
  | AlertMessage
  | AssetMessage
  | SubscriptionConfirmation
  | Record<string, unknown>;

// ============================================================================
// EVENT TYPES
// ============================================================================

/** Connection event data */
export interface ConnectionEventData {
  timestamp: Date;
}

/** Disconnection event data */
export interface DisconnectionEventData {
  code: number;
  reason: string;
  timestamp: Date;
}

/** Error event data */
export interface ErrorEventData {
  error: Error;
  timestamp: Date;
}

/** Reconnection event data */
export interface ReconnectionEventData {
  attempt: number;
  delay: number;
  timestamp: Date;
}

/** Subscriber event map for type-safe event handling */
export interface SubscriberEventMap {
  connected: ConnectionEventData;
  disconnected: DisconnectionEventData;
  reconnecting: ReconnectionEventData;
  error: ErrorEventData;
  message: WebSocketMessage;
  POSITIONS: PositionMessage;
  ZONES_ENTRIES_EVENTS: ZoneEntryExitMessage;
  ZONE_STATS_EVENTS: ZoneStatsMessage;
  ALERTS: AlertMessage;
  ASSETS: AssetMessage;
}

/** Publisher event map */
export interface PublisherEventMap {
  connected: ConnectionEventData;
  disconnected: DisconnectionEventData;
  reconnecting: ReconnectionEventData;
  error: ErrorEventData;
  message: WebSocketMessage;
}

// ============================================================================
// RESULT TYPES
// ============================================================================

/** Result of subscription call */
export interface SubscriptionResult {
  success: boolean;
  types: SubscriptionType[] | 'ALL';
}

/** Result of publish call */
export interface PublishResult {
  success: boolean;
  error?: string;
}

/** Result of batch publish call */
export interface BatchPublishResult {
  success: boolean;
  sent: number;
  failed: number;
  errors?: string[];
}

/** Connection status result */
export interface ConnectionStatus {
  state: ConnectionState;
  connectedAt?: Date;
  reconnectAttempts: number;
}

/** Unified connection status for combined client */
export interface UnifiedConnectionStatus {
  subscriber: ConnectionStatus;
  publisher: ConnectionStatus | null;
}

// ============================================================================
// ERROR CLASSES
// ============================================================================

/** Base WebSocket error */
export class WebSocketError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly reason?: string
  ) {
    super(message);
    this.name = 'WebSocketError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, WebSocketError);
    }
  }
}

/** Connection failed (timeout, network error) */
export class WebSocketConnectionError extends WebSocketError {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'WebSocketConnectionError';
  }
}

/** Authentication failed (401, 403) */
export class WebSocketAuthenticationError extends WebSocketError {
  constructor(
    message: string = 'WebSocket authentication failed',
    code?: number
  ) {
    super(message, code);
    this.name = 'WebSocketAuthenticationError';
  }
}

/** Subscription failed */
export class WebSocketSubscriptionError extends WebSocketError {
  constructor(
    message: string,
    public readonly subscriptionTypes?: SubscriptionType[]
  ) {
    super(message);
    this.name = 'WebSocketSubscriptionError';
  }
}

/** Message send failed */
export class WebSocketSendError extends WebSocketError {
  constructor(
    message: string,
    public readonly payload?: unknown
  ) {
    super(message);
    this.name = 'WebSocketSendError';
  }
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

/** Check if message is a position message */
export function isPositionMessage(msg: WebSocketMessage): msg is PositionMessage {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;

  // Has explicit type field
  if (m.type === 'POSITIONS') return true;

  // Infer from content: has lat/lon and user identifier
  return (
    typeof m.lat === 'number' &&
    typeof m.lon === 'number' &&
    (typeof m.user_uuid === 'string' || typeof m.user_udid === 'string')
  );
}

/** Check if message is a zone entry/exit event */
export function isZoneEntryExitMessage(msg: WebSocketMessage): msg is ZoneEntryExitMessage {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;

  if (m.type === 'ZONES_ENTRIES_EVENTS') return true;

  const zoneEvents: string[] = [
    'ENTER_ZONE', 'EXIT_ZONE', 'ENTER', 'EXIT', 'ZONE_ENTRY', 'ZONE_EXIT'
  ];
  return typeof m.event_type === 'string' && zoneEvents.includes(m.event_type);
}

/** Check if message is a zone stats event */
export function isZoneStatsMessage(msg: WebSocketMessage): msg is ZoneStatsMessage {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;

  return m.type === 'ZONE_STATS_EVENTS' || m.event_type === 'UPDATE_ZONE_COUNTER';
}

/** Check if message is an alert/notification */
export function isAlertMessage(msg: WebSocketMessage): msg is AlertMessage {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;

  // Explicit type or NOTIFICATION event_type
  if (m.type === 'ALERTS' || m.type === 'NOTIFICATION') return true;
  if (m.event_type === 'NOTIFICATION') return true;

  // Has alert_type field
  if (typeof m.alert_type === 'string') return true;

  // event_type contains ALERT
  return typeof m.event_type === 'string' && m.event_type.includes('ALERT');
}

/** Check if message is an asset event */
export function isAssetMessage(msg: WebSocketMessage): msg is AssetMessage {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;

  if (m.type === 'assets') return true;
  if (typeof m.asset_id === 'string') return true;

  return typeof m.event_type === 'string' && m.event_type.includes('ASSET');
}

/** Check if message is a subscription confirmation */
export function isSubscriptionConfirmation(msg: WebSocketMessage): msg is SubscriptionConfirmation {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;

  return m.type === 'SUBSCRIPTION_CONFIRMATION' || m.action === 'subscribeEvent';
}

/** Classify a message and return its type */
export function classifyMessage(msg: WebSocketMessage): SubscriptionType | 'UNKNOWN' | 'CONFIRMATION' {
  if (isSubscriptionConfirmation(msg)) return 'CONFIRMATION';
  if (isPositionMessage(msg)) return SubscriptionType.POSITIONS;
  if (isZoneEntryExitMessage(msg)) return SubscriptionType.ZONES_ENTRIES_EVENTS;
  if (isZoneStatsMessage(msg)) return SubscriptionType.ZONE_STATS_EVENTS;
  if (isAlertMessage(msg)) return SubscriptionType.ALERTS;
  if (isAssetMessage(msg)) return SubscriptionType.ASSETS;
  return 'UNKNOWN';
}

// ============================================================================
// MAC ADDRESS UTILITIES
// ============================================================================

/**
 * Normalize a MAC address to lowercase without separators.
 * Handles various input formats:
 * - 'AA:BB:CC:DD:EE:FF' -> 'aabbccddeeff'
 * - 'aa:bb:cc:dd:ee:ff' -> 'aabbccddeeff'
 * - 'AA-BB-CC-DD-EE-FF' -> 'aabbccddeeff'
 * - 'AABBCCDDEEFF'      -> 'aabbccddeeff'
 * - 'aabbccddeeff'      -> 'aabbccddeeff'
 *
 * @param mac - MAC address in any common format
 * @returns Normalized 12-character lowercase hex string
 * @throws Error if input is not a valid MAC address
 */
export function normalizeMacAddress(mac: string): string {
  // Remove all separators (colons, dashes, dots)
  const cleaned = mac.replace(/[:\-.]/g, '');

  // Validate: must be exactly 12 hex characters
  if (!/^[a-fA-F0-9]{12}$/.test(cleaned)) {
    throw new Error(`Invalid MAC address: "${mac}". Expected 12 hex characters.`);
  }

  return cleaned.toLowerCase();
}

/**
 * Check if a string is a valid MAC address (any format).
 */
export function isValidMacAddress(mac: string): boolean {
  try {
    normalizeMacAddress(mac);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// RECONNECTION STRATEGY TYPES
// ============================================================================

/** Reconnection strategy options */
export interface ReconnectionStrategy {
  /** Base interval in milliseconds */
  baseInterval: number;
  /** Maximum delay in milliseconds */
  maxDelay: number;
  /** Multiplier for exponential backoff */
  multiplier: number;
  /** Maximum number of attempts (Infinity for unlimited) */
  maxAttempts: number;
}

/** Default reconnection strategy */
export const DEFAULT_RECONNECTION_STRATEGY: ReconnectionStrategy = {
  baseInterval: WEBSOCKET_DEFAULTS.RECONNECT_INTERVAL_MS,
  maxDelay: WEBSOCKET_DEFAULTS.MAX_RECONNECT_DELAY_MS,
  multiplier: 2,
  maxAttempts: WEBSOCKET_DEFAULTS.MAX_RECONNECT_ATTEMPTS,
};

/**
 * Calculate reconnection delay using exponential backoff.
 *
 * @param attempt - Current attempt number (0-indexed)
 * @param strategy - Reconnection strategy options
 * @returns Delay in milliseconds
 */
export function calculateReconnectDelay(
  attempt: number,
  strategy: ReconnectionStrategy = DEFAULT_RECONNECTION_STRATEGY
): number {
  const delay = strategy.baseInterval * Math.pow(strategy.multiplier, attempt);
  return Math.min(delay, strategy.maxDelay);
}

// ============================================================================
// TEST FIXTURES
// ============================================================================

/** Position message fixture for testing */
export const POSITION_MESSAGE_FIXTURE: PositionMessage = {
  app_namespace: 'test_namespace',
  lat: 48.8584,
  lon: 2.2945,
  user_uuid: 'aabbccddeeff',
  user_udid: 'aabbccddeeff',
  user_name: 'Test-Asset-001',
  user_type: 'tag',
  model: 'GenericTag',
  map_uuid: 'test-map-uuid',
  timestamp: 1673345678901,
  color: '#FF0000',
  origin: 4,
  data: {
    battery: 95,
    status: 'active'
  }
};

/** Zone entry event fixture for testing */
export const ZONE_ENTRY_FIXTURE: ZoneEntryExitMessage = {
  app_namespace: 'test_namespace',
  map_uuid: 'test-map-uuid',
  event_type: 'ENTER_ZONE',
  zone: {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[[2.3795, 48.6187], [2.3796, 48.6187], [2.3796, 48.6188], [2.3795, 48.6188], [2.3795, 48.6187]]]
    },
    properties: {
      id: 12345,
      name: 'Warehouse-A',
      level: 0,
      rgb_color: '#2eff9d',
      tags: ['storage', 'restricted'],
      type: 'map_zone'
    }
  },
  user_uuid: 'aabbccddeeff',
  user_udid: 'aabbccddeeff',
  user_name: 'Forklift-01',
  user_type: 'tag',
  timestamp: 1673345678901
};

/** Zone stats event fixture for testing */
export const ZONE_STATS_FIXTURE: ZoneStatsMessage = {
  app_namespace: 'test_namespace',
  event_type: 'UPDATE_ZONE_COUNTER',
  zone_id: 12345,
  zone_name: 'Warehouse-A',
  total_count: 15,
  tag_count: 12,
  mobile_count: 3,
  avg_time_seconds: 3600,
  timestamp: 1673345678901
};

/** Alert message fixture for testing */
export const ALERT_MESSAGE_FIXTURE: AlertMessage = {
  app_namespace: 'test_namespace',
  map_uuid: 'test-map-uuid',
  event_type: 'NOTIFICATION',
  action: 'notifyEvent',
  user_uuid: 'aabbccddeeff',
  user_udid: 'aabbccddeeff',
  user_type: 'tag',
  zone: {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[[2.3795, 48.6187], [2.3796, 48.6187], [2.3796, 48.6188], [2.3795, 48.6188], [2.3795, 48.6187]]]
    },
    properties: {
      id: 12345,
      name: 'Storage_Zone',
      level: 0,
      rgb_color: '#2eff9d',
      tags: [],
      type: 'map_zone'
    }
  },
  params: {
    style: 'warning',
    title: 'Zone Presence Alert',
    text: 'Tag is present in Storage_Zone for over 1 minute',
    duration: 5000,
    coalescence: 60,
    coalescence_group: 'aabbccddeeff_12345_zone_presence',
    icon: 'alert-circle',
    sound: true,
    vibration: true,
    priority: 'high'
  },
  timestamp: 1673345678901
};

/** Asset update fixture for testing */
export const ASSET_UPDATE_FIXTURE: AssetMessage = {
  action: 'update',
  app_namespace: 'test_namespace',
  mac_address: 'aabbccddeeff',
  type: 'assets',
  data: {
    color: '#f500f5',
    createdBy: 'test_namespace',
    dateChanged: 1673345678901,
    dateCreated: 1673345600000,
    external_id: 'asset_tag_123',
    model: 'asset_model',
    path: '/Area/Location/',
    data: {
      client: 'client_company',
      reference: 'REF-123',
      status: 'OK',
      location: 'Building A'
    },
    user_motion: 'moving',
    user_name: 'Asset-1234',
    user_type: 'tag',
    user_udid: 'aabbccddeeff',
    user_uuid: 'aabbccddeeff'
  }
};

/** Asset delete fixture for testing */
export const ASSET_DELETE_FIXTURE: AssetMessage = {
  action: 'delete',
  app_namespace: 'test_namespace',
  mac_address: 'aabbccddeeff',
  type: 'assets'
};

/** Subscription confirmation fixture (standard format) */
export const SUBSCRIPTION_CONFIRMATION_STANDARD: SubscriptionConfirmation = {
  type: 'SUBSCRIPTION_CONFIRMATION',
  types: ['POSITIONS', 'ALERTS'] as SubscriptionType[],
  app_namespace: 'test_namespace'
};

/** Subscription confirmation fixture (alternative format) */
export const SUBSCRIPTION_CONFIRMATION_ALT: SubscriptionConfirmation = {
  action: 'subscribeEvent',
  app_namespace: 'test_namespace'
};
