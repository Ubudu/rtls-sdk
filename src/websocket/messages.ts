/**
 * Server → client message shapes with their real wire field names, the table-driven classifier and
 * the type guards.
 *
 * @module websocket/messages
 */
import type { SubscriptionType } from './types';

// ─── Shared fragments ─────────────────────────────────────────────────────────

/** The zone stamped on a position; id 0 / `OUTSIDE_ALL_ZONES` = outside every zone. */
export interface WsPositionZone {
  id: number;
  name: string;
  tags: string[];
  color: string | null;
}

/** A zone reduced to its id (synthetic exits, counters). */
export interface WsZoneStub {
  properties: { id: number };
}

/** A full zone GeoJSON Feature. */
export interface WsZoneFeature {
  type: 'Feature';
  geometry: { type: string; coordinates: unknown };
  properties: {
    id: number;
    name?: string;
    level?: number;
    rgb_color?: string;
    tags?: string[];
    type?: string;
    [k: string]: unknown;
  };
}

/** Device information a source may publish. */
export interface WsDeviceInfo {
  model?: string;
  system_api_id?: string;
  system_build_number?: string;
  system_name?: string;
  system_version?: string;
}

/** Named stored-asset fields (no index signature, so `extends` keeps them). */
export interface WsAssetFields {
  user_name?: string;
  user_type?: string;
  user_motion?: string;
  model?: string;
  color?: string;
  path?: string;
  tags?: string[];
  external_id?: string | null;
  data?: Record<string, unknown>;
  targetApplications?: unknown;
  battery_percent?: number;
  declared_location?: Record<string, unknown> | null;
  is_virtual?: boolean;
  createdBy?: string;
  dateCreated?: number;
  dateChanged?: number;
}

/** A stored asset record (the `data` of an asset message). */
export interface WsAssetData extends WsAssetFields {
  user_udid?: string;
  [key: string]: unknown;
}

// ─── Message kinds ────────────────────────────────────────────────────────────

/** M1: a processed position, the source frame merged over the stored asset. */
export interface PositionMessage extends WsAssetFields {
  app_namespace: string;
  /** Always present on delivered positions. */
  user_uuid: string;
  /** Defaulted to `user_uuid` by the broker. */
  user_udid: string;
  lat: number;
  lon: number;
  map_uuid: string;
  /** As sent; an ISO string is added when the source sent none. */
  timestamp: string | number;
  zone: WsPositionZone;
  /** The platform sets 0 when the source sent none. */
  origin?: number;
  origin_detail?: string;
  level?: number;
  /** m/s; null when the time delta is ≤ 0. */
  speed?: number | null;
  /** Metres. */
  prev_pos_distance?: number;
  prev_pos_time_diff_seconds?: number;
  device_info?: WsDeviceInfo;
  il_sdk_ver?: string;
  /** Any other field the source published. */
  [key: string]: unknown;
}

/** M2: zone enter or exit. The tag is `user_udid`; there is no `user_uuid` on this kind. */
export interface ZoneEntryExitMessage {
  action: 'notifyEvent';
  event_type: 'ENTER_ZONE' | 'EXIT_ZONE';
  app_namespace: string;
  map_uuid?: string;
  user_udid: string;
  /** `null` = the outside-all-zones pseudo-zone; a stub on synthetic exits. */
  zone: WsZoneFeature | WsZoneStub | null;
  timestamp?: string | number;
  user_name?: string;
  external_id?: string | null;
  tags?: string[];
  data?: Record<string, unknown>;
  path?: string | null;
  model?: string | null;
  color?: string | null;
  visit_id?: string | null;
  /** ISO string on the live wire (LT-R3); a number is accepted too. */
  start_ts?: string | number | null;
  /** ISO string on the live wire; `null` on ENTER_ZONE. */
  exit_ts?: string | number | null;
}

/** M3: zone counter update. Times are in seconds. */
export interface ZoneStatsMessage {
  action: 'notifyEvent';
  event_type: 'UPDATE_ZONE_COUNTER';
  app_namespace: string;
  zone: WsZoneStub | WsZoneFeature;
  total: number;
  total_tags: number;
  total_mobiles: number;
  avg_time: number;
  avg_time_tags: number;
  avg_time_mobiles: number;
  timestamp?: string | number;
  /** Only with a full zone Feature. */
  map_uuid?: string;
  /** Set to true on every counter carrying a full Feature. */
  is_synthetic_exit?: boolean;
}

/** The free-form event parameters of an alert rule. */
export interface WsAlertParams {
  text?: string;
  title?: string;
  style?: 'info' | 'warning' | 'error' | (string & {});
  [key: string]: unknown;
}

/** M4: alert. No timestamp on the wire; `user_udid` is absent when a zone event fired the rule. */
export interface AlertMessage {
  action: 'notifyEvent';
  event_type: 'NOTIFICATION';
  app_namespace: string;
  map_uuid?: string;
  user_udid?: string;
  user_type?: string;
  zone?: WsPositionZone | WsZoneFeature | WsZoneStub | null;
  params?: WsAlertParams;
}

/** M5: tag lost, one event per zone whose presence expired. */
export interface TagLostMessage {
  action: 'notifyEvent';
  event_type: 'USR_EXIT';
  app_namespace: string;
  user_udid: string;
  is_synthetic_exit?: boolean;
  map_uuid?: string;
  zone?: WsZoneFeature | WsZoneStub | null;
  user_name?: string;
  tags?: string[] | null;
  data?: Record<string, unknown>;
  external_id?: string | null;
}

/** M6: asset change. No timestamp; `data` absent on delete. */
export interface AssetMessage {
  type: 'assets';
  action: 'create' | 'update' | 'delete';
  app_namespace: string;
  mac_address: string;
  data?: WsAssetData;
}

/** M7: alert rules changed (refetch hint). */
export interface AlertRulesChangedMessage {
  type: 'alert_rules';
  action: 'update';
  app_namespace: string;
}

/** M8: asset library changed (refetch hint). */
export interface AssetsLibraryChangedMessage {
  action: 'fetchAssetsLibraryEvent';
  app_namespace: string;
}

/** M9: data models changed (refetch hint). */
export interface DataModelsChangedMessage {
  action: 'fetchDataFiltersTaxonomyEvent';
  app_namespace: string;
}

/** M10: settings changed (refetch hint). */
export interface SettingsChangedMessage {
  action: 'updateSettingsEvent';
  app_namespace: string;
}

/** M11: map editor data changed (refetch hint). */
export interface MapDataChangedMessage {
  action: 'fetchMapEditorDataEvent';
  app_namespace: string;
  venue_id?: number | string;
  map_id?: number | string;
}

/** M12: the reply to SUBSCRIBE (exactly these two keys). */
export interface SubscriptionConfirmation {
  action: 'subscribeEvent';
  app_namespace: string;
}

/** Any parsed frame. */
export type WebSocketMessage =
  | PositionMessage
  | ZoneEntryExitMessage
  | ZoneStatsMessage
  | AlertMessage
  | AssetMessage
  | TagLostMessage
  | AlertRulesChangedMessage
  | AssetsLibraryChangedMessage
  | DataModelsChangedMessage
  | SettingsChangedMessage
  | MapDataChangedMessage
  | SubscriptionConfirmation
  | Record<string, unknown>;

/** What `classifyMessage` returns. */
export type WebSocketMessageKind =
  | 'CONFIRMATION'
  | SubscriptionType
  | 'TAG_LOST'
  | 'ALERT_RULES_CHANGED'
  | 'ASSETS_LIBRARY_CHANGED'
  | 'DATA_MODELS_CHANGED'
  | 'SETTINGS_CHANGED'
  | 'MAP_DATA_CHANGED'
  | 'UNKNOWN';

// ─── Classifier ───────────────────────────────────────────────────────────────

/** `event_type` of an `action: 'notifyEvent'` frame → kind. */
const NOTIFY_KINDS: ReadonlyMap<unknown, WebSocketMessageKind> = new Map<
  unknown,
  WebSocketMessageKind
>([
  ['ENTER_ZONE', 'ZONES_ENTRIES_EVENTS'],
  ['EXIT_ZONE', 'ZONES_ENTRIES_EVENTS'],
  ['UPDATE_ZONE_COUNTER', 'ZONE_STATS_EVENTS'],
  ['NOTIFICATION', 'ALERTS'],
  ['USR_EXIT', 'TAG_LOST'],
]);

/** Any other `action` → kind. */
const ACTION_KINDS: ReadonlyMap<unknown, WebSocketMessageKind> = new Map<
  unknown,
  WebSocketMessageKind
>([
  ['fetchAssetsLibraryEvent', 'ASSETS_LIBRARY_CHANGED'],
  ['fetchDataFiltersTaxonomyEvent', 'DATA_MODELS_CHANGED'],
  ['updateSettingsEvent', 'SETTINGS_CHANGED'],
  ['fetchMapEditorDataEvent', 'MAP_DATA_CHANGED'],
]);

/** `type` → kind (checked before `action`, which these frames also carry). */
const TYPE_KINDS: ReadonlyMap<unknown, WebSocketMessageKind> = new Map<
  unknown,
  WebSocketMessageKind
>([
  ['assets', 'ASSETS'],
  ['alert_rules', 'ALERT_RULES_CHANGED'],
]);

/**
 * The kind of a parsed frame, from its wire discriminators only: `action: 'subscribeEvent'` → `CONFIRMATION`;
 * `type` `assets` / `alert_rules`; `action: 'notifyEvent'` by `event_type`; another `action` by its value; no
 * `action` with numeric `lat`/`lon` and a string `user_uuid` → `POSITIONS`; anything else → `UNKNOWN`.
 */
export function classifyMessage(msg: unknown): WebSocketMessageKind {
  if (typeof msg !== 'object' || msg === null || Array.isArray(msg)) return 'UNKNOWN';
  const frame = msg as Record<string, unknown>;
  const { action } = frame;
  if (action === 'subscribeEvent') return 'CONFIRMATION';
  const byType = TYPE_KINDS.get(frame.type);
  if (byType !== undefined) return byType;
  if (action === 'notifyEvent') return NOTIFY_KINDS.get(frame.event_type) ?? 'UNKNOWN';
  if (action !== undefined) return ACTION_KINDS.get(action) ?? 'UNKNOWN';
  return typeof frame.lat === 'number' &&
    typeof frame.lon === 'number' &&
    typeof frame.user_uuid === 'string'
    ? 'POSITIONS'
    : 'UNKNOWN';
}

/** `true` for a processed position (M1). */
export function isPositionMessage(msg: unknown): msg is PositionMessage {
  return classifyMessage(msg) === 'POSITIONS';
}

/** `true` for a zone enter/exit event (M2). */
export function isZoneEntryExitMessage(msg: unknown): msg is ZoneEntryExitMessage {
  return classifyMessage(msg) === 'ZONES_ENTRIES_EVENTS';
}

/** `true` for a zone counter update (M3). */
export function isZoneStatsMessage(msg: unknown): msg is ZoneStatsMessage {
  return classifyMessage(msg) === 'ZONE_STATS_EVENTS';
}

/** `true` for an alert (M4). */
export function isAlertMessage(msg: unknown): msg is AlertMessage {
  return classifyMessage(msg) === 'ALERTS';
}

/** `true` for an asset change (M6). */
export function isAssetMessage(msg: unknown): msg is AssetMessage {
  return classifyMessage(msg) === 'ASSETS';
}

/** `true` for the subscription confirmation (M12). */
export function isSubscriptionConfirmation(msg: unknown): msg is SubscriptionConfirmation {
  return classifyMessage(msg) === 'CONFIRMATION';
}
