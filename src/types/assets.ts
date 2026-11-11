/**
 * Asset-domain types, hand-written from the server's behaviour: the spec's schemas of this domain
 * are wrong in places, and each such place is named on the type that replaces it. Every name of the domain is declared
 * once, here; the resource modules re-export what they need and never re-declare it.
 *
 * Bodies and responses keep the wire names (snake_case); SDK-only options are camelCase.
 *
 * @module types/assets
 */
import type { RequestOptions } from '../client/base';
import type { CallContext } from '../context';
import type { FilterOptions, QueryOptions, Schema } from '../types';

// ─── Assets ─────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * An asset record as the server stores and returns it.
 *
 * Spec defect: the `Asset` schema marks `user_motion` and `path` as required; the server requires only `user_udid`
 * and `user_name` (a save without `data` stores `data: {}`). The spec also omits `user_type`, `is_virtual`,
 * `declared_location`, `battery_percent` and `maintenance`, which the server stores. Unknown keys are kept.
 */
export interface Asset {
  /** The asset key: 12 lowercase hex characters for every asset the SDK writes. */
  user_udid: string;
  user_name: string;
  user_motion?: string;
  user_type?: string;
  model?: string;
  color?: string;
  /** A node of the asset tree, for example `"/Root/Lv 1/"`. */
  path?: string;
  tags?: string[];
  external_id?: string;
  targetApplications?: string[];
  /** `true` on virtual assets (created by `bulkDeclare` with `auto_create_virtual_assets`, MAC `0200…`). */
  is_virtual?: boolean;
  /** The declared (manually set) location; absent when none is declared. */
  declared_location?: DeclaredLocation | null;
  data?: Record<string, unknown>;
  /** Server-owned: set to the namespace on create. */
  createdBy?: string;
  /** Server-owned: epoch milliseconds. */
  dateCreated?: number;
  /** Server-owned: epoch milliseconds. */
  dateChanged?: number;
  /** Server-owned. */
  battery_percent?: number;
  /** Server-owned; dropped by every write (USI-P2-6). */
  maintenance?: unknown;
  [key: string]: unknown;
}

/** Result of `assets.batchDelete`: the MACs as sent, split by outcome. */
export interface BatchDeleteResult {
  deleted: string[];
  not_found: string[];
}

/**
 * The spec's `BatchSaveResult` schema (`{ created, updated, errors }`).
 *
 * Spec defect: the server never answers with it; `POST /assets/{app_namespace}` returns the array of saved assets
 * (USI-P2-4), and `assets.batchSave` resolves `Asset[]`.
 *
 * @deprecated since 0.3.0 — `assets.batchSave` returns `Asset[]`; kept for one minor version.
 */
export type BatchSaveResult = Schema<'BatchSaveResult'>;

/** Options of `assets.list` / `iterate` / `getAll` (the server matches `key`/`value`; the rest is local). */
export type ListAssetsOptions = QueryOptions &
  FilterOptions & {
    /** Server-side exact match on this field (dot path, for example `data.zone`); requires `value`. */
    key?: string;
    /** The value `key` must have; sent as `String(value)`; requires `key`. */
    value?: string | number | boolean;
    /** Filters evaluated locally; merged with the top-level `"field:op"` keys (these filters win on the same key). */
    filters?: FilterOptions;
  };

/** {@link ListAssetsOptions} plus the per-call context and request options. */
export type ListAssetsParams = ListAssetsOptions & CallContext & RequestOptions;

/**
 * The writable fields of an asset (`assets.create`). Server-owned fields are excluded at type level.
 *
 * Spec defect: the spec documents the upsert body as `Asset`; the server merges it into the stored asset (RFC 7396) and
 * requires a non-empty `user_name` after the merge. `user_udid` is never taken from the path: the SDK sends the
 * normalised MAC.
 */
export interface AssetInput {
  user_name: string;
  /** Optional; when given it must be the asset's MAC (compared after normalisation). */
  user_udid?: string;
  user_motion?: string;
  user_type?: string;
  model?: string;
  color?: string;
  path?: string;
  tags?: string[];
  external_id?: string;
  targetApplications?: string[];
  /** Changing it publishes one synthetic position (origin `declared`). */
  declared_location?: DeclaredLocation | null;
  data?: Record<string, unknown>;
  createdBy?: never;
  dateCreated?: never;
  dateChanged?: never;
  battery_percent?: never;
  maintenance?: never;
  [key: string]: unknown;
}

/**
 * A JSON merge patch of an asset (`assets.update`): `null` deletes a key. `user_name` and `user_udid` cannot be
 * deleted (`update` rejects `null` for them), and the server-owned fields cannot be set.
 */
export type AssetPatch = {
  // The keys a patch cannot delete (`user_name`, `user_udid`) or write (server-owned) are typed below.
  [
    K in keyof AssetInput as K extends
      | 'user_name'
      | 'user_udid'
      | 'createdBy'
      | 'dateCreated'
      | 'dateChanged'
      | 'battery_percent'
      | 'maintenance'
      ? never
      : K
  ]?: AssetInput[K] | null;
} & {
  /** A non-empty string. */
  user_name?: string;
  /** The asset's MAC (any accepted form; sent normalised). */
  user_udid?: string;
  createdBy?: never;
  dateCreated?: never;
  dateChanged?: never;
  battery_percent?: never;
  maintenance?: never;
  [key: string]: unknown;
};

/** One item of `assets.batchSave`: the item's `user_udid` is its key, so it is required. */
export type BatchSaveItem = AssetInput & { user_udid: string };

/** Time window of `assets.getHistory` (default: the last 24 hours). */
export interface AssetHistoryOptions {
  startTime?: Date | number | string;
  endTime?: Date | number | string;
}

/** The action an asset-history entry records. */
export type AssetHistoryAction = 'create' | 'update' | 'delete';

/**
 * One entry of the audit trail of an asset record (`GET /asset_history/…`): not a position.
 *
 * Spec defect: the spec does not name this schema; `user` and `app_namespace` may be absent, and `timestamp` is unix
 * **seconds** as a decimal string (`"0"` when the server could not read it), USI-P2-7.
 */
export interface AssetHistoryEntry {
  id: string;
  action: AssetHistoryAction;
  /** Unix seconds as a decimal string; `"0"` when unknown. */
  timestamp: string;
  app_namespace?: string;
  /** Absent on entries written without a user. */
  user?: string;
  /** The asset after the action; absent on `delete` entries. */
  data?: Asset;
}

// ─── Asset tree and data models ─────────────────────────────────────────────────────────────────────────────────

/** A node of the asset tree; asset `path` values address these nodes (`/Root/Lv 1/`). */
export interface AssetTreeNode {
  name: string;
  color?: string;
  families?: AssetTreeNode[];
}

/** The asset tree of a namespace, stored verbatim (`[]` when unset). */
export type AssetTree = AssetTreeNode[];

/** The documented field types of the data model (the server stores whatever was written). */
export type DataModelFieldType = 'string' | 'number' | 'boolean' | 'datetime' | 'array' | 'object';

/**
 * One entry of the data model taxonomy (`GET /data_filters_taxonomy/…`), stored verbatim (`[]` when unset,
 * USI-P2-9).
 *
 * Spec defect: the spec types `type` as a closed enum and omits `label` and `enabledForLLM`; the server stores any
 * value.
 */
export interface DataModelField {
  /** Dot path (for example `"user.name"`), or `"data_models"` for the entry that carries the model definitions. */
  key: string;
  type?: DataModelFieldType | (string & {});
  label?: string;
  visible?: boolean;
  showInFilters?: boolean;
  showInTagPairingApp?: boolean;
  enabledForLLM?: boolean;
  computed?: boolean;
  validation?: Record<string, unknown>;
  dateAdded?: number | null;
  dateChanged?: number | null;
  /** Only on the entry whose `key` is `"data_models"`. */
  data?: DataModelDefinition[];
  [key: string]: unknown;
}

/** One data model definition (inside the `data_models` taxonomy entry). */
export interface DataModelDefinition {
  id?: number;
  key: string;
  name?: string;
  displayKey?: string | null;
  primaryKey?: string | null;
  defaults?: Record<string, unknown>;
  properties?: DataModelField[];
  /** JSON Schema draft-07. */
  schema?: Record<string, unknown>;
  dateAdded?: number | null;
  dateChanged?: number | null;
  [key: string]: unknown;
}

// ─── Declared locations ─────────────────────────────────────────────────────────────────────────────────────────

/** How a declared location was obtained (not enforced by the server). */
export type DeclaredLocationSource =
  'poi' | 'map' | 'api' | 'rfid' | 'qr' | 'nfc' | 'mobile_gps' | 'manual';

/** Which client declared the location (not enforced by the server). */
export type DeclaredVia = 'rt_tracker_ui' | 'pairing_tool' | 'rtls-api' | 'mobile_app';

/** A manually declared asset location. */
export interface DeclaredLocation {
  /** −90..90. */
  lat: number;
  /** −180..180. */
  lng: number;
  /** Integer −10..200. */
  level?: number;
  source?: DeclaredLocationSource;
  map_uuid?: string;
  venue_id?: number;
  poi_id?: number;
  poi_name?: string;
  device_id?: string;
  device_name?: string;
  declared_by?: string;
  declared_via?: DeclaredVia;
  external_reference?: string;
}

/** The error codes of the declared-location routes. */
export type DeclaredLocationErrorCode =
  | 'DL_002'
  | 'DL_004'
  | 'DL_005'
  | 'DL_007'
  | 'DL_010'
  | 'DL_011'
  | 'DL_012'
  | 'DL_013'
  | 'DL_014'
  | 'DL_016'
  | 'DL_017';

/** One asset of a bulk declare: by MAC or by external id, with its own location or the shared one. */
export interface BulkDeclareItem {
  mac_address?: string;
  external_id?: string;
  declared_location?: DeclaredLocation;
}

/** Body of `POST /assets/{namespace}/bulk-declare`. */
export interface BulkDeclareRequest {
  /** 1..500 items. */
  assets: BulkDeclareItem[];
  /** Used by the items without their own `declared_location`. */
  shared_location?: DeclaredLocation;
  /** Default `false`; `true` creates permanent virtual assets for unknown external ids. */
  auto_create_virtual_assets?: boolean;
  /** Model of auto-created virtual assets; default `"UNKNOWN"`. */
  default_asset_model?: string;
}

/** Answer of a bulk declare (always `200`; per-item failures in `errors`). */
export interface BulkDeclareResult {
  success: number;
  failed: number;
  created: number;
  errors: { identifier: string; error: DeclaredLocationErrorCode; message: string }[];
}

/** Body of `POST /assets/{namespace}/bulk-clear-declared`: at least one non-empty list, 500 entries in total. */
export interface BulkClearRequest {
  mac_addresses?: string[];
  external_ids?: string[];
}

/** Answer of a bulk clear. */
export interface BulkClearResult {
  success: number;
  failed: number;
  results: {
    mac_address: string;
    status: 'cleared' | 'error';
    error?: 'DL_017';
    message?: string;
  }[];
}

// ─── Tag actions ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The actions a tag can receive. Spec defect: the spec lists 5 of the 11 values the server accepts.
 * `ptlBlue`, `ptlYellow`, `ptlWhite`, `ptlCyan`, `ptlMagenta` and `ptlAquamarine` are ESL-only.
 */
export type TagActionType =
  | 'ptlRed'
  | 'ptlGreen'
  | 'ptlBlue'
  | 'ptlYellow'
  | 'ptlWhite'
  | 'ptlCyan'
  | 'ptlMagenta'
  | 'ptlAquamarine'
  | 'uwbBlink'
  | 'ptlRedUwbBlink'
  | 'ptlGreenUwbBlink';

/**
 * One tag action. Spec defect: the spec omits `duration`.
 */
export interface TagAction {
  macAddress: string;
  action: TagActionType;
  /** Seconds, integer 1..3600 (ESL blink duration). */
  duration?: number;
}

/** The outcome of one action. */
export interface TagActionResult {
  action: TagActionType;
  success: boolean;
  count: number;
  statusCode: number;
  error?: string;
  response?: unknown;
  instances?: unknown[];
}

/**
 * Answer of `POST /tag-actions/{appNamespace}`. Spec defect: the spec types `results` as an object and omits `success`
 * (USI-P2-8); a partial failure answers `500` with this same body, which `tagActions.send` resolves.
 */
export interface TagActionsResponse {
  message: string;
  tagCount: number;
  results: TagActionResult[];
  success: boolean;
}

// ─── Asset documents ────────────────────────────────────────────────────────────────────────────────────────────

/** The file types a document can have (the declared part type; it must match the file's magic number). */
export type DocumentContentType =
  'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | 'application/pdf';

/** The renditions of a document: images get all three, PDFs `original` and a one-page PDF `thumbnail`. */
export type DocumentVersion = 'original' | 'medium' | 'thumbnail';

/** The state of an upload job. */
export type DocumentJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

/** The virus-scan state of an uploaded document. */
export type VirusScanStatus = 'clean' | 'infected' | 'unscanned' | 'scan_failed';

/** Answer `202` of an upload. Spec defect: the spec declares no schema. `documentId` is `"doc-"` + a UUID v4. */
export interface DocumentUploadJobCreated {
  jobId: string;
  documentId: string;
  status: 'pending';
  message: string;
}

/** The document a completed upload job produced. */
export interface DocumentUploadResult {
  documentId: string;
  namespaceId: string;
  mac_address: string;
  docType: string;
  originalFilename: string;
  sizeBytes: number;
  contentType: string;
  availableVersions: DocumentVersion[];
  createdAt: string;
  virus_scan_status?: VirusScanStatus;
  virus_scan_date?: string | null;
  virus_scan_engine?: string | null;
}

/** An upload job (`GET …/documents/jobs/{jobId}`); `error` is reduced to its `message` by the SDK. */
export interface DocumentUploadJob {
  jobId: string;
  status: DocumentJobStatus;
  /** 0, 10, 20, 40, 90 or 100. */
  progress: number;
  result?: DocumentUploadResult | null;
  error?: { message: string } | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  duration_ms?: number | null;
}

/** One entry of a document list. */
export interface AssetDocumentSummary {
  documentId: string;
  docType: string;
  originalFilename: string;
  description: string | null;
  tags: string[];
  contentType: string;
  sizeBytes: number;
  /** `[]` while pending, or forever when processing failed (USI-P2-14). */
  availableVersions: DocumentVersion[];
  uploadedBy: { userId?: string; username?: string };
  createdAt: string;
}

/**
 * The metadata of one document. Spec defect: the spec documents `virus_scan_*` fields the server does not return
 * (USI-P2-12).
 */
export interface AssetDocument extends AssetDocumentSummary {
  namespaceId: string;
  mac_address: string;
  updatedAt: string;
}

/** Answer of a document delete (a soft delete). Spec defect: the spec declares no schema. */
export interface DocumentDeleteResult {
  message: string;
  documentId: string;
}

/** Input of `assetDocuments.upload`. */
export interface DocumentUploadInput {
  /** The bytes (a Node `Buffer` is a `Uint8Array`), a `Blob` or a `File`. */
  file: Blob | ArrayBuffer | Uint8Array;
  /** Wins over `File.name`; required unless `file` is a `File` with a name. */
  filename?: string;
  /** Default: `Blob.type` when allowed, else derived from the extension. */
  contentType?: DocumentContentType;
  /** `^[A-Za-z0-9_-]+$`. */
  docType: string;
  description?: string;
  /** Sent comma-separated, so a tag cannot contain `,`. */
  tags?: string[];
}

/** One page of `assetDocuments.listPage` (newest first; the server offers no sort option). */
export interface ListDocumentsPageOptions {
  docType?: string;
  /** Integer 1..500; server default 50. */
  limit?: number;
  /** Integer >= 0; default 0. */
  offset?: number;
}

/** Options of `assetDocuments.list` (every page). */
export interface ListDocumentsOptions {
  docType?: string;
  /** Stops after this many documents (a positive integer). */
  maxItems?: number;
}

/** Options of `assetDocuments.waitForJob`. */
export interface WaitForJobOptions {
  /** Integer >= 250; default 1000. */
  intervalMs?: number;
  /** Integer > 0; default 120 000. */
  maxWaitMs?: number;
}
