/**
 * WebSocket module exports. The root re-exports this barrel (`export * from './websocket'`).
 *
 * @module websocket
 */
import { isValidMac, normalizeMac } from '../utils/mac';

// Classes
export { RtlsWebSocketClient } from './client';
export { RtlsWebSocketSubscriber } from './subscriber';
export { RtlsWebSocketPublisher } from './publisher';

// Constants
export {
  WEBSOCKET_URLS,
  WEBSOCKET_DEFAULTS,
  WS_CLOSE_CODES,
  SubscriptionType,
  POSITION_ORIGIN,
} from './types';

// Configuration (6.1)
export type {
  WsCredential,
  WebSocketLike,
  WebSocketConstructorLike,
  ReconnectOptions,
  WebSocketBaseConfig,
  WebSocketSubscriberConfig,
  WebSocketPublisherConfig,
  WebSocketClientConfig,
} from './types';

// Subscriber (6.3)
export type {
  SubscriptionTypes,
  SubscriptionSpec,
  SubscriptionRequest,
  SubscriptionResult,
  SubscriptionState,
  SubscribeMessage,
} from './types';

// Publisher (6.4): the input type under both names
export type {
  WebSocketPublishPositionData,
  WebSocketPublishPositionData as PublishPositionData,
  PublishResult,
  BatchPublishResult,
} from './types';

// Unified client (6.5)
export type { WebSocketConnectOptions, UnifiedEventMap } from './types';

// Events and status (6.6)
export type {
  ConnectionEventData,
  DisconnectionEventData,
  ReconnectionEventData,
  ReconnectedEventData,
  ReconnectFailedEventData,
  ErrorEventData,
  PublisherEventMap,
  SubscriberEventMap,
  ConnectionState,
  ConnectionStatus,
  UnifiedConnectionStatus,
} from './types';

// Wire messages (5.3, 6.6)
export {
  classifyMessage,
  isPositionMessage,
  isZoneEntryExitMessage,
  isZoneStatsMessage,
  isAlertMessage,
  isAssetMessage,
  isSubscriptionConfirmation,
} from './messages';
export type {
  WsPositionZone,
  WsZoneStub,
  WsZoneFeature,
  WsDeviceInfo,
  WsAssetFields,
  WsAssetData,
  WsAlertParams,
  PositionMessage,
  ZoneEntryExitMessage,
  ZoneStatsMessage,
  AlertMessage,
  TagLostMessage,
  AssetMessage,
  AlertRulesChangedMessage,
  AssetsLibraryChangedMessage,
  DataModelsChangedMessage,
  SettingsChangedMessage,
  MapDataChangedMessage,
  SubscriptionConfirmation,
  WebSocketMessage,
  WebSocketMessageKind,
} from './messages';

// Errors (6.6)
export type { WebSocketErrorInit } from './errors';
export {
  WebSocketError,
  WebSocketConnectionError,
  WebSocketAuthenticationError,
  WebSocketSubscriptionError,
  WebSocketSendError,
} from './errors';

/** @deprecated since 0.3.0 — use `normalizeMac` (throws `ValidationError` for an invalid MAC). */
export const normalizeMacAddress: (mac: string) => string = normalizeMac;

/** @deprecated since 0.3.0 — use `isValidMac`. */
export const isValidMacAddress: (mac: unknown) => boolean = isValidMac;
