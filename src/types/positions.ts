/**
 * Position, publish and Elasticsearch types. The position documents are hand-written from the live wire
 * shape, because the spec's schemas miss keys the server returns.
 *
 * @module types/positions
 */
import type { CallContext } from '../context';
import type { TimeInput } from '../utils/time';
import type { DeclaredLocation } from './assets';

/** The zone a position lies in, as stored on cache entries and Elasticsearch documents. */
export interface PositionZone {
  id: number;
  name: string;
  tags?: string[] | null;
  color?: string | null;
  level?: number;
}

// spec gap: USI-P3-10 — the spec's CachedAssetPosition lacks user_uuid and user_type, which the server returns.
/**
 * A cached position (`GET /cache/{app_namespace}/positions[/{mac}]`) or the last position of one asset
 * (`GET /asset_last_position/{app_namespace}/{mac}`).
 */
export interface CachedAssetPosition {
  app_namespace: string;
  /** The asset MAC, stored as published (12 lower-case hex on assets created through the API). */
  user_udid: string;
  /** Set by the publisher to the same MAC as `user_udid`. */
  user_uuid?: string;
  user_name?: string;
  user_type?: string;
  user_motion?: string;
  external_id?: string;
  lat: number;
  lon: number;
  map_uuid?: string;
  /** ISO 8601, second precision. */
  timestamp: string;
  origin?: number;
  zone?: PositionZone | null;
  prev_pos_distance?: number;
  prev_pos_time_diff_seconds?: number;
  speed?: number;
  tags?: string[];
  model?: string;
  color?: string;
  path?: string;
  /** Free-form asset data. */
  data?: Record<string, unknown>;
  createdBy?: string;
  /** Epoch milliseconds. */
  dateCreated?: number;
  /** Epoch milliseconds. */
  dateChanged?: number;
  /** Declared by the spec; not observed on production responses. */
  targetApplications?: string[];
}

/** The `user` object of an Elasticsearch position document. */
export interface AssetPositionUser {
  /** The asset MAC. */
  udid: string;
  external_id?: string;
  name?: string;
  type?: string | null;
  tags?: string[];
  data?: Record<string, unknown>;
  device_info?: { model?: string | null };
}

// spec gap: USI-P3-10 — the spec's AssetPosition lacks origin_detail, declared_location, is_virtual,
// battery_percent and span, which the server returns.
/** A position document of `GET /es/last_positions` and `GET /es/position_history` (latest first / ascending). */
export interface AssetPosition {
  /** Epoch milliseconds. */
  timestamp: number;
  user: AssetPositionUser;
  location?: { lat: number; lon: number };
  map_uuid?: string;
  origin?: number;
  /** `'declared'` for declared positions. */
  origin_detail?: string;
  zone?: PositionZone | null;
  model?: string;
  color?: string;
  path?: string;
  /** Epoch milliseconds. */
  dateCreated?: number;
  /** Epoch milliseconds. */
  dateChanged?: number;
  battery_percent?: number;
  is_virtual?: boolean;
  declared_location?: DeclaredLocation | null;
  /** Present on position-history items. */
  span?: { dist?: number };
}

/** Options of `positions.listLast()`; only these keys are sent. */
export interface ListLastPositionsOptions {
  /** Field that identifies a document; default `user.udid`; `data.x` is shorthand for `user.data.x`. */
  key?: string;
  /** Lucene query string. */
  queryString?: string;
  /** Map UUIDs (OR); sent as CSV, omitted when empty. */
  mapUuids?: string[];
  /** Lower bound; default `timestampTo` − 24 h. `0` requests the whole history (slow: pass `timeoutMs`). */
  timestampFrom?: TimeInput;
  /** Upper bound; default now. */
  timestampTo?: TimeInput;
  /** Current-position semantics, honoured only when the platform switch is on (sent only when `true`). */
  current?: boolean;
}

/** Options of `positions.getHistory()`. */
export interface PositionHistoryOptions {
  /** The value matched on `key` (the asset MAC with the default key). */
  value: string;
  /** Field matched against `value`; default `user.udid`; `data.x` is shorthand for `user.data.x`. */
  key?: string;
  /** Lower bound; default `timestampTo` − 24 h. */
  timestampFrom?: TimeInput;
  /** Upper bound; default now. */
  timestampTo?: TimeInput;
}

/** A position published with `positions.publish()`; extra keys are sent as given. */
export interface PublishPositionData {
  /** The asset MAC (a valid MAC is normalised to 12 lower-case hex; anything else is sent verbatim). */
  user_udid: string;
  /** The server prefers it over `user_udid` when present. */
  user_uuid?: string;
  lat?: number;
  lon?: number;
  map_uuid?: string;
  user_name?: string;
  /** Free-form asset data. */
  data?: Record<string, unknown>;
  [extra: string]: unknown;
}

/** Options of `positions.publish()`. */
export interface PublishOptions {
  /** Also write the position's asset fields to the existing asset (`patch_asset_data=true`). */
  patchAssetData?: boolean;
}

/** The Elasticsearch data types of `POST /es/query` (the spec's enum). */
export type EsDataType = 'alerts' | 'positions' | 'zone_visits';

/** An Elasticsearch query DSL body, sent verbatim. */
export type EsQueryBody = Record<string, unknown>;

/** One hit of an Elasticsearch search response. */
export interface EsSearchHit<T = Record<string, unknown>> {
  _index: string;
  _id: string;
  _score: number | null;
  _source: T;
  sort?: unknown[];
}

/** The raw Elasticsearch search response of `POST /es/query`. */
export interface EsSearchResponse<T = Record<string, unknown>, A = Record<string, unknown>> {
  took: number;
  timed_out: boolean;
  /** `true` when the server-injected `terminate_after` cut the search short (partial results). */
  terminated_early?: boolean;
  _shards: { total: number; successful: number; skipped?: number; failed: number };
  hits: {
    /** Absent unless the body sets `track_total_hits: true`. */
    total?: { value: number; relation: 'eq' | 'gte' };
    max_score: number | null;
    hits: EsSearchHit<T>[];
  };
  aggregations?: A;
}

/** @deprecated since 0.3.0 — use {@link ListLastPositionsOptions}. */
export type ListPositionsOptions = ListLastPositionsOptions;

/** @deprecated since 0.3.0 — use `ListLastPositionsOptions & CallContext`. */
export type ListPositionsParams = ListLastPositionsOptions & CallContext;
