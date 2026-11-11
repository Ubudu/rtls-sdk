/**
 * ETL imports (`client.etl`): mapping profiles with the server's optimistic lock, a file's header preview,
 * dry-run and writing imports through `transport.upload`, and the activity log. Imports update **existing** assets
 * only; every type is hand-written from server truth (`src/types/etl.ts`).
 *
 * @module resources/etl
 */
import type { BaseClient, RequestOptions } from '../client/base';
import { ResourceBase } from '../client/resource';
import type { CallContext } from '../context';
import { ValidationError } from '../errors';
import type { Page } from '../types';
import type {
  EtlActivity,
  EtlActivityIterateQuery,
  EtlActivityQuery,
  EtlFileInput,
  EtlMappingProfile,
  EtlMappingProfileInput,
  EtlMappingProfileUpdate,
  EtlSheetPreview,
  EtlUploadOptions,
  EtlUploadResult,
} from '../types/etl';
import { splitCallOptions } from '../utils/args';
import { toFormFile } from '../utils/files';
import { paginatePages } from '../utils/pagination';
import { toEpochMs } from '../utils/time';

/** Default timeout of `upload()`: imports are synchronous and may run long (USI-P7-19). `0` disables it. */
const UPLOAD_TIMEOUT_MS = 600_000;
/** Default timeout of `parseHeaders()`. */
const PARSE_TIMEOUT_MS = 120_000;
/** Default `pageSize` of `activities.iterate()`. */
const ITERATE_PAGE_SIZE = 100;

/**
 * Accepted file extensions and the MIME type sent for each (a table, not a switch, so that one live call covers
 * the code path). The server picks its parser from the MIME type and a case-sensitive name check (USI-P7-3,
 * USI-P7-5), so the SDK lower-cases the extension and sets the type itself.
 */
const FILE_TYPES = {
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
} as const;

/** UTF-8 byte order mark, which the server's CSV import does not strip (USI-P7-4). */
const UTF8_BOM = [0xef, 0xbb, 0xbf] as const;

/** Keys of `create()` bodies: nothing else is sent. */
const INPUT_KEYS = [
  'name',
  'mappings',
  'keyColumns',
  'applicationId',
  'description',
  'sourceType',
  'requiredFields',
  'defaults',
  'modelKey',
] as const;

/** Fields the server assigns on update; anything else (`_id`, `userId`, `created_at`, `__v`) is not sent. */
const ASSIGNABLE_KEYS = [
  'name',
  'description',
  'sourceType',
  'mappings',
  'keyColumns',
  'requiredFields',
  'defaults',
  'applicationId',
  'modelKey',
] as const;

/** Characters of an activity `search` that the SDK escapes, so that the text is matched literally (USI-P7-9). */
const REGEX_META = /[.*+?^${}()|[\]\\]/g;

/** Wire shape of `GET /etl/activities`. */
interface ActivitiesBody {
  activities: EtlActivity[];
  pagination: { total: number; page: number; limit: number; pages: number };
}

function invalid(message: string, field: string): ValidationError {
  return new ValidationError(message, undefined, { status: 0, details: [field] });
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function checkId(id: unknown): string {
  if (typeof id !== 'string' || id === '') throw invalid('id must be a non-empty string', 'id');
  return id;
}

function checkPositiveInteger(value: unknown, field: string): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw invalid(`${field} must be an integer >= 1`, field);
  }
}

function checkProfileIds(ids: unknown): string[] {
  const list: unknown = typeof ids === 'string' ? [ids] : ids;
  if (!Array.isArray(list) || list.length === 0) {
    throw invalid('mappingProfileIds must be a non-empty id or array of ids', 'mappingProfileIds');
  }
  for (const id of list) {
    if (typeof id !== 'string' || id === '') {
      throw invalid('mappingProfileIds must contain non-empty strings only', 'mappingProfileIds');
    }
  }
  return list as string[];
}

/** The optimistic-lock value, always as an ISO string with millisecond precision. */
function lockValue(value: string | Date | number): string {
  let ms: number;
  try {
    ms = toEpochMs(value);
  } catch {
    throw invalid(
      'updated_at must be a valid Date, epoch milliseconds or a date string',
      'updated_at'
    );
  }
  const date = new Date(ms);
  if (Number.isNaN(date.getTime()))
    throw invalid('updated_at is out of the Date range', 'updated_at');
  return date.toISOString();
}

/** The name and the bytes of an {@link EtlFileInput} (the first step of `appendFilePart`). */
function fileSource(file: EtlFileInput): { source: Blob; name: string } {
  if (typeof file === 'object' && file !== null && 'data' in file) {
    const { data, filename } = file as { data: unknown; filename: unknown };
    if (typeof filename !== 'string' || filename === '') {
      throw invalid('file.filename must be a non-empty string', 'file');
    }
    // A string is CSV text (UTF-8); bytes and Blobs go through the shared `toFormFile` normaliser (copies views).
    const source =
      typeof data === 'string'
        ? new Blob([data])
        : toFormFile({ data: data as Blob | ArrayBuffer | ArrayBufferView, filename }).blob;
    return { source, name: filename };
  }
  if (file instanceof Blob) {
    // A name check instead of `instanceof File`, which fails for cross-realm values.
    const name: unknown = (file as { name?: unknown }).name;
    if (typeof name === 'string' && name !== '') return { source: file, name };
    throw invalid('A Blob needs a name: pass a File or { data, filename }', 'file');
  }
  throw invalid('file must be a File or { data, filename }', 'file');
}

/**
 * The multipart file part of an upload or a header preview: the extension is lower-cased and
 * must be `csv`, `xlsx` or `xls`; the MIME type comes from it; a leading UTF-8 BOM is dropped from CSV. Nothing else
 * in the content is changed (no blank-line or delimiter rewriting, USI-P7-17, USI-P7-20).
 */
async function appendFilePart(form: FormData, file: EtlFileInput): Promise<void> {
  const { source, name } = fileSource(file);
  const dot = name.lastIndexOf('.');
  const ext = dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
  if (!hasOwn(FILE_TYPES, ext)) {
    throw invalid('file name must end with .csv, .xlsx or .xls', 'file');
  }
  const type = FILE_TYPES[ext as keyof typeof FILE_TYPES];
  let bytes = source;
  if (ext === 'csv') {
    const head = new Uint8Array(await source.slice(0, 3).arrayBuffer());
    if (head.length === 3 && UTF8_BOM.every((byte, i) => head[i] === byte)) bytes = source.slice(3);
  }
  form.append('file', new Blob([bytes], { type }), `${name.slice(0, dot + 1)}${ext}`);
}

/**
 * Mapping profiles: how the columns of a file map to asset fields, and which source columns identify the asset of
 * a row (`client.etl.mappingProfiles`).
 */
export class EtlMappingProfilesResource extends ResourceBase {
  /**
   * The profiles whose `applicationId` is the namespace (`GET /etl/mappings?applicationId=…`). No paging: the
   * server returns every match.
   *
   * @param options per-call `namespace` (else the client default) and request options
   * @throws {ContextError} when no namespace is given or set (nothing is sent)
   * @example
   * ```typescript
   * const profiles = await client.etl.mappingProfiles.list();
   * const withoutKeys = profiles.filter((p) => p.keyColumns.length === 0);
   * ```
   */
  async list(options?: CallContext & RequestOptions): Promise<EtlMappingProfile[]> {
    const { ctx, request } = splitCallOptions(options);
    return await this.transport.request<EtlMappingProfile[]>('GET', '/etl/mappings', {
      query: { applicationId: this.ns(ctx) },
      ...request,
    });
  }

  /**
   * Every profile visible to the caller, whatever its `applicationId` (`GET /etl/mapping-profiles`). The namespace
   * is not used.
   *
   * @example
   * ```typescript
   * const all = await client.etl.mappingProfiles.listAll();
   * ```
   */
  async listAll(options?: CallContext & RequestOptions): Promise<EtlMappingProfile[]> {
    const { request } = splitCallOptions(options);
    return await this.transport.request<EtlMappingProfile[]>('GET', '/etl/mapping-profiles', {
      ...request,
    });
  }

  /**
   * One profile by id (`GET /etl/mapping-profiles/{id}`). The namespace is not used.
   *
   * @throws {ValidationError} status 0 for an empty id (nothing is sent)
   * @throws {NotFoundError} when the profile is absent or not visible to the caller
   * @example
   * ```typescript
   * const profile = await client.etl.mappingProfiles.get('64b0c0ffee0000000000abcd');
   * ```
   */
  async get(id: string, options?: CallContext & RequestOptions): Promise<EtlMappingProfile> {
    const profileId = checkId(id);
    const { request } = splitCallOptions(options);
    return await this.transport.request<EtlMappingProfile>('GET', '/etl/mapping-profiles/{id}', {
      params: { id: profileId },
      ...request,
    });
  }

  /**
   * Creates a profile (`POST /etl/mapping-profiles`, 201). Only the keys of {@link EtlMappingProfileInput} are sent;
   * `applicationId` is `input.applicationId`, else the per-call namespace, else the client default. Not idempotent
   * (duplicate names are allowed).
   *
   * @throws {ValidationError} status 0 when `name` is empty after trimming or `mappings` is not a plain object
   * @throws {ContextError} when neither `input.applicationId` nor a namespace is given (nothing is sent)
   * @throws {AuthorizationError} `apiCode: 'namespace_access_denied'` when the key does not hold the namespace
   * @example
   * ```typescript
   * const profile = await client.etl.mappingProfiles.create({
   *   name: 'Badge names',
   *   mappings: {
   *     user_udid: { sourceColumn: 'MAC', required: true },
   *     user_name: { sourceColumn: 'Name', transformation: 'trim' },
   *   },
   *   keyColumns: ['MAC'],
   * });
   * ```
   */
  async create(
    input: EtlMappingProfileInput,
    options?: CallContext & RequestOptions
  ): Promise<EtlMappingProfile> {
    if (typeof input !== 'object' || input === null)
      throw invalid('input must be an object', 'input');
    if (typeof input.name !== 'string' || input.name.trim() === '') {
      throw invalid('name must be a non-empty string', 'name');
    }
    if (!isPlainObject(input.mappings))
      throw invalid('mappings must be a plain object', 'mappings');
    const { ctx, request } = splitCallOptions(options);
    const body: Record<string, unknown> = {};
    for (const key of INPUT_KEYS) {
      if (input[key] !== undefined) body[key] = input[key];
    }
    // An explicit applicationId wins; an empty one counts as not given (the server must never see an empty target).
    if (typeof input.applicationId !== 'string' || input.applicationId === '') {
      body.applicationId = this.ns(ctx);
    }
    return await this.transport.request<EtlMappingProfile>('POST', '/etl/mapping-profiles', {
      body,
      ...request,
    });
  }

  /**
   * Updates a profile (`PUT /etl/mapping-profiles/{id}`). Each given top-level field replaces the stored one
   * (`mappings` wholesale, no deep merge). Pass the `updated_at` you read for the optimistic lock: a stale value
   * fails with 409 `ConflictError` (`apiCode: 'stale_write'`, the stored profile in `body.current`) and writes
   * nothing. A full profile value is accepted: only the assignable fields are sent. `applicationId` is never added
   * from the namespace (no silent retarget).
   *
   * @throws {ValidationError} status 0 for an empty id, an empty `name` or an unreadable `updated_at`
   * @throws {ConflictError} 409 when `updated_at` differs from the stored value
   * @example
   * ```typescript
   * import { ConflictError } from 'ubudu-rtls-sdk';
   *
   * const profile = await client.etl.mappingProfiles.get('64b0c0ffee0000000000abcd');
   * try {
   *   await client.etl.mappingProfiles.update(profile._id, {
   *     description: 'Nightly badge import',
   *     updated_at: profile.updated_at,
   *   });
   * } catch (err) {
   *   if (err instanceof ConflictError) console.log('changed by someone else; read it again');
   *   else throw err;
   * }
   * ```
   */
  async update(
    id: string,
    changes: EtlMappingProfileUpdate,
    options?: CallContext & RequestOptions
  ): Promise<EtlMappingProfile> {
    const profileId = checkId(id);
    if (typeof changes !== 'object' || changes === null) {
      throw invalid('changes must be an object', 'changes');
    }
    const body: Record<string, unknown> = {};
    for (const key of ASSIGNABLE_KEYS) {
      if (hasOwn(changes, key) && changes[key] !== undefined) body[key] = changes[key];
    }
    if (typeof body.name === 'string' && body.name.trim() === '') {
      throw invalid('name must not be empty', 'name');
    }
    if (changes.updated_at !== undefined) body.updated_at = lockValue(changes.updated_at);
    const { request } = splitCallOptions(options);
    return await this.transport.request<EtlMappingProfile>('PUT', '/etl/mapping-profiles/{id}', {
      params: { id: profileId },
      body,
      ...request,
    });
  }

  /**
   * Deletes a profile (`DELETE /etl/mapping-profiles/{id}`, 204). Creator only. Rows stored by earlier writing
   * imports are not removed (USI-P7-15).
   *
   * @throws {ValidationError} status 0 for an empty id (nothing is sent)
   * @throws {AuthorizationError} 403 when the caller did not create the profile
   * @example
   * ```typescript
   * await client.etl.mappingProfiles.delete('64b0c0ffee0000000000abcd');
   * ```
   */
  async delete(id: string, options?: CallContext & RequestOptions): Promise<void> {
    const profileId = checkId(id);
    const { request } = splitCallOptions(options);
    await this.transport.request<unknown>('DELETE', '/etl/mapping-profiles/{id}', {
      params: { id: profileId },
      ...request,
    });
  }
}

/**
 * The ETL activity log (`client.etl.activities`): one entry per profile change and per upload, typed from the
 * returned entries (USI-P7-10). The namespace is not used.
 */
export class EtlActivitiesResource extends ResourceBase {
  /**
   * One page of entries (`GET /etl/activities`), normalised to `Page<EtlActivity>`. Only the query keys that are
   * set are sent; `search` is literal text (USI-P7-9).
   *
   * @throws {ValidationError} status 0 when `page` or `limit` is not an integer >= 1 (nothing is sent)
   * @example
   * ```typescript
   * const page = await client.etl.activities.listPage({ action: 'upload', limit: 20 });
   * for (const entry of page.data) {
   *   if (entry.action === 'upload') console.log(entry.details.processingStats?.totalErrors);
   * }
   * ```
   */
  async listPage(
    query?: EtlActivityQuery,
    options?: CallContext & RequestOptions
  ): Promise<Page<EtlActivity>> {
    const q = query ?? {};
    if (q.page !== undefined) checkPositiveInteger(q.page, 'page');
    if (q.limit !== undefined) checkPositiveInteger(q.limit, 'limit');
    const sent: Record<string, string | number> = {};
    if (q.page !== undefined) sent.page = q.page;
    if (q.limit !== undefined) sent.limit = q.limit;
    if (q.sortField !== undefined) sent.sortField = q.sortField;
    if (q.sortOrder !== undefined) sent.sortOrder = q.sortOrder;
    if (q.search !== undefined) sent.search = q.search.replace(REGEX_META, '\\$&');
    if (q.action !== undefined) sent.action = q.action;
    if (q.resourceType !== undefined) sent.resourceType = q.resourceType;
    const { request } = splitCallOptions(options);
    const { activities, pagination } = await this.transport.request<ActivitiesBody>(
      'GET',
      '/etl/activities',
      { query: sent, ...request }
    );
    const { page, limit, total, pages } = pagination;
    return {
      data: activities,
      pagination: {
        page,
        limit,
        total,
        totalPages: pages,
        hasNext: page < pages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Every entry, page after page (`pageSize` per request, default 100, never sent as such). Lazy: the next page is
   * fetched when the consumer pulls past the current one; stops when `pagination.hasNext` is false. Bound it with
   * `collectAll(…, { maxItems })`.
   *
   * @throws {ValidationError} status 0, on the first `next()`, when `pageSize` is not an integer >= 1
   * @example
   * ```typescript
   * import { collectAll } from 'ubudu-rtls-sdk';
   *
   * const uploads = await collectAll(client.etl.activities.iterate({ action: 'upload' }), { maxItems: 50 });
   * ```
   */
  iterate(
    query?: EtlActivityIterateQuery,
    options?: CallContext & RequestOptions
  ): AsyncIterableIterator<EtlActivity> {
    return this.walk(query, options);
  }

  private async *walk(
    query: EtlActivityIterateQuery | undefined,
    options: (CallContext & RequestOptions) | undefined
  ): AsyncGenerator<EtlActivity, void, undefined> {
    const { pageSize = ITERATE_PAGE_SIZE, ...rest } = query ?? {};
    checkPositiveInteger(pageSize, 'pageSize');
    yield* paginatePages<EtlActivity>(
      (page, limit) => this.listPage({ ...rest, page, limit }, options),
      { limit: pageSize, signal: options?.signal }
    );
  }
}

/**
 * Bulk updates of **existing** assets from CSV or Excel files (`client.etl`): mapping profiles, a file's header
 * preview, dry-run and writing imports, and the activity log. Assets are never created by an import.
 */
export class EtlResource extends ResourceBase {
  /** Mapping profiles (`client.etl.mappingProfiles`). */
  readonly mappingProfiles: EtlMappingProfilesResource;
  /** The activity log (`client.etl.activities`). */
  readonly activities: EtlActivitiesResource;

  /**
   * Public, so `new XResource(client)` keeps working; the client creates every resource, so the constructor is not
   * part of the documented surface.
   * @internal
   */
  constructor(client: BaseClient) {
    super(client);
    this.mappingProfiles = new EtlMappingProfilesResource(client);
    this.activities = new EtlActivitiesResource(client);
  }

  /**
   * The columns and up to 5 sample rows of a file (`POST /etl/parse-excel-headers`). Read-only: nothing is stored.
   * Default `timeoutMs` 120 000 (`0` disables it). Excel cells come back formatted, while the import reads raw
   * values (USI-P7-18). The namespace is not used.
   *
   * @param file a `File` or `{ data, filename }`; the extension (`.csv`, `.xlsx`, `.xls`) sets the MIME type
   * @throws {ValidationError} status 0 for a Blob without a name or an unsupported extension (nothing is sent)
   * @example
   * ```typescript
   * const preview = await client.etl.parseHeaders({ data: 'MAC,Name\n025d4b000001,Forklift 1\n', filename: 'badges.csv' });
   * console.log(preview.columns); // ['MAC', 'Name']
   * ```
   */
  async parseHeaders(
    file: EtlFileInput,
    options?: CallContext & RequestOptions
  ): Promise<EtlSheetPreview> {
    const form = new FormData();
    await appendFilePart(form, file);
    const { request } = splitCallOptions(options);
    return await this.transport.upload<EtlSheetPreview>('/etl/parse-excel-headers', form, {
      ...request,
      timeoutMs: request.timeoutMs ?? PARSE_TIMEOUT_MS,
    });
  }

  /**
   * Imports a file through one or more mapping profiles (`POST /etl/upload`, 201). Updates existing assets only;
   * each profile's `applicationId` is the target namespace (the per-call namespace is not used). Default
   * `timeoutMs` 600 000 (`0` disables it); never retried. A client timeout does not stop the server (USI-P7-19).
   *
   * A 201 is not success: `success` is always `true`; check `results.processedProfiles[].errors` and
   * `.unassociated` (USI-P7-2). With `dryRun: true` nothing is written and the counters mean "rows that passed
   * validation" (USI-P7-11).
   *
   * @param file a `File` or `{ data, filename }`; the extension (`.csv`, `.xlsx`, `.xls`) sets the MIME type and a
   *   leading UTF-8 BOM is dropped from CSV
   * @param mappingProfileIds one id or a non-empty array of ids
   * @throws {ValidationError} status 0 for an invalid file, empty ids or a `dryRun` that is not a boolean
   *   (nothing is sent)
   * @throws {NotFoundError} when one profile is absent or not visible (nothing is imported)
   * @example
   * ```typescript
   * const result = await client.etl.upload(
   *   { data: 'MAC,Name\n025d4b000001,Forklift 1\n', filename: 'badges.csv' },
   *   '64b0c0ffee0000000000abcd',
   *   { dryRun: true }
   * );
   * const failed = result.results.processedProfiles.filter((p) => p.errors.length > 0);
   * ```
   */
  async upload(
    file: EtlFileInput,
    mappingProfileIds: string | readonly string[],
    options?: EtlUploadOptions & CallContext & RequestOptions
  ): Promise<EtlUploadResult> {
    const ids = checkProfileIds(mappingProfileIds);
    const { request, rest } = splitCallOptions(options);
    // Fail closed: a non-boolean from untyped code would otherwise send debugMode false, a writing import.
    if (rest.dryRun !== undefined && typeof rest.dryRun !== 'boolean') {
      throw invalid('dryRun must be a boolean', 'dryRun');
    }
    const form = new FormData();
    form.append('mappingProfileIds', JSON.stringify(ids));
    form.append('debugMode', String(rest.dryRun === true));
    await appendFilePart(form, file);
    return await this.transport.upload<EtlUploadResult>('/etl/upload', form, {
      ...request,
      timeoutMs: request.timeoutMs ?? UPLOAD_TIMEOUT_MS,
    });
  }
}
