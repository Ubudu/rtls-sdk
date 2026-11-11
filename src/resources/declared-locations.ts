/**
 * Declared locations (`client.declaredLocations`): declare and clear the location of many assets in one
 * request.
 *
 * @module resources/declared-locations
 */
import type { RequestOptions } from '../client/base';
import { ResourceBase } from '../client/resource';
import type { CallContext } from '../context';
import { ValidationError } from '../errors';
import type {
  BulkClearRequest,
  BulkClearResult,
  BulkDeclareItem,
  BulkDeclareRequest,
  BulkDeclareResult,
} from '../types/assets';
import { splitCallOptions } from '../utils/args';
import { isValidMac, normalizeMac } from '../utils/mac';

const MAX_ITEMS = 500;
const EXTERNAL_ID = /^[a-zA-Z0-9._-]+$/;
const EXTERNAL_ID_MAX = 128;

function invalid(message: string, field: string): ValidationError {
  return new ValidationError(message, undefined, { status: 0, details: [field] });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Throws when `location` is not `{ lat −90..90, lng −180..180, level? integer −10..200 }`. */
function checkLocation(location: unknown, at: string): void {
  if (!isPlainObject(location)) throw invalid(`${at} must be an object { lat, lng, level? }`, at);
  const { lat, lng, level } = location;
  if (!isFiniteNumber(lat) || lat < -90 || lat > 90) {
    throw invalid(
      `${at}.lat must be a number from -90 to 90, received ${String(lat)}`,
      `${at}.lat`
    );
  }
  if (!isFiniteNumber(lng) || lng < -180 || lng > 180) {
    throw invalid(
      `${at}.lng must be a number from -180 to 180, received ${String(lng)}`,
      `${at}.lng`
    );
  }
  if (
    level !== undefined &&
    (typeof level !== 'number' || !Number.isInteger(level) || level < -10 || level > 200)
  ) {
    throw invalid(
      `${at}.level must be an integer from -10 to 200, received ${String(level)}`,
      `${at}.level`
    );
  }
}

function checkMac(value: unknown, at: string): string {
  if (!isValidMac(value)) {
    throw invalid(
      `${at} must be a MAC address (12 hex characters, optionally separated), received ${JSON.stringify(value)}`,
      at
    );
  }
  return normalizeMac(value as string);
}

/** The bulk-declare body: every local check passed, MACs normalised, everything else verbatim. */
function checkedDeclare(request: BulkDeclareRequest): BulkDeclareRequest {
  // JavaScript callers can pass anything, so every field is checked through an untyped view of the request.
  const raw: unknown = request;
  if (!isPlainObject(raw)) throw invalid('bulkDeclare needs a request object', 'request');
  const { assets, shared_location, auto_create_virtual_assets, default_asset_model } = raw;
  if (!Array.isArray(assets) || assets.length < 1 || assets.length > MAX_ITEMS) {
    throw invalid(`assets must be an array of 1 to ${MAX_ITEMS} items`, 'assets');
  }
  const hasShared = shared_location !== undefined && shared_location !== null;
  if (hasShared) checkLocation(shared_location, 'shared_location');
  if (auto_create_virtual_assets !== undefined && typeof auto_create_virtual_assets !== 'boolean') {
    throw invalid('auto_create_virtual_assets must be a boolean', 'auto_create_virtual_assets');
  }
  if (default_asset_model !== undefined && typeof default_asset_model !== 'string') {
    throw invalid('default_asset_model must be a string', 'default_asset_model');
  }
  const seen = new Set<string>();
  const items = assets.map((item: unknown, i): BulkDeclareItem => {
    const at = `assets[${i}]`;
    if (!isPlainObject(item)) throw invalid(`${at} must be an object`, at);
    const { mac_address, external_id, declared_location } = item;
    const mac = mac_address === undefined ? undefined : checkMac(mac_address, `${at}.mac_address`);
    if (external_id !== undefined && typeof external_id !== 'string') {
      throw invalid(`${at}.external_id must be a string`, `${at}.external_id`);
    }
    if (mac === undefined && external_id === undefined) {
      throw invalid(`${at} needs a mac_address or an external_id`, at);
    }
    if (
      mac === undefined &&
      (!EXTERNAL_ID.test(external_id as string) || (external_id as string).length > EXTERNAL_ID_MAX)
    ) {
      throw invalid(
        `${at}.external_id must match ${String(EXTERNAL_ID)} and have at most ${EXTERNAL_ID_MAX} characters`,
        `${at}.external_id`
      );
    }
    const identifier = (mac ?? (external_id as string)).toLowerCase();
    if (seen.has(identifier)) {
      throw invalid(`${at}: duplicate identifier ${JSON.stringify(identifier)}`, at);
    }
    seen.add(identifier);
    if (declared_location !== undefined && declared_location !== null) {
      checkLocation(declared_location, `${at}.declared_location`);
    } else if (!hasShared) {
      throw invalid(`${at} needs a declared_location (or the request a shared_location)`, at);
    }
    return (mac === undefined ? item : { ...item, mac_address: mac }) as BulkDeclareItem;
  });
  return { ...request, assets: items };
}

/** The bulk-clear body: lists checked, MACs normalised, an absent list not sent. */
function checkedClear(request: unknown): BulkClearRequest {
  if (!isPlainObject(request)) throw invalid('bulkClear needs a request object', 'request');
  const { mac_addresses, external_ids } = request;
  if (mac_addresses !== undefined && !Array.isArray(mac_addresses)) {
    throw invalid('mac_addresses must be an array of MAC addresses', 'mac_addresses');
  }
  if (external_ids !== undefined && !Array.isArray(external_ids)) {
    throw invalid('external_ids must be an array of strings', 'external_ids');
  }
  const macs = (mac_addresses ?? []) as unknown[];
  const ids = (external_ids ?? []) as unknown[];
  if (macs.length === 0 && ids.length === 0) {
    throw invalid('bulkClear needs a non-empty mac_addresses or external_ids list', 'request');
  }
  if (macs.length + ids.length > MAX_ITEMS) {
    throw invalid(`bulkClear accepts at most ${MAX_ITEMS} identifiers in total`, 'request');
  }
  const body: BulkClearRequest = {};
  if (mac_addresses !== undefined) {
    body.mac_addresses = macs.map((mac, i) => checkMac(mac, `mac_addresses[${i}]`));
  }
  if (external_ids !== undefined) {
    ids.forEach((id, i) => {
      if (typeof id !== 'string' || id === '') {
        throw invalid(`external_ids[${i}] must be a non-empty string`, `external_ids[${i}]`);
      }
    });
    body.external_ids = ids as string[];
  }
  return body;
}

/** Declare and clear asset locations in bulk. */
export class DeclaredLocationsResource extends ResourceBase {
  /**
   * Declares the location of up to 500 assets (`POST /assets/{namespace}/bulk-declare`). Each item names its asset
   * by `mac_address` (normalised) or `external_id`, and uses its own `declared_location` or the request's
   * `shared_location`. The body is sent as given, with wire names.
   *
   * Side effects: each item whose location changes publishes one position (origin `declared`), and alert rules may
   * fire; re-declaring the stored location publishes nothing. With `auto_create_virtual_assets: true`, an unknown
   * `external_id` creates a permanent virtual asset (a `0200…` MAC, model `default_asset_model`); find it with
   * `assets.list({ key: 'external_id', value })`.
   *
   * The answer is `200` even when items fail: read `failed` and `errors` (each with a `DL_0xx` code).
   *
   * @param request the items, an optional `shared_location`, `auto_create_virtual_assets`, `default_asset_model`
   * @param options per-call `namespace` (else the client default) and request options
   * @returns the counts and the per-item errors
   * @throws {ValidationError} status 0 for a local check (1..500 items, an identifier per item, valid MACs and
   *   external ids, unique identifiers, a location per item, coordinate ranges); status 400 with `apiCode`
   *   `DL_002`/`DL_010`/`DL_012`/`DL_013` and the server message
   * @throws {ServerError} `apiCode` `DL_004` on an unexpected server failure
   * @throws {ContextError} when no namespace is given or set (nothing is sent)
   * @example
   * ```typescript
   * const result = await client.declaredLocations.bulkDeclare({
   *   assets: [{ mac_address: 'AA:BB:CC:DD:EE:FF' }, { external_id: 'PALLET-42' }],
   *   shared_location: { lat: 48.8566, lng: 2.3522, level: 0, source: 'api' },
   * });
   * console.log(`${result.success} declared, ${result.failed} failed`, result.errors);
   * ```
   */
  async bulkDeclare(
    request: BulkDeclareRequest,
    options?: CallContext & RequestOptions
  ): Promise<BulkDeclareResult> {
    const body = checkedDeclare(request);
    const { ctx, request: requestOptions } = splitCallOptions(options);
    return await this.transport.request<BulkDeclareResult>(
      'POST',
      '/assets/{namespace}/bulk-declare',
      { params: { namespace: this.ns(ctx) }, body, ...requestOptions }
    );
  }

  /**
   * Clears the declared location of up to 500 assets (`POST /assets/{namespace}/bulk-clear-declared`), named by
   * `mac_addresses` (normalised) and/or `external_ids`. A list left out is not sent. Clearing publishes no
   * position; afterwards `declared_location` is absent from the asset.
   *
   * Invalid MACs and unknown external ids are skipped by the server without a result row (USI-P2-11); a MAC that
   * matches no asset gets a `DL_017` error row.
   *
   * @param request `mac_addresses` and/or `external_ids` (at least one non-empty, at most 500 in total)
   * @param options per-call `namespace` (else the client default) and request options
   * @returns the counts and one row per resolved MAC
   * @throws {ValidationError} status 0 for a local check; status 400 with `apiCode` `DL_012`/`DL_010`
   * @throws {ServerError} `apiCode` `DL_017` on an unexpected server failure
   * @throws {ContextError} when no namespace is given or set (nothing is sent)
   * @example
   * ```typescript
   * const result = await client.declaredLocations.bulkClear({ mac_addresses: ['aabbccddeeff'] });
   * console.log(result.results.map((r) => `${r.mac_address}: ${r.status}`));
   * ```
   */
  async bulkClear(
    request: BulkClearRequest,
    options?: CallContext & RequestOptions
  ): Promise<BulkClearResult> {
    const body = checkedClear(request);
    const { ctx, request: requestOptions } = splitCallOptions(options);
    return await this.transport.request<BulkClearResult>(
      'POST',
      '/assets/{namespace}/bulk-clear-declared',
      { params: { namespace: this.ns(ctx) }, body, ...requestOptions }
    );
  }
}
