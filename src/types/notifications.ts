/**
 * Notification center types (`client.notifications`). Hand-written from the server's behaviour: the
 * vendored spec declares property-less objects, untyped responses and missing request bodies for this domain, so
 * every type below carries a `@remarks` line naming the spec defect it works around.
 *
 * Every name carries the `Notification` prefix so that the `export *` barrels cannot collide with other domains.
 *
 * @module types/notifications
 */
import type { CallContext } from '../context';
import type { RtlsError } from '../errors';

// ---------------------------------------------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------------------------------------------

/**
 * The kind of an inbox item.
 * @remarks Spec: `kind` is required on `POST /send`, although the server defaults it to `'direct_message'`.
 */
export type NotificationKind = 'alert' | 'direct_message' | 'mission';

/**
 * The severity of an inbox item. `'critical'` sends need the `send_notifications` role.
 * @remarks Spec: correct on items; the list filter `severity` is declared without its enum.
 */
export type NotificationSeverity = 'info' | 'warning' | 'critical';

/**
 * A delivery channel.
 * @remarks Spec: rule and connection `channels` are declared as plain strings without this enum.
 */
export type NotificationChannel = 'inapp' | 'email' | 'slack' | 'telegram' | 'teams' | 'whatsapp';

/**
 * The `state` list filter. Absent = the active inbox (not archived); `'needs_action'` overrides `kind`.
 * @remarks Spec: the `state` values `muted`, `snoozed`, `pinned` and `all` are not documented.
 */
export type NotificationState =
  'unread' | 'read' | 'needs_action' | 'archived' | 'muted' | 'snoozed' | 'pinned' | 'all';

/**
 * How {@link NotificationGroup} rows are keyed (`listGroups()`).
 * @remarks Spec: the `group_by` parameter and its values are not documented (USI-P6-2).
 */
export type NotificationGroupBy = 'thread' | 'type' | 'zone' | 'asset';

/**
 * Who produced an item; stamped by the server, never by the caller.
 * @remarks Spec: correct enum; the values are set by the server (USI-P6-1).
 */
export type NotificationSource = 'rule_engine' | 'agent' | 'operator' | 'system';

/**
 * The status of a mission item.
 * @remarks Spec: `mission` is a property-less object; the status enum is server truth.
 */
export type NotificationMissionStatus = 'open' | 'in_progress' | 'done';

/**
 * A `bulk()` action.
 * @remarks Spec: `POST /bulk` has no request body schema; the actions are server truth.
 */
export type NotificationBulkAction =
  'read' | 'acknowledge' | 'archive' | 'delete' | 'pin' | 'mute' | 'snooze';

// ---------------------------------------------------------------------------------------------------------------
// Inbox items
// ---------------------------------------------------------------------------------------------------------------

/**
 * Zone reference of an engine-produced item (never set by `/send`).
 * @remarks Spec: `zone` is a property-less object. Every field is optional: an item can carry only `tags`,
 *   without `id` or `name`.
 */
export interface NotificationZoneRef {
  id?: number;
  name?: string;
  tags?: string[];
}

/**
 * Asset reference of an engine-produced item (never set by `/send`).
 * @remarks Spec: `asset` is a property-less object. Every field is optional.
 */
export interface NotificationAssetRef {
  udid?: string;
  name?: string;
  type?: string;
  tags?: string[];
}

/**
 * The mission part of a mission item.
 * @remarks Spec: `mission` is a property-less object.
 */
export interface NotificationMission {
  assignee?: string;
  status?: NotificationMissionStatus;
  /** Epoch milliseconds. */
  due?: number;
}

/**
 * The outcome of one channel fan-out.
 * @remarks Spec: `deliveries[].channel` is a plain string; the `error` codes are not documented.
 */
export interface NotificationDelivery {
  channel: NotificationChannel | string;
  status: 'queued' | 'sent' | 'failed' | 'skipped';
  /** Sanitized code, e.g. `'not_connected'`, `'not_verified'`, `'rate_limited'`, `'smtp_error'`. */
  error?: string;
  /** Epoch milliseconds. */
  ts?: number;
}

/**
 * One inbox item of the caller (spec name `Notification`; not exported under that name because it shadows the DOM
 * global).
 * @remarks Spec: `zone`, `asset`, `mission` and `params` are property-less objects, and the list endpoint is
 *   declared as `Notification[]` although it defaults to group rows (USI-P6-2).
 */
export interface NotificationItem {
  /** 24-hex ObjectId. */
  _id: string;
  app_namespace: string;
  /** The recipient. */
  user_id: string;
  event_id: string;
  kind: NotificationKind;
  /** `/send` default `'NOTIFICATION'`. */
  event_type?: string;
  /** `/send` default `'info'`. */
  severity: NotificationSeverity;
  title?: string;
  /** Markdown; render it as untrusted content. */
  body?: string;
  /** Server-stamped (USI-P6-1). */
  source?: NotificationSource;
  /** `'user:<id>'` for sends. */
  source_ref?: string;
  /** Never set by `/send` (USI-P6-7). */
  zone?: NotificationZoneRef;
  /** Never set by `/send` (USI-P6-7). */
  asset?: NotificationAssetRef;
  rule_id?: string;
  /** Missions only. */
  mission_id?: string;
  /** Direct messages only. */
  conversation_id?: string;
  /** Opaque passthrough, by design. */
  params?: Record<string, unknown>;
  thread_key: string;
  search_text?: string;
  read: boolean;
  read_at: number | null;
  acknowledged: boolean;
  acked_at: number | null;
  acked_by: string | null;
  archived: boolean;
  archived_at: number | null;
  pinned: boolean;
  muted: boolean;
  snooze_until: number | null;
  /** Missions only. */
  mission?: NotificationMission;
  /** Written after the fan-out; absent from the `/send` 201 body. */
  deliveries?: NotificationDelivery[];
  /** Epoch milliseconds. */
  created_at: number;
  __v?: number;
}

/**
 * One group row of `listGroups()`, built from the current page only (at most `limit` newest matching items).
 * @remarks Spec: the list endpoint is declared as `Notification[]`; group rows are not documented (USI-P6-2).
 */
export interface NotificationGroup {
  /** `thread` → the thread key; `type` → the kind; `zone` → `zone:<id>` / `no-zone`; `asset` → `asset:<udid>` / `no-asset`. */
  group_key: string;
  group_by: NotificationGroupBy;
  item_ids: string[];
  newest: {
    _id: string;
    title?: string;
    severity: NotificationSeverity;
    created_at: number;
    thread_key: string;
  };
  count: number;
  unread_count: number;
  max_severity: NotificationSeverity;
  /** Any actionable, unacknowledged item in the group. */
  needs_ack: boolean;
}

/**
 * Counts by facet of the items matching a filter. With no `state` filter the base filter is "not archived", so
 * `state.archived` is 0 unless `state` is `'all'` or `'archived'`.
 * @remarks Spec: the response is an untyped object and only `q` is declared as a filter.
 */
export interface NotificationFacets {
  kind: Partial<Record<NotificationKind, number>>;
  severity: Partial<Record<NotificationSeverity, number>>;
  /** Key = zone id as a string; items without a zone are not counted. */
  zone: Record<string, number>;
  /** Counts of deliveries per channel. */
  channel: Record<string, number>;
  state: {
    unread: number;
    read: number;
    needs_action: number;
    archived: number;
    muted: number;
    snoozed: number;
    pinned: number;
  };
}

/**
 * The caller's unread and needs-action counts (muted and snoozed items are counted, USI-P6-5).
 * @remarks Spec: correct; restated here so the domain has one hand-written source.
 */
export interface NotificationUnreadCount {
  unread: number;
  needs_action: number;
}

/**
 * The result of `bulk()`. `affected` = documents whose stored fields changed (deleted documents for `'delete'`);
 * `'read'`, `'archive'` and `'acknowledge'` re-stamp a timestamp, so items already in that state are counted again;
 * `'pin'` and `'mute'` do not count items already pinned or muted. No `undo_token` when `affected` is 0 or the
 * server has no undo store; the token is single-use and valid for 300 s.
 * @remarks Spec: only `affected` is declared; `undo_token` is missing.
 */
export interface NotificationBulkResult {
  affected: number;
  undo_token?: string;
}

/**
 * The result of `undo()`.
 * @remarks Spec: `POST /bulk/undo` declares no response body.
 */
export interface NotificationUndoResult {
  restored: number;
}

// ---------------------------------------------------------------------------------------------------------------
// Rules, connections, saved views, cleanup policy
// ---------------------------------------------------------------------------------------------------------------

/**
 * What a forwarding rule (or recipient mapping) matches; absent or `{}` matches every event.
 * @remarks Spec: `match` is a property-less object.
 */
export interface NotificationRuleMatch {
  kinds?: NotificationKind[];
  min_severity?: NotificationSeverity;
  zones?: number[];
  asset_tags?: string[];
  event_types?: string[];
}

/**
 * Coalescing of a forwarding rule.
 * @remarks Spec: `throttle` is a property-less object.
 */
export interface NotificationRuleThrottle {
  coalesce_seconds?: number;
  group?: string;
}

/**
 * A forwarding rule of the caller (spec name `ForwardingRule`). An enabled rule subscribes its owner to every
 * matching engine event.
 * @remarks Spec: `match` and `throttle` are property-less objects and `__v` is not declared.
 */
export interface NotificationRule {
  _id: string;
  app_namespace: string;
  user_id: string;
  name?: string;
  enabled: boolean;
  /** Absent or `{}` = matches every event. */
  match?: NotificationRuleMatch;
  channels?: NotificationChannel[];
  throttle?: NotificationRuleThrottle;
  created_at: number;
  __v?: number;
}

/**
 * A write-only secret as the server returns it.
 * @remarks Spec: the redacted secret form is not documented.
 */
export interface NotificationRedactedSecret {
  set: true;
  fingerprint: string;
}

/**
 * The credentials of a channel connection (secrets come back redacted).
 * @remarks Spec: `credentials` is a property-less object.
 */
export interface NotificationConnectionCredentials {
  /** email */
  address?: string;
  /** slack */
  webhook_url?: string;
  /** slack (write-only secret) */
  bot_token?: NotificationRedactedSecret;
  /** telegram */
  chat_id?: string;
  /** teams */
  workflow_url?: string;
  /** whatsapp */
  phone_e164?: string;
}

/**
 * A channel connection of the caller (spec name `ChannelConnection`), one per channel.
 * @remarks Spec: `credentials` is a property-less object and `verified_at` / `__v` are not declared.
 */
export interface NotificationConnection {
  _id: string;
  app_namespace: string;
  user_id: string;
  channel: NotificationChannel;
  enabled: boolean;
  verified: boolean;
  credentials: NotificationConnectionCredentials;
  created_at: number;
  verified_at?: number;
  __v?: number;
}

/**
 * The result of `connections.test()`: resolved for 200 (`verified: true`) and for 422 (`verified: false`).
 * @remarks Spec: the 200 and 422 responses declare no body.
 */
export interface NotificationConnectionTestResult {
  verified: boolean;
  delivery: NotificationDelivery;
}

/**
 * The query stored in a saved view: the list filters, with `from` / `to` as epoch ms (USI-P6-11).
 * @remarks Spec: `query` is a property-less object; the index signature keeps any other stored key.
 */
export type NotificationSavedViewQuery = NotificationFilter & {
  group_by?: NotificationGroupBy | 'flat';
  [key: string]: unknown;
};

/**
 * A saved view of the caller (spec name `SavedView`).
 * @remarks Spec: `query` is a property-less object and `__v` is not declared.
 */
export interface NotificationSavedView {
  _id: string;
  app_namespace: string;
  user_id: string;
  name: string;
  query: NotificationSavedViewQuery;
  created_at: number;
  __v?: number;
}

/**
 * The caller's retention policy. `_id` absent = server defaults (30 / 180 days), nothing stored.
 * @remarks Spec: correct fields, but it does not say that `_id`, `updated_at` and `__v` are absent for defaults.
 */
export interface NotificationCleanupPolicy {
  app_namespace: string;
  user_id: string;
  auto_archive_days: number;
  auto_purge_days: number;
  _id?: string;
  updated_at?: number;
  __v?: number;
}

// ---------------------------------------------------------------------------------------------------------------
// Admin: tenant configuration and recipient mappings
// ---------------------------------------------------------------------------------------------------------------

/**
 * A secret of the tenant configuration. Write: a plain string. Read: the redacted object. Sending the redacted
 * object back keeps the stored secret.
 * @remarks Spec: the tenant configuration is untyped; secret redaction is not documented.
 */
export type NotificationSecret = string | NotificationRedactedSecret;

/**
 * The namespace's notification configuration (role-gated: `manage_api_keys`). `{ app_namespace }` alone when no
 * document is stored.
 * @remarks Spec: both `GET` and `PUT /tenant-config` responses are untyped; the index signatures keep the channel
 *   settings the server stores as given.
 */
export interface NotificationTenantConfig {
  app_namespace: string;
  email?: {
    smtp_host?: string;
    smtp_port?: number;
    from?: string;
    auth?: { user?: string; pass?: NotificationSecret };
    [key: string]: unknown;
  };
  slack?: { bot_token?: NotificationSecret; [key: string]: unknown };
  telegram?: { bot_token?: NotificationSecret; [key: string]: unknown };
  teams?: {
    azure_app?: { client_secret?: NotificationSecret; [key: string]: unknown };
    [key: string]: unknown;
  };
  whatsapp?: {
    cloud_api?: { access_token?: NotificationSecret; [key: string]: unknown };
    templates?: Record<string, { name: string; lang?: string; params?: string[] }>;
    [key: string]: unknown;
  };
  rate_limits?: Partial<Record<NotificationChannel, Record<string, unknown>>>;
  cleanup_cap?: { max_archive_days?: number; max_purge_days?: number };
  updated_at?: number;
  _id?: string;
  __v?: number;
}

/**
 * A top-level merge patch of the tenant configuration (a supplied channel object replaces the stored one).
 * @remarks Spec: `PUT /tenant-config` declares no request body.
 */
export type NotificationTenantConfigPatch = Partial<
  Omit<NotificationTenantConfig, 'app_namespace' | 'updated_at' | '_id' | '__v'>
>;

/**
 * Who receives matching engine events, besides rule owners (role-gated: `manage_api_keys`).
 * @remarks Spec: `id` is not an ObjectId (`'map_<epochms>_<seq>'`); `roles` and `zone_responsibles` are stored but
 *   not resolved by the server.
 */
export interface NotificationRecipientMapping {
  id: string;
  enabled: boolean;
  match?: NotificationRuleMatch;
  recipients?: { roles?: string[]; zone_responsibles?: number[]; user_ids?: string[] };
  channels?: NotificationChannel[];
}

// ---------------------------------------------------------------------------------------------------------------
// Filters and queries
// ---------------------------------------------------------------------------------------------------------------

/**
 * A filter of the inbox (list, facets, export, bulk). Every value is sent as a string.
 * @remarks Spec: `zone`, `asset`, `thread_key`, `pinned`, `from` and `to` are not documented (USI-P6-2); facets and
 *   export declare almost none of them.
 */
export interface NotificationFilter {
  /** Scoped terms (`zone:<int>`, `tag:<tag>`, `from:<source>`, `severity:<…>`) and free text; free text forces flat results. */
  q?: string;
  /** Absent = the active inbox (not archived); `'needs_action'` overrides `kind`. */
  state?: NotificationState;
  kind?: NotificationKind;
  severity?: NotificationSeverity;
  /** Integer zone id. */
  zone?: number;
  /** Asset udid, sent as given. */
  asset?: string;
  thread_key?: string;
  /** The server has no "not pinned" filter. */
  pinned?: true;
  /** `created_at >=` this time. */
  from?: Date | number | string;
  /** `created_at <=` this time. */
  to?: Date | number | string;
}

/**
 * A filter plus one page of the flat list.
 * @remarks Spec: `limit` / `offset` bounds are not documented (the server clamps silently).
 */
export interface NotificationListQuery extends NotificationFilter {
  /** Integer 1..200; server default 50. */
  limit?: number;
  /** Integer >= 0. */
  offset?: number;
}

/**
 * The query of `listGroups()` (free-text `q` is not allowed: it would force flat results).
 * @remarks Spec: grouping is not documented (USI-P6-2).
 */
export interface NotificationGroupQuery extends Omit<NotificationListQuery, 'q'> {
  /** Default `'thread'`. */
  group_by?: NotificationGroupBy;
}

/**
 * The query of `export()`; `limit`, `offset` and grouping are ignored by the server.
 * @remarks Spec: only `format` is declared; every list filter is accepted.
 */
export type NotificationExportQuery = NotificationFilter & { format?: 'csv' | 'json' };

// ---------------------------------------------------------------------------------------------------------------
// Bulk and send
// ---------------------------------------------------------------------------------------------------------------

/**
 * A `bulk()` request: exactly one selector (`ids`, `thread_key` or a selective `filter`) and an action;
 * `'snooze'` needs `snooze_until`.
 * @remarks Spec: `POST /bulk` declares no request body.
 */
export type NotificationBulkRequest = (
  | { ids: string[]; thread_key?: never; filter?: never }
  | { thread_key: string; ids?: never; filter?: never }
  | { filter: NotificationFilter; ids?: never; thread_key?: never }
) &
  (
    | { action: 'snooze'; snooze_until: Date | number | string }
    | { action: Exclude<NotificationBulkAction, 'snooze'>; snooze_until?: never }
  );

/**
 * A recipient of `send()`. Only `user` targets are resolved by the server.
 * @remarks Spec: `role`, `team` and `agent` target types are declared but not resolved (USI-P6-7).
 */
export interface NotificationRecipient {
  target_type: 'user';
  id: string;
}

/**
 * A `send()` request. Only the defined keys are sent; the SDK never sends `source`.
 * @remarks Spec: `kind` is declared required (the server defaults it); `mission_id` and `event_type` are not
 *   documented; `zone`, `asset` and `rule_id` are ignored by the server (USI-P6-7).
 */
export interface NotificationSendRequest {
  recipients: NotificationRecipient[];
  /** Server default `'direct_message'`. */
  kind?: NotificationKind;
  /** Server default `'info'`; `'critical'` needs the `send_notifications` role. */
  severity?: NotificationSeverity;
  title?: string;
  /** Markdown, rendered as untrusted. */
  body?: string;
  /** Put zone/asset context here (the server ignores `zone` / `asset`). */
  params?: Record<string, unknown>;
  /** External fan-out to each recipient's verified connections; absent = nothing leaves the platform. */
  channels?: NotificationChannel[];
  /** Direct-message threading → thread key `'dm:<id>'`. */
  conversation_id?: string;
  /** Mission threading → thread key `'mission:<id>'`. */
  mission_id?: string;
  /** Kept only for `kind: 'mission'`; `due` is sent as epoch milliseconds. */
  mission?: { assignee?: string; status?: NotificationMissionStatus; due?: Date | number | string };
  /** Default `'NOTIFICATION'`; matched by rule `match.event_types`. */
  event_type?: string;
}

// ---------------------------------------------------------------------------------------------------------------
// Sub-resource inputs
// ---------------------------------------------------------------------------------------------------------------

/**
 * Input of `rules.create()`. `enabled` is required: the server would default it to `true` and subscribe the caller.
 * @remarks Spec: `POST /rules` body is the response schema (`_id`, `user_id`, … included) and does not say that
 *   `enabled` defaults to `true`.
 */
export interface NotificationRuleInput {
  enabled: boolean;
  name?: string;
  match?: NotificationRuleMatch;
  channels?: NotificationChannel[];
  throttle?: NotificationRuleThrottle;
}

/**
 * Input of `rules.update()`: `match` is replaced wholesale and `channels: []` is ignored (USI-P6-9).
 * @remarks Spec: `PATCH /rules/{id}` declares no request body.
 */
export type NotificationRulePatch = Partial<NotificationRuleInput>;

/**
 * Input of `connections.upsert()`: one shape per channel with its credential fields.
 * @remarks Spec: `credentials` is a property-less object.
 */
export type NotificationConnectionInput =
  | { channel: 'inapp'; enabled?: boolean }
  | { channel: 'email'; enabled?: boolean; credentials: { address: string } }
  | {
      channel: 'slack';
      enabled?: boolean;
      credentials: { webhook_url: string; bot_token?: string };
    }
  | { channel: 'telegram'; enabled?: boolean; credentials: { chat_id: string } }
  | { channel: 'teams'; enabled?: boolean; credentials: { workflow_url: string } }
  | { channel: 'whatsapp'; enabled?: boolean; credentials: { phone_e164: string } };

/**
 * Input of `savedViews.create()`; `query` defaults to `{}`.
 * @remarks Spec: `query` is a property-less object.
 */
export interface NotificationSavedViewInput {
  name: string;
  query?: NotificationSavedViewQuery;
}

/**
 * Input of `cleanupPolicy.replace()`: both fields are required (the server resets an omitted field to its default).
 * @remarks Spec: the request body is the response schema and does not say that omitted fields are reset (USI-P6-6).
 */
export interface NotificationCleanupPolicyInput {
  auto_archive_days: number;
  auto_purge_days: number;
}

/**
 * Input of `admin.recipientMappings.create()`. `enabled` is required: the server default is `true`.
 * @remarks Spec: the request body is the response schema (with `id`).
 */
export interface NotificationRecipientMappingInput {
  enabled: boolean;
  match?: NotificationRuleMatch;
  recipients?: { roles?: string[]; zone_responsibles?: number[]; user_ids?: string[] };
  channels?: NotificationChannel[];
}

/**
 * Input of `admin.recipientMappings.update()` (shallow merge).
 * @remarks Spec: `PATCH /recipient-mappings/{id}` declares no request body and no 400.
 */
export type NotificationRecipientMappingPatch = Partial<NotificationRecipientMappingInput>;

// ---------------------------------------------------------------------------------------------------------------
// Stream
// ---------------------------------------------------------------------------------------------------------------

/**
 * One event of the live stream. `'reconnected'` is synthetic (emitted by the SDK after the `open` of a
 * re-connection); after it, re-fetch `unreadCount()` and the list.
 * @remarks Spec: `/stream` is typed as a `string`; the event names and data are not documented. `unread_count`
 *   carries `{ action, affected }`, not counts (USI-P6-3).
 */
export type NotificationStreamEvent =
  | { type: 'open'; data: { app_namespace: string; user_id: string } }
  | { type: 'item'; data: Omit<NotificationItem, '_id'> & { _id?: string } }
  | {
      type: 'state';
      data: { id: string } & Partial<
        Pick<
          NotificationItem,
          'read' | 'acknowledged' | 'archived' | 'pinned' | 'muted' | 'snooze_until' | 'mission'
        >
      >;
    }
  | { type: 'unread_count'; data: { action: NotificationBulkAction; affected: number } }
  | { type: 'reconnected'; data: { attempt: number } };

/**
 * Options of `notifications.stream()`. `signal` is required: the stream has no total timeout.
 * @remarks Spec: `/stream` declares `token` / `api_key` query parameters; the SDK authenticates by header only.
 */
export interface NotificationStreamOptions extends CallContext {
  /** Required; aborting it closes the stream. */
  signal: AbortSignal;
  /** Default `true` = `{ initialDelayMs: 1000, maxDelayMs: 30000, maxAttempts: Infinity }`. */
  reconnect?: boolean | { initialDelayMs?: number; maxDelayMs?: number; maxAttempts?: number };
  /** Default 45 000 (more than two 20 s heartbeats). */
  idleTimeoutMs?: number;
}

/**
 * How a stream ended (`stream.done` always resolves, never rejects).
 * @remarks Spec: the stream's lifecycle is not documented.
 */
export type NotificationStreamEnd =
  { reason: 'aborted' } | { reason: 'ended' } | { reason: 'error'; error: RtlsError };

/**
 * The live stream of the caller's inbox: an async iterable and an emitter.
 * @remarks Spec: `/stream` is typed as a `string`.
 */
export interface NotificationStream extends AsyncIterable<NotificationStreamEvent> {
  on<T extends NotificationStreamEvent['type']>(
    type: T,
    listener: (event: Extract<NotificationStreamEvent, { type: T }>) => void
  ): this;
  on(type: 'error', listener: (error: RtlsError, info: { fatal: boolean }) => void): this;
  off(type: NotificationStreamEvent['type'] | 'error', listener: (...args: never[]) => void): this;
  /** Always resolves, never rejects. */
  readonly done: Promise<NotificationStreamEnd>;
}
