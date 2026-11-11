/**
 * `client.positions`: cached and last positions, Elasticsearch position reads and queries, and the REST publish.
 *
 * Three stores answer position reads:
 * - the **cache** (`listCached`, `getCached`): the current position of every asset seen recently; an entry
 *   disappears after the namespace setting `positionsExpirationPeriod`;
 * - the **last position** (`getLast`): the last position of one asset; it does not expire with the cache;
 * - **Elasticsearch** (`listLast`, `getHistory`, `query`): the position history, kept without a delete API.
 *
 * @module resources/positions
 */
import type { RequestOptions } from '../client/base';
import { ResourceBase } from '../client/resource';
import type { CallContext } from '../context';
import type {
  AssetPosition,
  CachedAssetPosition,
  EsDataType,
  EsQueryBody,
  EsSearchResponse,
  ListLastPositionsOptions,
  PositionHistoryOptions,
  PublishOptions,
  PublishPositionData,
} from '../types/positions';
import { splitCallOptions } from '../utils/args';
import { isValidMac, normalizeMac } from '../utils/mac';
import { resolveTimeRange } from '../utils/time';

export type {
  ListLastPositionsOptions,
  ListPositionsOptions,
  ListPositionsParams,
  PositionHistoryOptions,
  PublishOptions,
  PublishPositionData,
} from '../types/positions';

/** A body or query value known to be a MAC: normalised when it is a valid MAC, sent verbatim otherwise. */
function macValue<T>(value: T): T | string {
  return typeof value === 'string' && isValidMac(value) ? normalizeMac(value) : value;
}

/**
 * Position reads, Elasticsearch queries and the REST publish of a namespace.
 *
 * Every method takes the namespace from its options bag (`{ namespace }`), else from the client's default context;
 * without either it throws `ContextError` before any request. A MAC in a path is normalised to 12 lower-case hex
 * characters (`'AA:BB:CC:DD:EE:FF'` → `aabbccddeeff`); an invalid one throws `ValidationError` (status 0) and
 * nothing is sent.
 */
export class PositionsResource extends ResourceBase {
  // ─── Cache ──────────────────────────────────────────────────────────────────

  /**
   * Lists the cached position of every asset of the namespace (`GET /cache/{app_namespace}/positions`), `[]` when
   * none. A cache entry disappears after the namespace setting `positionsExpirationPeriod`.
   *
   * @param options per-call context (`namespace`) and request options (`signal`, `timeoutMs`, `headers`)
   * @throws {ContextError} no namespace in the options or the client context
   * @throws {ServerError} status 500 when a stored entry is malformed
   * @example
   * ```typescript
   * const positions = await client.positions.listCached();
   * for (const p of positions) console.log(p.user_udid, p.lat, p.lon, p.timestamp);
   * ```
   */
  async listCached(options?: CallContext & RequestOptions): Promise<CachedAssetPosition[]>;
  /** Legacy positional form. */
  async listCached(
    namespace: string,
    requestOptions?: RequestOptions
  ): Promise<CachedAssetPosition[]>;
  async listCached(
    arg1?: string | (CallContext & RequestOptions),
    arg2?: RequestOptions
  ): Promise<CachedAssetPosition[]> {
    const { ctx, request } =
      typeof arg1 === 'string'
        ? splitCallOptions({ namespace: arg1 }, arg2)
        : splitCallOptions(arg1);
    return await this.transport.request<CachedAssetPosition[]>(
      'GET',
      '/cache/{app_namespace}/positions',
      { params: { app_namespace: this.ns(ctx) }, ...request }
    );
  }

  /**
   * Gets the cached position of one asset (`GET /cache/{app_namespace}/positions/{mac_address}`).
   *
   * @param macAddress the asset MAC, any common notation (normalised to 12 lower-case hex)
   * @param options per-call context (`namespace`) and request options
   * @throws {ValidationError} status 0 for an invalid MAC (nothing is sent)
   * @throws {NotFoundError} status 404 when the asset has no cache entry (expired, or never seen)
   * @example
   * ```typescript
   * const position = await client.positions.getCached('AA:BB:CC:DD:EE:FF');
   * console.log(position.lat, position.lon, position.zone?.name);
   * ```
   */
  async getCached(
    macAddress: string,
    options?: CallContext & RequestOptions
  ): Promise<CachedAssetPosition>;
  /** Legacy positional form. */
  async getCached(
    namespace: string,
    macAddress: string,
    requestOptions?: RequestOptions
  ): Promise<CachedAssetPosition>;
  async getCached(
    arg1: string,
    arg2?: string | (CallContext & RequestOptions),
    arg3?: RequestOptions
  ): Promise<CachedAssetPosition> {
    return await this.lookup('/cache/{app_namespace}/positions/{mac_address}', arg1, arg2, arg3);
  }

  /**
   * Gets the last known position of one asset (`GET /asset_last_position/{app_namespace}/{mac_address}`). Unlike
   * the cache entry, it does not expire.
   *
   * @param macAddress the asset MAC, any common notation (normalised to 12 lower-case hex)
   * @param options per-call context (`namespace`) and request options
   * @throws {ValidationError} status 0 for an invalid MAC (nothing is sent)
   * @throws {NotFoundError} status 404 when the asset never had a position
   * @example
   * ```typescript
   * const last = await client.positions.getLast('aabbccddeeff');
   * console.log(new Date(last.timestamp).toISOString());
   * ```
   */
  async getLast(
    macAddress: string,
    options?: CallContext & RequestOptions
  ): Promise<CachedAssetPosition>;
  /** Legacy positional form. */
  async getLast(
    namespace: string,
    macAddress: string,
    requestOptions?: RequestOptions
  ): Promise<CachedAssetPosition>;
  async getLast(
    arg1: string,
    arg2?: string | (CallContext & RequestOptions),
    arg3?: RequestOptions
  ): Promise<CachedAssetPosition> {
    return await this.lookup(
      '/asset_last_position/{app_namespace}/{mac_address}',
      arg1,
      arg2,
      arg3
    );
  }

  /** One position by MAC; legacy when the second argument is a string. */
  private async lookup(
    path:
      | '/cache/{app_namespace}/positions/{mac_address}'
      | '/asset_last_position/{app_namespace}/{mac_address}',
    arg1: string,
    arg2: string | (CallContext & RequestOptions) | undefined,
    arg3: RequestOptions | undefined
  ): Promise<CachedAssetPosition> {
    const legacy = typeof arg2 === 'string';
    const { ctx, request } = legacy
      ? splitCallOptions({ namespace: arg1 }, arg3)
      : splitCallOptions(arg2);
    return await this.transport.request<CachedAssetPosition>('GET', path, {
      params: { app_namespace: this.ns(ctx), mac_address: legacy ? arg2 : arg1 },
      ...request,
    });
  }

  // ─── Elasticsearch ──────────────────────────────────────────────────────────

  /**
   * Lists the latest position document of each asset from Elasticsearch (`GET /es/last_positions/{appNamespace}`),
   * latest first.
   *
   * Bounded by default: the request always carries both `timestampFrom` and `timestampTo`. Neither given → the
   * last 24 h; only `timestampFrom` → up to now; only `timestampTo` → the 24 h before it. An unbounded search is the
   * slowest route of the API (seconds, up to ~20 s): for the whole history pass `timestampFrom: 0` together with a
   * generous `timeoutMs`. Only `key`, `queryString`, `mapUuids` (CSV), the two bounds and `current=true` are sent.
   *
   * `current: true` asks for current-position semantics; the server honours it only when the platform switch is on
   * and otherwise ignores it. The server reports which source answered in the `X-Last-Positions-Source` response
   * header (`latest` or `aggregation`); 0.3.0 does not expose it.
   *
   * @param options filters and bounds (`TimeInput`: `Date`, epoch ms or date string), per-call context and request
   *   options
   * @param requestOptions deprecated, pass `signal` / `timeoutMs` / `headers` in `options`; wins over them
   * @throws {ValidationError} status 0 for an invalid time input or `timestampFrom` after `timestampTo` (nothing
   *   is sent)
   * @example
   * ```typescript
   * const lastHour = await client.positions.listLast({ timestampFrom: Date.now() - 3_600_000 });
   * const fullHistory = await client.positions.listLast({ timestampFrom: 0, timeoutMs: 60_000 });
   * console.log(lastHour.length, fullHistory[0]?.user.udid);
   * ```
   */
  async listLast(
    options?: ListLastPositionsOptions & CallContext & RequestOptions,
    /** @deprecated since 0.3.0 — pass `signal` / `timeoutMs` / `headers` in `options`. */
    requestOptions?: RequestOptions
  ): Promise<AssetPosition[]>;
  /** Legacy positional form. */
  async listLast(
    namespace: string,
    options?: ListLastPositionsOptions,
    requestOptions?: RequestOptions
  ): Promise<AssetPosition[]>;
  async listLast(
    arg1?: string | (ListLastPositionsOptions & CallContext & RequestOptions),
    arg2?: ListLastPositionsOptions | RequestOptions,
    arg3?: RequestOptions
  ): Promise<AssetPosition[]> {
    const { ctx, request, rest } =
      typeof arg1 === 'string'
        ? splitCallOptions<ListLastPositionsOptions>({ ...arg2, namespace: arg1 }, arg3)
        : splitCallOptions<ListLastPositionsOptions>(arg1, arg2 as RequestOptions | undefined);
    const namespace = this.ns(ctx);
    const { from, to } = resolveTimeRange({ from: rest.timestampFrom, to: rest.timestampTo });
    return await this.transport.request<AssetPosition[]>(
      'GET',
      '/es/last_positions/{appNamespace}',
      {
        params: { appNamespace: namespace },
        query: {
          key: rest.key,
          queryString: rest.queryString,
          mapUuids: rest.mapUuids,
          timestampFrom: from,
          timestampTo: to,
          current: rest.current === true ? 'true' : undefined,
        },
        ...request,
      }
    );
  }

  /**
   * Gets the position history of one asset (`GET /es/position_history/{appNamespace}`), ascending.
   *
   * The history is **downsampled**: one document per time bucket, the bucket growing with the range (≤ 15 min:
   * 500 ms · ≤ 1 h: 1 s · ≤ 3 h: 10 s · ≤ 6 h: 20 s · ≤ 1 d: 45 s · ≤ 3 d: 5 min · ≤ 7 d: 10 min · ≤ 30 d: 15–30 min
   * · longer ranges: hours to days). Both bounds are always sent: neither given → the last 24 h; only
   * `timestampFrom` → up to now; only `timestampTo` → the 24 h before it.
   *
   * With the default `key` (`user.udid`) a valid MAC `value` is normalised to 12 lower-case hex; any other value,
   * and the value of any other key, is sent verbatim.
   *
   * @param options `value` (required), `key`, bounds, per-call context and request options
   * @param requestOptions deprecated, pass `signal` / `timeoutMs` / `headers` in `options`; wins over them
   * @throws {ValidationError} status 0 for an invalid time input or `timestampFrom` after `timestampTo` (nothing
   *   is sent); status 400 when `value` is empty
   * @example
   * ```typescript
   * const history = await client.positions.getHistory({
   *   value: 'AA:BB:CC:DD:EE:FF',
   *   timestampFrom: new Date(Date.now() - 3_600_000),
   * });
   * for (const p of history) console.log(p.timestamp, p.location?.lat, p.location?.lon);
   * ```
   */
  async getHistory(
    options: PositionHistoryOptions & CallContext & RequestOptions,
    /** @deprecated since 0.3.0 — pass `signal` / `timeoutMs` / `headers` in `options`. */
    requestOptions?: RequestOptions
  ): Promise<AssetPosition[]>;
  /** Legacy positional form. */
  async getHistory(
    namespace: string,
    options: PositionHistoryOptions,
    requestOptions?: RequestOptions
  ): Promise<AssetPosition[]>;
  async getHistory(
    arg1: string | (PositionHistoryOptions & CallContext & RequestOptions),
    arg2?: PositionHistoryOptions | RequestOptions,
    arg3?: RequestOptions
  ): Promise<AssetPosition[]> {
    const { ctx, request, rest } =
      typeof arg1 === 'string'
        ? splitCallOptions<PositionHistoryOptions>(
            { ...(arg2 as PositionHistoryOptions), namespace: arg1 },
            arg3
          )
        : splitCallOptions<PositionHistoryOptions>(arg1, arg2 as RequestOptions | undefined);
    const namespace = this.ns(ctx);
    const key = rest.key ?? 'user.udid';
    const { from, to } = resolveTimeRange({ from: rest.timestampFrom, to: rest.timestampTo });
    return await this.transport.request<AssetPosition[]>(
      'GET',
      '/es/position_history/{appNamespace}',
      {
        params: { appNamespace: namespace },
        query: {
          key,
          value: key === 'user.udid' ? macValue(rest.value) : rest.value,
          timestampFrom: from,
          timestampTo: to,
        },
        ...request,
      }
    );
  }

  /**
   * Runs an Elasticsearch search over the namespace's `alerts`, `positions` or `zone_visits` data
   * (`POST /es/query/{appNamespace}/{dataType}`) and returns the raw search response. The DSL is sent verbatim.
   *
   * Always bound the search: a `range` on `timestamp` and an explicit `size` (`size: 0` when only the aggregations
   * are needed). The server enforces limits and rewrites the body before searching:
   * - rejected with 400 (`ValidationError`, `err.details` = the server's `violations`): `runtime_mappings`,
   *   `script_fields`, any `script` / `script_score` / `scripted_metric` key, `size: -1`, aggregations nested
   *   deeper than 3;
   * - `size` defaults to and is clamped at 10 000, `terms` aggregation sizes at 1 000;
   * - `terminate_after: 100000` and `timeout: '30s'` are injected, so a long-range search can be partial
   *   (`terminated_early: true`, `timed_out: true`);
   * - `track_total_hits: false` is injected: `hits.total` is absent unless the body sets `track_total_hits: true`.
   *
   * The body limit is 100 kB (413 → `PayloadTooLargeError`). An unknown `dataType` answers 500 (USI-P3-9). The
   * call is read-only, so the client's retry policy may retry it.
   *
   * @typeParam TSource the `_source` type of the hits (e.g. `AssetPosition` for `positions`)
   * @typeParam TAggs the `aggregations` type
   * @param dataType `'alerts'`, `'positions'` or `'zone_visits'`
   * @param dsl the Elasticsearch query DSL, sent unchanged
   * @param options per-call context (`namespace`) and request options
   * @throws {ValidationError} status 400 for a guard rejection (`details` = violations)
   * @throws {ServerError} status 500 for an invalid `dataType` or an Elasticsearch failure
   * @example
   * ```typescript
   * const now = Date.now();
   * const res = await client.positions.query<AssetPosition>('positions', {
   *   size: 10,
   *   query: { range: { timestamp: { gte: now - 3_600_000, lte: now, format: 'epoch_millis' } } },
   *   sort: [{ timestamp: 'desc' }],
   * });
   * for (const hit of res.hits.hits) console.log(hit._source.user.udid, hit._source.timestamp);
   * ```
   */
  async query<TSource = Record<string, unknown>, TAggs = Record<string, unknown>>(
    dataType: EsDataType,
    dsl: EsQueryBody,
    options?: CallContext & RequestOptions
  ): Promise<EsSearchResponse<TSource, TAggs>> {
    const { ctx, request } = splitCallOptions(options);
    return await this.transport.request<EsSearchResponse<TSource, TAggs>>(
      'POST',
      '/es/query/{appNamespace}/{dataType}',
      {
        params: { appNamespace: this.ns(ctx), dataType },
        body: dsl,
        ...request,
        retry: { idempotent: true },
      }
    );
  }

  // ─── Publish ────────────────────────────────────────────────────────────────

  /**
   * Publishes one position (`POST /publisher/{app_namespace}`); resolves `undefined` on success (201, empty body).
   *
   * Side effects: the position enters the real-time pipeline (rule engine, alerts, live dashboards), then the cache,
   * the last position and the Elasticsearch history, which has no delete API. The cache and Elasticsearch are
   * written downstream, a moment after the call resolves. Not idempotent: each call is a new position, so it is
   * never retried.
   *
   * `user_udid` and, when present, `user_uuid` are normalised to 12 lower-case hex when they are valid MACs and
   * sent verbatim otherwise; the server prefers `user_uuid` when it is present. The URL namespace wins over any
   * `app_namespace` in the body.
   *
   * `patchAssetData: true` (`patch_asset_data=true`) also writes these fields of the position to the existing asset
   * (and to the same asset in every linked application): `battery_percent`, `color`, `data`, `dateChanged`,
   * `dateCreated`, `declared_location`, `external_id`, `is_virtual`, `model`, `origin`, `path`, `tags`,
   * `targetApplications`, `user_motion`, `user_name`, `user_type`, `user_udid`. Without an existing asset the patch
   * is skipped silently. `data.sensor_ils_*` keys are reserved with the patch: 400 `ValidationError` with
   * `apiCode: 'reserved_field_namespace'` and the fields in `err.body.fields`.
   *
   * @param position the position; extra keys are sent as given
   * @param options `patchAssetData`, per-call context (`namespace`) and request options
   * @param requestOptions deprecated, pass `signal` / `timeoutMs` / `headers` in `options`; wins over them
   * @throws {ValidationError} status 400 with the server's text (`Missing MAC address (user_uuid or user_udid)`,
   *   `Invalid position data`, `JSON error: …`)
   * @throws {ServiceUnavailableError} status 503: the position was not published
   * @example
   * ```typescript
   * await client.positions.publish({
   *   user_udid: 'AA:BB:CC:DD:EE:FF',
   *   lat: 48.8566,
   *   lon: 2.3522,
   *   data: { source: 'gateway-7' },
   * });
   * ```
   */
  async publish(
    position: PublishPositionData,
    options?: PublishOptions & CallContext & RequestOptions,
    /** @deprecated since 0.3.0 — pass `signal` / `timeoutMs` / `headers` in `options`. */
    requestOptions?: RequestOptions
  ): Promise<void>;
  /** Legacy positional form. */
  async publish(
    namespace: string,
    position: PublishPositionData,
    options?: PublishOptions,
    requestOptions?: RequestOptions
  ): Promise<void>;
  async publish(
    arg1: string | PublishPositionData,
    arg2?: PublishPositionData | (PublishOptions & CallContext & RequestOptions),
    arg3?: PublishOptions | RequestOptions,
    arg4?: RequestOptions
  ): Promise<void> {
    const legacy = typeof arg1 === 'string';
    const position = ((legacy ? arg2 : arg1) ?? {}) as PublishPositionData;
    const { ctx, request, rest } = legacy
      ? splitCallOptions<PublishOptions>({ ...(arg3 as PublishOptions), namespace: arg1 }, arg4)
      : splitCallOptions<PublishOptions>(
          arg2 as PublishOptions & CallContext & RequestOptions,
          arg3 as RequestOptions
        );
    const body: Record<string, unknown> = { ...position, user_udid: macValue(position.user_udid) };
    if (position.user_uuid !== undefined) body.user_uuid = macValue(position.user_uuid);
    await this.transport.request<string | undefined>('POST', '/publisher/{app_namespace}', {
      params: { app_namespace: this.ns(ctx) },
      query: { patch_asset_data: rest.patchAssetData === true ? 'true' : undefined },
      body,
      ...request,
      parseAs: 'text',
      retry: false,
    });
  }
}
