/**
 * Asset records (`client.assets`): list, get, create (upsert), update (merge patch), delete, batch writes
 * and the audit trail of a record. Every MAC the SDK sends, in the path or in a body, is normalised to 12 lowercase
 * hex characters; local checks throw `ValidationError` (status 0) before any request.
 *
 * @module resources/assets
 */
import type { RequestOptions } from '../client/base';
import { ResourceBase } from '../client/resource';
import type { CallContext } from '../context';
import { NotFoundError, ValidationError } from '../errors';
import type { FilterOptions, LocalQuery } from '../types';
import type {
  Asset,
  AssetHistoryEntry,
  AssetHistoryOptions,
  AssetInput,
  AssetPatch,
  BatchDeleteResult,
  BatchSaveItem,
  ListAssetsOptions,
  ListAssetsParams,
} from '../types/assets';
import { applyFilters, normalizeMac, resolveTimeRange, splitCallOptions } from '../utils';

const LIST_LIMIT_MAX = 1000;

function invalid(message: string, field: string): ValidationError {
  return new ValidationError(message, undefined, { status: 0, details: [field] });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

/** `normalizeMac` with the field named in the message and in `details`. */
function macOf(value: unknown, field: string): string {
  if (typeof value !== 'string') throw invalid(`${field} must be a MAC address string`, field);
  try {
    return normalizeMac(value);
  } catch (err) {
    throw invalid(`${field}: ${(err as Error).message}`, field);
  }
}

/** The legacy positional namespace folded into the options bag (the positional value wins). */
function withNamespace(
  namespace: string,
  requestOptions?: RequestOptions
): CallContext & RequestOptions {
  return { ...requestOptions, namespace };
}

/** `user_udid`, when given, must be the asset's MAC (compared after normalisation). */
function checkUdid(value: unknown, mac: string, field: string): void {
  if (value === undefined) return;
  if (macOf(value, field) !== mac) {
    throw invalid(`${field} must equal the asset MAC ${mac}`, field);
  }
}

function checkInput(asset: unknown, mac: string): asserts asset is AssetInput {
  if (!isPlainObject(asset)) throw invalid('asset must be an object', 'asset');
  if (!isNonEmptyString(asset.user_name)) {
    throw invalid('asset.user_name is required and must be a non-empty string', 'user_name');
  }
  if (asset.data !== undefined && !isPlainObject(asset.data)) {
    throw invalid('asset.data must be an object', 'data');
  }
  checkUdid(asset.user_udid, mac, 'user_udid');
}

function checkPatch(patch: unknown, mac: string): asserts patch is AssetPatch {
  if (!isPlainObject(patch)) throw invalid('patch must be an object', 'patch');
  if (patch.user_name !== undefined && !isNonEmptyString(patch.user_name)) {
    throw invalid('patch.user_name must be a non-empty string', 'user_name');
  }
  checkUdid(patch.user_udid, mac, 'user_udid');
  if (patch.data !== undefined && patch.data !== null && !isPlainObject(patch.data)) {
    throw invalid('patch.data must be an object or null', 'data');
  }
}

function checkBatchItem(item: unknown, index: number): BatchSaveItem {
  const at = `assets[${index}]`;
  if (!isPlainObject(item)) throw invalid(`${at} must be an object`, at);
  if (item.user_udid === undefined) {
    throw invalid(`${at}.user_udid is required (it is the asset key)`, `${at}.user_udid`);
  }
  const udid = macOf(item.user_udid, `${at}.user_udid`);
  if (!isNonEmptyString(item.user_name)) {
    throw invalid(`${at}.user_name is required and must be a non-empty string`, `${at}.user_name`);
  }
  if (item.data !== undefined && !isPlainObject(item.data)) {
    throw invalid(`${at}.data must be an object`, `${at}.data`);
  }
  return { ...(item as BatchSaveItem), user_udid: udid };
}

function checkPageNumber(value: unknown, field: 'page' | 'limit', max?: number): void {
  if (value === undefined) return;
  const ok =
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    (max === undefined || value <= max);
  if (!ok) {
    const range = max === undefined ? 'an integer >= 1' : `an integer from 1 to ${max}`;
    throw invalid(`${field} must be ${range}, not ${String(value)}`, field);
  }
}

/** What `list` sends (`key`/`value` only) and what it evaluates locally afterwards. */
function listPlan(options: Record<string, unknown>): {
  query: Record<string, string>;
  local: LocalQuery;
} {
  const { key, value, filters, page, limit, sort, fields } = options;
  if ((key === undefined) !== (value === undefined)) {
    const missing = key === undefined ? 'key' : 'value';
    throw invalid('key and value must be given together', missing);
  }
  const query: Record<string, string> = {};
  if (key !== undefined) {
    if (!isNonEmptyString(key)) throw invalid('key must be a non-empty string', 'key');
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      throw invalid('value must be a string, a number or a boolean', 'value');
    }
    query.key = key;
    query.value = String(value);
  }
  checkPageNumber(page, 'page');
  checkPageNumber(limit, 'limit', LIST_LIMIT_MAX);
  if (filters !== undefined && !isPlainObject(filters)) {
    throw invalid('filters must be an object of "field:op" keys', 'filters');
  }
  const merged: Record<string, unknown> = {};
  for (const [name, filterValue] of Object.entries(options)) {
    if (name.includes(':')) merged[name] = filterValue;
  }
  Object.assign(merged, filters);
  const local: LocalQuery = {};
  if (Object.keys(merged).length > 0) local.filters = merged as FilterOptions;
  if (sort !== undefined) local.sort = sort as LocalQuery['sort'];
  if (fields !== undefined) local.fields = fields as LocalQuery['fields'];
  if (page !== undefined) local.page = page as number;
  if (limit !== undefined) local.limit = limit as number;
  // Dry run on no items: rejects a bad filter, sort or fields before any request.
  applyFilters([], local);
  return { query, local };
}

/**
 * Asset records of a namespace.
 *
 * The 0.2.0 positional forms with an explicit namespace first (`get('ns', mac)`, `list('ns', options)`) keep working;
 * the per-call `{ namespace }` option is the current form.
 */
export class AssetsResource extends ResourceBase {
  // ─── list / iterate / getAll ─────────────────────────────────────────────────────────────────────────────────

  /**
   * Lists the assets of the namespace (`GET /assets/{app_namespace}`).
   *
   * The server returns the whole namespace and matches only `key`/`value` (an exact match on one field, dot paths
   * allowed); `page`, `limit`, `sort`, `fields` and the `"field:op"` filters are evaluated locally with the
   * server's universal-filter semantics (USI-P2-1), so only `key`/`value` are sent.
   *
   * With `fields`, each item holds only the selected fields (a projection), while the return type stays `Asset[]`:
   * `user_name` and the other fields not selected are then absent at run time.
   *
   * @param options `key` + `value` (server-side, both or neither), local `filters` / `"field:op"` keys (explicit
   *   `filters` win on the same key), `sort`, `fields`, `page` (integer >= 1), `limit` (integer 1..1000), per-call
   *   `namespace` and request options
   * @throws {ValidationError} status 0 for `key` without `value` (or the reverse), a bad `page`/`limit`, filter,
   *   `sort` or `fields` (nothing is sent)
   * @throws {ContextError} when no namespace is given or set
   * @example
   * ```typescript
   * import { createRtlsClient } from 'ubudu-rtls-sdk';
   *
   * const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace' });
   * const forklifts = await client.assets.list({ key: 'user_type', value: 'forklift' });
   * const firstTen = await client.assets.list({ 'user_name:contains': 'fork', sort: 'user_name:asc', limit: 10 });
   * console.log(forklifts.length, firstTen.length);
   * ```
   */
  async list(options?: ListAssetsParams): Promise<Asset[]>;
  /**
   * @deprecated since 0.3.0 — the 0.2.0 two-object form; pass `signal` / `timeoutMs` in `options`.
   */
  async list(
    options: ListAssetsParams | undefined,
    requestOptions: RequestOptions
  ): Promise<Asset[]>;
  /** Legacy form with the namespace first. */
  async list(
    namespace: string,
    options?: ListAssetsOptions,
    requestOptions?: RequestOptions
  ): Promise<Asset[]>;
  async list(
    arg1?: string | ListAssetsParams,
    arg2?: ListAssetsOptions | RequestOptions,
    arg3?: RequestOptions
  ): Promise<Asset[]> {
    return await this.listImpl(arg1, arg2, arg3);
  }

  /**
   * Yields the assets that {@link AssetsResource.list} returns, in order (one request).
   *
   * @throws {ValidationError} as `list`
   * @throws {ContextError} when no namespace is given or set
   * @example
   * ```typescript
   * for await (const asset of client.assets.iterate({ key: 'user_type', value: 'forklift' })) {
   *   console.log(asset.user_udid, asset.user_name);
   * }
   * ```
   */
  iterate(options?: ListAssetsParams): AsyncGenerator<Asset>;
  /** Legacy form with the namespace first. */
  iterate(namespace: string, options?: ListAssetsOptions): AsyncGenerator<Asset>;
  async *iterate(
    arg1?: string | ListAssetsParams,
    arg2?: ListAssetsOptions
  ): AsyncGenerator<Asset> {
    const assets = await this.listImpl(arg1, arg2);
    for (const asset of assets) yield asset;
  }

  /**
   * Same as {@link AssetsResource.list}.
   *
   * @deprecated since 0.3.0 — use `list()`.
   */
  async getAll(options?: ListAssetsParams, requestOptions?: RequestOptions): Promise<Asset[]>;
  /** @deprecated since 0.3.0 — use `list()`. */
  async getAll(
    namespace: string,
    options?: ListAssetsOptions,
    requestOptions?: RequestOptions
  ): Promise<Asset[]>;
  async getAll(
    arg1?: string | ListAssetsParams,
    arg2?: ListAssetsOptions | RequestOptions,
    arg3?: RequestOptions
  ): Promise<Asset[]> {
    return await this.listImpl(arg1, arg2, arg3);
  }

  private async listImpl(
    arg1?: string | ListAssetsParams,
    arg2?: ListAssetsOptions | RequestOptions,
    arg3?: RequestOptions
  ): Promise<Asset[]> {
    const legacy = typeof arg1 === 'string';
    const bag: ListAssetsParams | undefined = legacy
      ? { ...(arg2 as ListAssetsOptions | undefined), namespace: arg1 }
      : arg1;
    const trailing = legacy ? arg3 : (arg2 as RequestOptions | undefined);
    const { ctx, request, rest } = splitCallOptions<ListAssetsOptions>(bag, trailing);
    const { query, local } = listPlan(rest as Record<string, unknown>);
    const assets = await this.transport.request<Asset[]>('GET', '/assets/{app_namespace}', {
      params: { app_namespace: this.ns(ctx) },
      query,
      ...request,
    });
    // The query type has no `fields` key, so the items keep the `Asset` type (a projection is a partial asset).
    return applyFilters<Asset, Omit<LocalQuery, 'fields'>>(assets, local).data;
  }

  // ─── get ─────────────────────────────────────────────────────────────────────────────────────────────────────

  /**
   * Reads one asset (`GET /assets/{app_namespace}/{mac_address}`).
   *
   * @param macAddress the asset MAC, in any of the accepted forms (`AA:BB:CC:DD:EE:FF`, `aabbccddeeff`, …)
   * @param options per-call `namespace` and request options
   * @throws {ValidationError} status 0 for an invalid MAC
   * @throws {NotFoundError} 404 when no asset has this MAC
   * @throws {ContextError} when no namespace is given or set
   * @example
   * ```typescript
   * const asset = await client.assets.get('AA:BB:CC:DD:EE:FF');
   * console.log(asset.user_name);
   * ```
   */
  async get(macAddress: string, options?: CallContext & RequestOptions): Promise<Asset>;
  /** Legacy form with the namespace first. */
  async get(namespace: string, macAddress: string, requestOptions?: RequestOptions): Promise<Asset>;
  async get(
    arg1: string,
    arg2?: string | (CallContext & RequestOptions),
    arg3?: RequestOptions
  ): Promise<Asset> {
    const [macAddress, options] =
      typeof arg2 === 'string' ? [arg2, withNamespace(arg1, arg3)] : [arg1, arg2];
    const mac = macOf(macAddress, 'macAddress');
    const { ctx, request } = splitCallOptions(options);
    return await this.transport.request<Asset>('GET', '/assets/{app_namespace}/{mac_address}', {
      params: { app_namespace: this.ns(ctx), mac_address: mac },
      ...request,
    });
  }

  // ─── create ──────────────────────────────────────────────────────────────────────────────────────────────────

  /**
   * Creates the asset, or merges the fields into an existing one (upsert, `POST /assets/{app_namespace}/{mac}`,
   * RFC 7396), then reads it back and returns the stored asset.
   *
   * The body is the input plus `user_udid` = the normalised MAC (the server does not take it from the path).
   * Changing `declared_location` publishes one synthetic position; every write is evaluated by the rule engine.
   *
   * @param macAddress the asset MAC (normalised)
   * @param asset the fields: `user_name` required; `data` an object; `user_udid`, if given, the same MAC
   * @param options per-call `namespace` and request options (also used for the read-back)
   * @throws {ValidationError} status 0 for an invalid MAC or input (nothing is sent); 400 `apiCode`
   *   `reserved_field_namespace` (`body.fields` names the fields)
   * @throws {PayloadTooLargeError} 413 for a body over the server's 100 kB limit
   * @throws {ServerError} 500 with the server's validation text
   * @throws {ContextError} when no namespace is given or set
   * @example
   * ```typescript
   * const asset = await client.assets.create('AA:BB:CC:DD:EE:FF', { user_name: 'Forklift 1', user_type: 'forklift' });
   * console.log(asset.user_udid); // 'aabbccddeeff'
   * ```
   */
  async create(
    macAddress: string,
    asset: AssetInput,
    options?: CallContext & RequestOptions
  ): Promise<Asset>;
  /** Legacy form with the namespace first. */
  async create(
    namespace: string,
    macAddress: string,
    asset: AssetInput,
    requestOptions?: RequestOptions
  ): Promise<Asset>;
  async create(
    arg1: string,
    arg2: string | AssetInput,
    arg3?: AssetInput | (CallContext & RequestOptions),
    arg4?: RequestOptions
  ): Promise<Asset> {
    const [macAddress, asset, options] =
      typeof arg2 === 'string'
        ? [arg2, arg3, withNamespace(arg1, arg4)]
        : [arg1, arg2, arg3 as (CallContext & RequestOptions) | undefined];
    const mac = macOf(macAddress, 'macAddress');
    checkInput(asset, mac);
    const { ctx, request } = splitCallOptions(options);
    const namespace = this.ns(ctx);
    // 201 'Created' / 200 'Updated' as text without Content-Type: read as text and ignored.
    await this.transport.request<unknown>('POST', '/assets/{app_namespace}/{mac_address}', {
      params: { app_namespace: namespace, mac_address: mac },
      body: { ...asset, user_udid: mac },
      ...request,
    });
    return await this.get(mac, { ...request, namespace });
  }

  // ─── update ──────────────────────────────────────────────────────────────────────────────────────────────────

  /**
   * Applies a JSON merge patch to an existing asset (`PATCH /assets/{app_namespace}/{mac_address}`) and returns
   * the merged asset. `null` deletes a key. Changing `declared_location` publishes one synthetic position.
   *
   * @param macAddress the asset MAC (normalised)
   * @param patch the changes, sent verbatim except `user_udid`, which is sent normalised: `user_name` (if given) a
   *   non-empty string, `user_udid` (if given) the same MAC, `data` (if given) an object or `null`
   * @param options per-call `namespace` and request options
   * @throws {ValidationError} status 0 for an invalid MAC or patch (nothing is sent); 400 `reserved_field_namespace`
   * @throws {NotFoundError} 404 when no asset has this MAC (nothing is written)
   * @throws {PayloadTooLargeError} 413 for a body over 100 kB
   * @throws {ServerError} 500 with the server's validation text
   * @throws {ContextError} when no namespace is given or set
   * @example
   * ```typescript
   * const asset = await client.assets.update('aabbccddeeff', { color: '#ff0000', external_id: null });
   * console.log(asset.color);
   * ```
   */
  async update(
    macAddress: string,
    patch: AssetPatch,
    options?: CallContext & RequestOptions
  ): Promise<Asset>;
  /** Legacy form with the namespace first. */
  async update(
    namespace: string,
    macAddress: string,
    patch: AssetPatch,
    requestOptions?: RequestOptions
  ): Promise<Asset>;
  async update(
    arg1: string,
    arg2: string | AssetPatch,
    arg3?: AssetPatch | (CallContext & RequestOptions),
    arg4?: RequestOptions
  ): Promise<Asset> {
    const [macAddress, patch, options] =
      typeof arg2 === 'string'
        ? [arg2, arg3, withNamespace(arg1, arg4)]
        : [arg1, arg2, arg3 as (CallContext & RequestOptions) | undefined];
    const mac = macOf(macAddress, 'macAddress');
    checkPatch(patch, mac);
    const { ctx, request } = splitCallOptions(options);
    // A `user_udid` in the patch goes out as the normalised MAC, as in create() and batchSave().
    const body = patch.user_udid === undefined ? patch : { ...patch, user_udid: mac };
    return await this.transport.request<Asset>('PATCH', '/assets/{app_namespace}/{mac_address}', {
      params: { app_namespace: this.ns(ctx), mac_address: mac },
      body,
      ...request,
    });
  }

  // ─── delete ──────────────────────────────────────────────────────────────────────────────────────────────────

  /**
   * Deletes an asset (`DELETE /assets/{app_namespace}/{mac_address}`).
   *
   * @param macAddress the asset MAC (normalised)
   * @param options per-call `namespace` and request options
   * @throws {ValidationError} status 0 for an invalid MAC
   * @throws {NotFoundError} 404 when no asset has this MAC
   * @throws {ContextError} when no namespace is given or set
   * @example
   * ```typescript
   * await client.assets.delete('aabbccddeeff');
   * ```
   */
  async delete(macAddress: string, options?: CallContext & RequestOptions): Promise<void>;
  /** Legacy form with the namespace first. */
  async delete(
    namespace: string,
    macAddress: string,
    requestOptions?: RequestOptions
  ): Promise<void>;
  async delete(
    arg1: string,
    arg2?: string | (CallContext & RequestOptions),
    arg3?: RequestOptions
  ): Promise<void> {
    const [macAddress, options] =
      typeof arg2 === 'string' ? [arg2, withNamespace(arg1, arg3)] : [arg1, arg2];
    const mac = macOf(macAddress, 'macAddress');
    const { ctx, request } = splitCallOptions(options);
    await this.deleteOne(this.ns(ctx), mac, request);
  }

  private async deleteOne(namespace: string, mac: string, request: RequestOptions): Promise<void> {
    await this.transport.request<string>('DELETE', '/assets/{app_namespace}/{mac_address}', {
      params: { app_namespace: namespace, mac_address: mac },
      ...request,
      parseAs: 'text',
    });
  }

  // ─── batch writes ────────────────────────────────────────────────────────────────────────────────────────────

  /**
   * Saves several assets in one request (`POST /assets/{app_namespace}`, upsert per item keyed by `user_udid`) and
   * returns the saved assets. Not chunked: a body over the server's 100 kB limit fails with
   * `PayloadTooLargeError`, so send large sets in slices.
   *
   * @param assets the items: each an object with a valid MAC in `user_udid` (normalised) and a non-empty
   *   `user_name`; `data` an object
   * @param options per-call `namespace` and request options
   * @throws {ValidationError} status 0 naming the index of the first invalid item (nothing is sent); 400
   *   `reserved_field_namespace`
   * @throws {PayloadTooLargeError} 413 for a body over 100 kB
   * @throws {ServerError} 500 with the server text
   * @throws {ContextError} when no namespace is given or set
   * @example
   * ```typescript
   * const saved = await client.assets.batchSave([
   *   { user_udid: 'aabbccddee01', user_name: 'Cart 1' },
   *   { user_udid: 'aabbccddee02', user_name: 'Cart 2' },
   * ]);
   * console.log(saved.length);
   * ```
   */
  async batchSave(
    assets: BatchSaveItem[],
    options?: CallContext & RequestOptions
  ): Promise<Asset[]>;
  /** Legacy form with the namespace first. */
  async batchSave(
    namespace: string,
    assets: BatchSaveItem[],
    requestOptions?: RequestOptions
  ): Promise<Asset[]>;
  async batchSave(
    arg1: string | BatchSaveItem[],
    arg2?: BatchSaveItem[] | (CallContext & RequestOptions),
    arg3?: RequestOptions
  ): Promise<Asset[]> {
    const [assets, options] =
      typeof arg1 === 'string'
        ? [arg2, withNamespace(arg1, arg3)]
        : [arg1, arg2 as CallContext & RequestOptions];
    if (!Array.isArray(assets)) throw invalid('assets must be an array', 'assets');
    const body = assets.map((item, index) => checkBatchItem(item, index));
    const { ctx, request } = splitCallOptions(options);
    return await this.transport.request<Asset[]>('POST', '/assets/{app_namespace}', {
      params: { app_namespace: this.ns(ctx) },
      body,
      ...request,
    });
  }

  /**
   * Deletes several assets and reports which MACs were deleted and which were not found.
   *
   * The SDK does not use the batch route `DELETE /assets/{app_namespace}` (USI-P2-5): it sends one
   * `DELETE /assets/{app_namespace}/{mac}` per MAC, in order: a 404 puts the MAC in `not_found`; any other error is
   * thrown and the remaining MACs are not sent. The result lists the normalised MACs.
   *
   * @param macAddresses the MACs (each normalised)
   * @param options per-call `namespace` and request options (applied to each request)
   * @throws {ValidationError} status 0 naming the index of the first invalid MAC (nothing is sent)
   * @throws {ServerError} the first error other than 404 (the MACs after it are not sent)
   * @throws {ContextError} when no namespace is given or set
   * @example
   * ```typescript
   * const { deleted, not_found } = await client.assets.batchDelete(['aabbccddee01', 'AA:BB:CC:DD:EE:02']);
   * console.log(deleted, not_found);
   * ```
   */
  async batchDelete(
    macAddresses: string[],
    options?: CallContext & RequestOptions
  ): Promise<BatchDeleteResult>;
  /** Legacy form with the namespace first. */
  async batchDelete(
    namespace: string,
    macAddresses: string[],
    requestOptions?: RequestOptions
  ): Promise<BatchDeleteResult>;
  async batchDelete(
    arg1: string | string[],
    arg2?: string[] | (CallContext & RequestOptions),
    arg3?: RequestOptions
  ): Promise<BatchDeleteResult> {
    const [macAddresses, options] =
      typeof arg1 === 'string'
        ? [arg2, withNamespace(arg1, arg3)]
        : [arg1, arg2 as CallContext & RequestOptions];
    if (!Array.isArray(macAddresses)) {
      throw invalid('macAddresses must be an array', 'macAddresses');
    }
    const macs = macAddresses.map((mac, index) => macOf(mac, `macAddresses[${index}]`));
    const { ctx, request } = splitCallOptions(options);
    const namespace = this.ns(ctx);
    const result: BatchDeleteResult = { deleted: [], not_found: [] };
    for (const mac of macs) {
      try {
        await this.deleteOne(namespace, mac, request);
        result.deleted.push(mac);
      } catch (err) {
        if (!(err instanceof NotFoundError)) throw err;
        result.not_found.push(mac);
      }
    }
    return result;
  }

  // ─── history ─────────────────────────────────────────────────────────────────────────────────────────────────

  /**
   * The audit trail of an asset record (`GET /asset_history/{app_namespace}/{mac_address}`): one entry per create,
   * update or delete of the record, newest first. Not positions.
   *
   * The server ignores the time range (USI-P2-7) and returns at most the newest 1000 entries, so older entries are
   * not reachable. The SDK sends the range (`start_time`/`end_time`, epoch ms) and keeps the entries whose
   * `timestamp` (unix seconds) lies inside it, in the server's order.
   *
   * @param macAddress the asset MAC (normalised)
   * @param options `startTime` / `endTime` (`Date`, epoch ms or date string; default the last 24 hours), per-call
   *   `namespace` and request options
   * @throws {ValidationError} status 0 for an invalid MAC, an invalid time or `startTime` after `endTime`
   * @throws {ContextError} when no namespace is given or set
   * @example
   * ```typescript
   * const week = await client.assets.getHistory('aabbccddeeff', { startTime: Date.now() - 7 * 86_400_000 });
   * for (const entry of week) console.log(entry.action, new Date(Number(entry.timestamp) * 1000));
   * ```
   */
  async getHistory(
    macAddress: string,
    options?: AssetHistoryOptions & CallContext & RequestOptions
  ): Promise<AssetHistoryEntry[]> {
    const mac = macOf(macAddress, 'macAddress');
    const { ctx, request, rest } = splitCallOptions<AssetHistoryOptions>(options);
    const { from, to } = resolveTimeRange({ from: rest.startTime, to: rest.endTime });
    const entries = await this.transport.request<AssetHistoryEntry[]>(
      'GET',
      '/asset_history/{app_namespace}/{mac_address}',
      {
        params: { app_namespace: this.ns(ctx), mac_address: mac },
        query: { start_time: from, end_time: to },
        ...request,
      }
    );
    const first = Math.floor(from / 1000);
    const last = Math.floor(to / 1000);
    return entries.filter((entry) => {
      const seconds = Number(entry.timestamp);
      return seconds >= first && seconds <= last;
    });
  }
}
