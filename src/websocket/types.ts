/**
 * WebSocket configuration, constants, events, results and subscription types.
 *
 * The wire message types live in `messages.ts` and the error classes in `errors.ts`.
 *
 * @module websocket/types
 */
import type { WebSocketError } from './errors';
import type {
  AlertMessage,
  AlertRulesChangedMessage,
  AssetMessage,
  AssetsLibraryChangedMessage,
  DataModelsChangedMessage,
  MapDataChangedMessage,
  PositionMessage,
  SettingsChangedMessage,
  TagLostMessage,
  WebSocketMessage,
  ZoneEntryExitMessage,
  ZoneStatsMessage,
} from './messages';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Default broker URLs (production gateway). */
export const WEBSOCKET_URLS = {
  SUBSCRIBER: 'wss://rtls.ubudu.com/api/ws/subscriber',
  PUBLISHER: 'wss://rtls.ubudu.com/api/ws/publisher',
} as const;

/** Default configuration values. */
export const WEBSOCKET_DEFAULTS = {
  RECONNECT_INTERVAL_MS: 5000,
  MAX_RECONNECT_DELAY_MS: 30000,
  CONNECTION_TIMEOUT_MS: 10000,
  MAX_RECONNECT_ATTEMPTS: Infinity,
  KEEPALIVE_INTERVAL_MS: 30000,
  PONG_TIMEOUT_MS: 10000,
  SUBSCRIPTION_TIMEOUT_MS: 10000,
} as const;

/** WebSocket close codes the broker can produce (it defines no application codes). */
export const WS_CLOSE_CODES = {
  NORMAL_CLOSURE: 1000,
  GOING_AWAY: 1001,
  PROTOCOL_ERROR: 1002,
  NO_STATUS: 1005,
  ABNORMAL_CLOSURE: 1006,
} as const;

/** The five subscription filter values the broker recognises. */
export const SubscriptionType = {
  POSITIONS: 'POSITIONS',
  ZONES_ENTRIES_EVENTS: 'ZONES_ENTRIES_EVENTS',
  ZONE_STATS_EVENTS: 'ZONE_STATS_EVENTS',
  ALERTS: 'ALERTS',
  ASSETS: 'ASSETS',
} as const;

/** One of the five subscription filter values. */
export type SubscriptionType = (typeof SubscriptionType)[keyof typeof SubscriptionType];

/**
 * @deprecated The values never matched the platform's origin codes and the publisher no longer sends `origin` by
 * default.
 */
export const POSITION_ORIGIN = {
  GEOLOCATION: 1,
  INDOOR_SDK: 2,
  UWB: 3,
  EXTERNAL_API: 4,
} as const;

// ─── Configuration ────────────────────────────────────────────────────────────

/** A credential, or a provider evaluated on every connection attempt. */
export type WsCredential = string | (() => string | Promise<string>);

/** Handler property type, declared bivariant so that `ws`, the DOM global and plain classes are all assignable. */
type WsHandler<E> = { bivarianceHack(event: E): void }['bivarianceHack'];

/** The part of a WebSocket instance the SDK uses (DOM `WebSocket`, Node `ws`, Bun, or a custom class). */
export interface WebSocketLike {
  /** 0 CONNECTING, 1 OPEN, 2 CLOSING, 3 CLOSED. */
  readonly readyState: number;
  onopen: WsHandler<unknown> | null;
  onclose: WsHandler<{ code: number; reason: string; wasClean?: boolean }> | null;
  onerror: WsHandler<unknown> | null;
  onmessage: WsHandler<{ data: unknown }> | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  /** Node `ws`: protocol ping. */
  ping?(): void;
  /** Node `ws`: immediate close. */
  terminate?(): void;
  /** Node `ws`: pong listener. */
  on?(event: 'pong', listener: () => void): unknown;
}

/**
 * A WebSocket constructor. Header mode builds `new Impl(url, { headers })` (ws-like implementations only);
 * otherwise `new Impl(url)`. No `handshakeTimeout` is passed: `connectionTimeout` is the single timeout.
 */
export type WebSocketConstructorLike = new (
  url: string,
  protocols?: string | string[]
) => WebSocketLike;

/** Reconnection policy. */
export interface ReconnectOptions {
  /** Default 5000. */
  initialDelayMs?: number;
  /** Default 30000. */
  maxDelayMs?: number;
  /** Default 2. */
  multiplier?: number;
  /** Default `'full'`: delay = floor(random() × min(maxDelayMs, initialDelayMs × multiplier^n)). */
  jitter?: 'full' | 'none';
  /** Consecutive failed attempts before `reconnect_failed`; default Infinity. */
  maxAttempts?: number;
  /** Default false; true: a failing first `connect()` retries with the same policy. */
  retryInitialConnect?: boolean;
}

/** Configuration shared by the subscriber, the publisher and the unified client. */
export interface WebSocketBaseConfig {
  /** Required; one socket is bound to one namespace. */
  namespace: string;
  /** API key, evaluated on every attempt. */
  apiKey?: WsCredential;
  /** JWT (or API key) sent as a bearer token; wins over `apiKey`; evaluated on every attempt. */
  token?: WsCredential;
  /** Default `'query'`; `'header'` needs a ws-like implementation (Node `ws`). */
  authTransport?: 'query' | 'header';
  /** Injected implementation (tests, browsers, custom agents). */
  WebSocket?: WebSocketConstructorLike;
  /** Milliseconds from the start of an attempt to open; default 10000. */
  connectionTimeout?: number;
  /** Reconnection policy; default `{}`; `false` disables reconnection. */
  reconnect?: ReconnectOptions | false;
  /** Protocol ping interval; default 30000; 0 disables; effective only with `ping()` and `on('pong')`. */
  keepAliveIntervalMs?: number;
  /** Default 10000. */
  pongTimeoutMs?: number;
  /** Console logging; URLs and credentials are always redacted. */
  debug?: boolean;
  /** @deprecated use `reconnect.initialDelayMs` */
  reconnectInterval?: number;
  /** @deprecated use `reconnect.maxAttempts` */
  maxReconnectAttempts?: number;
}

/** Subscriber configuration. */
export interface WebSocketSubscriberConfig extends WebSocketBaseConfig {
  /** Default `WEBSOCKET_URLS.SUBSCRIBER`. */
  subscriberUrl?: string;
  /** Client-side filter on kinds that carry `map_uuid`; never sent. */
  mapUuid?: string;
  /** Default 10000. */
  subscriptionTimeoutMs?: number;
}

/** Publisher configuration. */
export interface WebSocketPublisherConfig extends WebSocketBaseConfig {
  /** Default `WEBSOCKET_URLS.PUBLISHER`. */
  publisherUrl?: string;
  /** Required, non-empty. */
  mapUuid: string;
}

/** Unified client configuration. */
export interface WebSocketClientConfig extends WebSocketBaseConfig {
  subscriberUrl?: string;
  publisherUrl?: string;
  /** Enables the publisher; not passed to the subscriber. */
  mapUuid?: string;
  subscriptionTimeoutMs?: number;
}

/** Options of `RtlsWebSocketClient.connect()`. */
export interface WebSocketConnectOptions {
  publisherOnly?: boolean;
  subscriberOnly?: boolean;
}

// ─── Subscriptions ────────────────────────────────────────────────────────────

/** One type or a list of types. */
export type SubscriptionTypes = SubscriptionType | SubscriptionType[];

/** Object form of a subscription request. */
export interface SubscriptionSpec {
  /** Absent → `'ALL'`. */
  types?: 'ALL' | readonly SubscriptionType[];
  /** Present: replaces the tag filter (`null` clears); absent: keeps the current filter. */
  uuids?: readonly string[] | null;
}

/** What `subscribe()` accepts. */
export type SubscriptionRequest =
  'ALL' | SubscriptionType | readonly SubscriptionType[] | SubscriptionSpec;

/** Result of a confirmed subscription: it echoes the request (the confirmation carries no detail). */
export interface SubscriptionResult {
  success: true;
  types: SubscriptionType[] | 'ALL';
  uuids: string[] | null;
}

/** The stored subscription state. */
export interface SubscriptionState {
  types: SubscriptionType[] | 'ALL';
  uuids: string[] | null;
  active: boolean;
}

/** The SUBSCRIBE frame. */
export interface SubscribeMessage {
  type: 'SUBSCRIBE';
  app_namespace: string;
  data_type_filter?: SubscriptionType[];
  uuids?: string[];
}

// ─── Publisher ────────────────────────────────────────────────────────────────

/** A position to publish over the WebSocket publisher. */
export interface WebSocketPublishPositionData {
  macAddress: string;
  latitude: number;
  longitude: number;
  /** Overrides the configured map. */
  mapUuid?: string;
  /** Overrides the configured namespace. */
  appNamespace?: string;
  /** Default now; sent as an ISO 8601 UTC string. */
  timestamp?: Date | number | string;
  /** Sent as `user_name`. */
  name?: string;
  model?: string;
  color?: string;
  origin?: number;
  data?: Record<string, unknown>;
  /** Other wire fields (snake_case), passed through. */
  extra?: Record<string, unknown>;
}

/** Result of `sendPosition()`. */
export interface PublishResult {
  success: boolean;
  error?: string;
}

/** Result of `sendBatch()`. */
export interface BatchPublishResult {
  success: boolean;
  sent: number;
  failed: number;
  errors?: string[];
}

// ─── Status and events ────────────────────────────────────────────────────────

/** Connection state. */
export type ConnectionState =
  'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'CLOSING' | 'RECONNECTING';

/** Connection status snapshot. */
export interface ConnectionStatus {
  state: ConnectionState;
  connectedAt?: Date;
  reconnectAttempts: number;
  lastMessageAt?: Date;
  lastPongAt?: Date;
}

/** Status of both sockets of the unified client. */
export interface UnifiedConnectionStatus {
  subscriber: ConnectionStatus;
  publisher: ConnectionStatus | null;
}

export interface ConnectionEventData {
  timestamp: Date;
}

export interface DisconnectionEventData {
  code: number;
  reason: string;
  timestamp: Date;
  willReconnect: boolean;
}

export interface ReconnectionEventData {
  /** 1-based. */
  attempt: number;
  delay: number;
  timestamp: Date;
}

export interface ReconnectedEventData {
  attempt: number;
  timestamp: Date;
}

export interface ReconnectFailedEventData {
  attempts: number;
  error: WebSocketError;
  timestamp: Date;
}

export interface ErrorEventData {
  error: WebSocketError;
  timestamp: Date;
}

/** Events shared by both sockets. @internal */
export interface WsConnectionEvents {
  connected: ConnectionEventData;
  disconnected: DisconnectionEventData;
  reconnecting: ReconnectionEventData;
  reconnected: ReconnectedEventData;
  reconnect_failed: ReconnectFailedEventData;
  error: ErrorEventData;
  message: WebSocketMessage;
}

/** Publisher events. */
export interface PublisherEventMap extends WsConnectionEvents {
  message: WebSocketMessage;
}

/** Subscriber events. */
export interface SubscriberEventMap extends WsConnectionEvents {
  POSITIONS: PositionMessage;
  ZONES_ENTRIES_EVENTS: ZoneEntryExitMessage;
  ZONE_STATS_EVENTS: ZoneStatsMessage;
  ALERTS: AlertMessage;
  ASSETS: AssetMessage;
  TAG_LOST: TagLostMessage;
  ALERT_RULES_CHANGED: AlertRulesChangedMessage;
  ASSETS_LIBRARY_CHANGED: AssetsLibraryChangedMessage;
  DATA_MODELS_CHANGED: DataModelsChangedMessage;
  SETTINGS_CHANGED: SettingsChangedMessage;
  MAP_DATA_CHANGED: MapDataChangedMessage;
  unknown: Record<string, unknown>;
}

/** Unified client events: the subscriber's under their names, the publisher lifecycle as `publisher:*`. */
export type UnifiedEventMap = SubscriberEventMap & {
  'publisher:connected': ConnectionEventData;
  'publisher:disconnected': DisconnectionEventData;
  'publisher:reconnecting': ReconnectionEventData;
  'publisher:reconnected': ReconnectedEventData;
  'publisher:reconnect_failed': ReconnectFailedEventData;
  'publisher:error': ErrorEventData;
};
