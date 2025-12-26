/**
 * WebSocket Module Exports
 *
 * This module exports all WebSocket-related classes, types, and utilities.
 */

// Classes
export { RtlsWebSocketClient, type ConnectOptions } from './client';
export { RtlsWebSocketSubscriber, type SubscriptionTypes } from './subscriber';
export { RtlsWebSocketPublisher } from './publisher';

// Base connection (for advanced use cases)
export { BaseWebSocketConnection, type BaseWebSocketEvents } from './connection';

// Event utilities
export { TypedEventEmitter, DebugLogger, type EventHandler, type EventMap } from './events';

// All types and utilities
export {
  // Constants
  WEBSOCKET_URLS,
  WEBSOCKET_DEFAULTS,
  POSITION_ORIGIN,
  WS_CLOSE_CODES,

  // Connection types
  type ConnectionState,
  type WebSocketAuthMethod,
  type WebSocketBaseConfig,
  type WebSocketSubscriberConfig,
  type WebSocketPublisherConfig,
  type WebSocketClientConfig,

  // Subscription types
  SubscriptionType,
  type SubscribeMessage,
  type SubscriptionConfirmation,

  // Message types
  type DeviceInfo,
  type PositionMessage,
  type PublishPositionData,
  type ZoneEventType,
  type ZoneGeometry,
  type ZoneProperties,
  type ZoneFeature,
  type ZoneEntryExitMessage,
  type ZoneStatsMessage,
  type AlertStyle,
  type AlertParams,
  type AlertMessage,
  type AssetAction,
  type AssetData,
  type AssetMessage,
  type WebSocketMessage,

  // Event types
  type ConnectionEventData,
  type DisconnectionEventData,
  type ErrorEventData,
  type ReconnectionEventData,
  type SubscriberEventMap,
  type PublisherEventMap,

  // Result types
  type SubscriptionResult,
  type PublishResult,
  type BatchPublishResult,
  type ConnectionStatus,
  type UnifiedConnectionStatus,

  // Error classes
  WebSocketError,
  WebSocketConnectionError,
  WebSocketAuthenticationError,
  WebSocketSubscriptionError,
  WebSocketSendError,

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

  // Reconnection utilities
  type ReconnectionStrategy,
  DEFAULT_RECONNECTION_STRATEGY,
  calculateReconnectDelay,

  // Test fixtures
  POSITION_MESSAGE_FIXTURE,
  ZONE_ENTRY_FIXTURE,
  ZONE_STATS_FIXTURE,
  ALERT_MESSAGE_FIXTURE,
  ASSET_UPDATE_FIXTURE,
  ASSET_DELETE_FIXTURE,
  SUBSCRIPTION_CONFIRMATION_STANDARD,
  SUBSCRIPTION_CONFIRMATION_ALT,
} from './types';
