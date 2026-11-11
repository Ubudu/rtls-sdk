/**
 * ETL import types (`client.etl`). Hand-written from server truth: the spec's ETL schemas are wrong
 * (USI-P7-1), so nothing here is derived from the generated schema.
 *
 * @module types/etl
 */
import type { UploadFile } from '../utils/files';

/**
 * Transformation applied to a cell before it is written. Server truth; the spec does not describe it (USI-P7-1).
 * Numeric transforms write `0` for blank or unparseable cells and `toDate` stores epoch-ms numbers (USI-P7-12).
 */
export type EtlTransformation =
  | 'none'
  | 'trim'
  | 'toNumber'
  | 'toString'
  | 'toBoolean'
  | 'toDate'
  | 'toUpperCase'
  | 'toLowerCase'
  | 'toInteger'
  | 'toFloat'
  | 'round';

/** Source type stored on a profile; informational, imports never read it. */
export type EtlSourceType = 'excel' | 'csv' | 'api';

/**
 * Value of `mappings[targetPath]`, where targetPath is an asset path: `'user_name'`, `'external_id'`,
 * `'data.<field>'`. Server truth; the spec types mapping values as strings (USI-P7-1).
 */
export interface EtlFieldMapping {
  /** Source column name in the file. */
  sourceColumn: string;
  /** Default `'none'`. */
  transformation?: EtlTransformation;
  /** A row whose cell is missing or empty is rejected. */
  required?: boolean;
  /** `'date'`/`'datetime'` convert Excel serials; `'boolean'` reads true/false/yes/no/1/0. */
  type?: 'string' | 'number' | 'boolean' | 'date' | 'datetime' | (string & {});
  /** moment.js format for `toDate`, for example `'DD/MM/YYYY'`. */
  sourceFormat?: string;
}

/** Value of `defaults[targetPath]`: applied by a writing import when the field is `undefined`, `null` or `''`. */
export interface EtlFieldDefault {
  value: unknown;
  type?: string;
}

/**
 * A mapping profile as the server stores it. Server truth; the spec's MappingProfile schema is wrong: it lists
 * `createdBy`, `dateCreated` and `status` (none exist), makes `applicationId` required and types mapping values as
 * strings (USI-P7-1).
 */
export interface EtlMappingProfile {
  _id: string;
  name: string;
  description?: string;
  /** Informational. */
  sourceType: EtlSourceType;
  /** Target RTLS namespace of the profile's imports. */
  applicationId?: string;
  /** Keyed by target asset path; a string value is a legacy entry, ignored by imports. */
  mappings: Record<string, EtlFieldMapping | string>;
  /** SOURCE column names that identify the asset of a row (raw, case-sensitive match, USI-P7-16). */
  keyColumns: string[];
  /** Stored, not enforced (required-ness comes from `mappings[path].required`). */
  requiredFields: string[];
  /** Absent when empty: the server drops empty objects. */
  defaults?: Record<string, EtlFieldDefault>;
  /** Stored, not used. */
  modelKey?: string;
  /** Creator, assigned by the server. */
  userId: string;
  /** ISO date. */
  created_at: string;
  /** ISO date; pass it back to `update()` for the optimistic lock. */
  updated_at: string;
  __v?: number;
}

/**
 * Body of `mappingProfiles.create()`. Server truth; the spec's MappingProfile schema is wrong (USI-P7-1). Only these
 * keys are sent; `applicationId` defaults to the resolved namespace.
 */
export interface EtlMappingProfileInput {
  name: string;
  mappings: Record<string, EtlFieldMapping>;
  keyColumns?: string[];
  /** Default: the per-call namespace, else the client's default namespace. */
  applicationId?: string;
  description?: string;
  sourceType?: EtlSourceType;
  requiredFields?: string[];
  defaults?: Record<string, EtlFieldDefault>;
  modelKey?: string;
}

/**
 * Changes of `mappingProfiles.update()`. A full {@link EtlMappingProfile} value is assignable (read-modify-write);
 * only the assignable fields are sent, each top-level field replaces the stored one (no deep merge). Server truth;
 * the spec's MappingProfile schema is wrong (USI-P7-1).
 */
export interface EtlMappingProfileUpdate {
  name?: string;
  description?: string;
  sourceType?: EtlSourceType;
  mappings?: Record<string, EtlFieldMapping | string>;
  keyColumns?: string[];
  requiredFields?: string[];
  defaults?: Record<string, EtlFieldDefault>;
  applicationId?: string;
  modelKey?: string;
  /** Optimistic-lock precondition: the `updated_at` you read. Stale → 409 ConflictError. Omit to skip the check. */
  updated_at?: string | Date | number;
}

/** Body of the 409 `ConflictError` of a stale `update()`. The spec declares no 409 (USI-P7-1). */
export interface EtlStaleWriteBody {
  error: 'stale_write';
  current: EtlMappingProfile;
}

/**
 * Result of `parseHeaders()`: the first row's column names and up to 5 sample rows, as strings. Excel cells are
 * formatted values, while the import reads raw values (USI-P7-18).
 */
export interface EtlSheetPreview {
  columns: string[];
  sampleData: Array<Record<string, string>>;
}

/**
 * File input. A Blob must be a File (it needs a name); otherwise use the object form. CSV must be UTF-8,
 * comma-separated (USI-P7-17). The MIME type always comes from the extension (`csv`, `xlsx`, `xls`); the object
 * form's `contentType` and a File's own type are ignored.
 */
export type EtlFileInput = UploadFile | { data: string; filename: string };

/** Options of `upload()`. */
export interface EtlUploadOptions {
  /** true → server dry run (`debugMode`): no store or asset writes; counters mean "rows that passed validation". Default false. */
  dryRun?: boolean;
}

/** One error of a profile's import; profile-level errors have no `rowIndex`. */
export interface EtlRowError {
  /** 1-based data row (the header row excluded); absent for profile-level errors. */
  rowIndex?: number;
  message: string;
}

/**
 * Outcome of one profile in an upload. On a dry run every valid row counts in `rowsChanged` and `unassociated` is
 * always 0 (USI-P7-11); `rowsSkipped` mixes "no change" with "missing key column" (USI-P7-13).
 */
export interface EtlProfileResult {
  profileId: string;
  profileName: string;
  /** Number of data rows in the file. */
  rowsProcessed: number;
  rowsChanged: number;
  rowsSkipped: number;
  /** Rows that matched no asset (assets are never created). */
  unassociated: number;
  errors: EtlRowError[];
}

/**
 * 201 body of `upload()`. Server truth; the spec's UploadResult shape does not exist (USI-P7-1). A 201 is not
 * success: file and row failures appear only in `results.processedProfiles[].errors` (USI-P7-2).
 */
export interface EtlUploadResult {
  /** Upload id, the `resourceId` of the activity entry. */
  _id: string;
  filename: string;
  /** Always 'completed' in a 201 (USI-P7-2). */
  status: 'completed' | (string & {});
  userId: string;
  /** Always true in a 201. NOT an outcome signal: inspect results.processedProfiles[].errors / unassociated. */
  success: boolean;
  debugMode: boolean;
  results: { totalRows: number; debugMode: boolean; processedProfiles: EtlProfileResult[] };
  created_at: string;
}

/** Action of an activity entry. Server truth; the spec lists `import`/`export`, which never occur (USI-P7-10). */
export type EtlActivityAction = 'create' | 'update' | 'delete' | 'upload';

/** Counters stored on an upload activity entry when the upload completes. */
export interface EtlProcessingStats {
  totalRows: number;
  totalProcessed: number;
  totalChanged: number;
  totalSkipped: number;
  totalUnassociated: number;
  totalErrors: number;
  debugMode: boolean;
  /** Milliseconds. */
  processingTime: number;
}

/** Fields shared by every activity entry. */
interface EtlActivityBase {
  _id: string;
  userId: string;
  /** Upload id or profile id. */
  resourceId: string;
  /** ISO date. */
  timestamp: string;
  __v?: number;
}

/**
 * Activity entry of a profile change. Server truth; the spec's resource types `asset`/`location` never occur
 * (USI-P7-10).
 */
export interface EtlProfileActivity extends EtlActivityBase {
  action: 'create' | 'update' | 'delete';
  resourceType: 'mapping';
  /** `applicationId` is absent on entries older than rtls-api 2.26.0. */
  details: { name: string; applicationId?: string };
}

/** `details` of an upload activity entry. The spec does not describe it (USI-P7-1). */
export interface EtlUploadActivityDetails {
  filename: string;
  status: 'processing' | 'completed' | 'failed';
  debugMode: boolean;
  uploadId: string;
  applicationId?: string | null;
  applicationIds?: string[];
  /** Comma-separated profile names. */
  mappingProfiles?: string;
  mappingProfileIds?: string[];
  filesize?: number;
  processingStats?: EtlProcessingStats;
  /** Set when `status` is `'failed'`. */
  error?: string;
  /** Stored raw copy of the upload result (uses `processingErrors`); intentionally untyped, read the upload response instead. */
  uploadResults?: unknown;
}

/** Activity entry of an upload (dry run or writing). Server truth; spec enums are wrong (USI-P7-10). */
export interface EtlUploadActivity extends EtlActivityBase {
  action: 'upload';
  resourceType: 'file';
  details: EtlUploadActivityDetails;
}

/** One activity entry; narrow on `action` (or `resourceType`). Server truth (USI-P7-1, USI-P7-10). */
export type EtlActivity = EtlProfileActivity | EtlUploadActivity;

/**
 * Query of `activities.listPage()`. The SDK validates `page`/`limit` before sending and sends `search` as literal
 * text (USI-P7-9).
 */
export interface EtlActivityQuery {
  /** Integer ≥ 1. */
  page?: number;
  /** Integer ≥ 1. */
  limit?: number;
  /** Default `'timestamp'`. */
  sortField?: 'timestamp' | 'action' | 'resourceType' | (string & {});
  /** Anything but `'asc'` sorts descending. */
  sortOrder?: 'asc' | 'desc';
  /** Literal text (USI-P7-9). Matches details.name, resourceType, action (not filenames). */
  search?: string;
  action?: EtlActivityAction;
  resourceType?: 'mapping' | 'file';
}

/** Query of `activities.iterate()`: the filters of {@link EtlActivityQuery} plus `pageSize` (default 100, never sent). */
export type EtlActivityIterateQuery = Omit<EtlActivityQuery, 'page' | 'limit'> & {
  /** Integer ≥ 1; default 100. */
  pageSize?: number;
};
