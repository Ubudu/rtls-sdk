/**
 * Zones of a venue and the zone-presence timeline of an asset (`client.zones`).
 *
 * @module resources/zones
 */
import type { BaseClient, RequestOptions } from '../client/base';
import { ResourceBase } from '../client/resource';
import { checkLevel, type CallContext } from '../context';
import { ValidationError } from '../errors';
import type { FilterOptions } from '../types';
import type { Zone, ZoneFeatureCollection } from '../types/geojson';
import type { ListZonesOptions, ZonePresenceOptions, ZonePresenceSlot } from '../types/venues';
import { resolveMapArgs, resolveVenueArgs, splitCallOptions } from '../utils/args';
import { combineFilters, filters as filterBuilders, serializeFilters } from '../utils/filtering';
import { extractZonesFromGeoJSON } from '../utils/geojson';
import { isValidMac, normalizeMac } from '../utils/mac';
import { resolveTimeRange } from '../utils/time';

export type { ZonePresenceOptions } from '../types/venues';

/** An Elasticsearch fixed interval (calendar units such as `1M`, `1w`, `1y` make ES fail). */
const FIXED_INTERVAL = /^[1-9]\d*(ms|s|m|h|d)$/;

type ZonesBag = ListZonesOptions;

/** The `filters=<JSON>` query of `zones.list`: user filters, then the `level` and `tag` shorthands (they win). */
function zoneFilterQuery(
  user: FilterOptions | undefined,
  level: number | undefined,
  tag: string | undefined
): Record<string, string> {
  return serializeFilters(
    combineFilters(
      user ?? {},
      level === undefined ? {} : filterBuilders.equals('properties.level', level),
      tag === undefined ? {} : filterBuilders.contains('properties.tags', tag)
    ),
    'venue'
  );
}

/**
 * Resolves `(options?, requestOptions?)` or the legacy `(namespace, venueId?, options?)` of `zones.list`;
 * ContextError before any request for a missing or malformed namespace, venue id or level. The options bag of the
 * legacy form is split like the new form's, so its `level`, `tag` and `filters` are sent, not dropped.
 */
function zonesQuery(
  client: BaseClient,
  a1: string | ZonesBag | undefined,
  a2: number | string | RequestOptions | undefined,
  a3: RequestOptions | undefined
): { namespace: string; venueId: number; query: Record<string, string>; request: RequestOptions } {
  const legacy =
    typeof a1 === 'string' ? resolveVenueArgs<ZonesBag>(client, a1, a2, a3) : undefined;
  const { ctx, request, rest } = legacy
    ? splitCallOptions<{ filters?: FilterOptions; tag?: string }>(legacy.options)
    : splitCallOptions<{ filters?: FilterOptions; tag?: string }>(
        a1 as ZonesBag | undefined,
        typeof a2 === 'object' ? a2 : undefined
      );
  const namespace = legacy?.namespace ?? client.requireNs(ctx);
  const venueId = legacy?.venueId ?? client.requireVenue(ctx);
  const level = ctx.level === undefined ? undefined : checkLevel(ctx.level);
  return { namespace, venueId, query: zoneFilterQuery(rest.filters, level, rest.tag), request };
}

/**
 * Zones of a venue. `list()` returns the GeoJSON FeatureCollection; `listAsArray()` is its flat `Zone[]` form.
 */
export class ZonesResource extends ResourceBase {
  /**
   * The zones of a venue as a GeoJSON FeatureCollection (`GET /venues/{ns}/{venueId}/zones`). A filtered call adds
   * `total` to the collection.
   *
   * @param options per-call `namespace`, `venueId`, `level` (floor filter on `properties.level`; the client's
   *   default level is not applied), `tag` (exact element of `properties.tags`), `filters`, request options
   * @param requestOptions @deprecated pass the request options in `options` (these keys win when both are given)
   * @throws {ContextError} no namespace or venue, or a malformed id or level (nothing is sent)
   * @example
   * ```typescript
   * import { createRtlsClient } from 'ubudu-rtls-sdk';
   *
   * const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace', venueId: 42 });
   * const docks = await client.zones.list({ level: 0, tag: 'dock' });
   * console.log(docks.total, docks.features.length);
   * ```
   */
  async list(
    options?: ListZonesOptions,
    /** @deprecated pass the request options in `options` */
    requestOptions?: RequestOptions
  ): Promise<ZoneFeatureCollection>;
  /** Legacy positional form; a digit-string id is read as a number. */
  async list(
    namespace: string,
    venueId: number | string,
    requestOptions?: RequestOptions
  ): Promise<ZoneFeatureCollection>;
  async list(
    a1?: string | ListZonesOptions,
    a2?: number | string | RequestOptions,
    a3?: RequestOptions
  ): Promise<ZoneFeatureCollection> {
    return await this.collection(a1, a2, a3);
  }

  /**
   * The zones of a venue as flat items (`color` from `rgb_color`, `geometry` kept).
   *
   * @param options as {@link ZonesResource.list}
   * @param requestOptions @deprecated pass the request options in `options`
   * @throws {ContextError} no namespace or venue, or a malformed id or level (nothing is sent)
   * @example
   * ```typescript
   * import { createRtlsClient } from 'ubudu-rtls-sdk';
   *
   * const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace', venueId: 42 });
   * const zones = await client.zones.listAsArray();
   * ```
   */
  async listAsArray(
    options?: ListZonesOptions,
    /** @deprecated pass the request options in `options` */
    requestOptions?: RequestOptions
  ): Promise<Zone[]>;
  /** Legacy positional form; a digit-string id is read as a number. */
  async listAsArray(
    namespace: string,
    venueId: number | string,
    requestOptions?: RequestOptions
  ): Promise<Zone[]>;
  async listAsArray(
    a1?: string | ListZonesOptions,
    a2?: number | string | RequestOptions,
    a3?: RequestOptions
  ): Promise<Zone[]> {
    return extractZonesFromGeoJSON(await this.collection(a1, a2, a3));
  }

  /**
   * Yields the zones of {@link ZonesResource.listAsArray} one by one (one request, then each zone).
   *
   * @throws {ContextError} from the first `next()` when no namespace or venue is set (nothing is sent)
   * @example
   * ```typescript
   * import { createRtlsClient } from 'ubudu-rtls-sdk';
   *
   * const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace', venueId: 42 });
   * for await (const zone of client.zones.iterate({ level: 0 })) console.log(zone.name);
   * ```
   */
  iterate(options?: ListZonesOptions): AsyncGenerator<Zone>;
  /** Legacy positional form; a digit-string id is read as a number. */
  iterate(namespace: string, venueId: number | string): AsyncGenerator<Zone>;
  async *iterate(a1?: string | ListZonesOptions, a2?: number | string): AsyncGenerator<Zone> {
    yield* extractZonesFromGeoJSON(await this.collection(a1, a2, undefined));
  }

  /**
   * @deprecated use {@link ZonesResource.listAsArray} (same result); removed in a later minor.
   * @param options as {@link ZonesResource.list}
   * @param requestOptions @deprecated pass the request options in `options`
   * @throws {ContextError} no namespace or venue, or a malformed id or level (nothing is sent)
   */
  async getAll(
    options?: ListZonesOptions,
    /** @deprecated pass the request options in `options` */
    requestOptions?: RequestOptions
  ): Promise<Zone[]>;
  /** @deprecated use `listAsArray`. */
  async getAll(
    namespace: string,
    venueId: number | string,
    requestOptions?: RequestOptions
  ): Promise<Zone[]>;
  async getAll(
    a1?: string | ListZonesOptions,
    a2?: number | string | RequestOptions,
    a3?: RequestOptions
  ): Promise<Zone[]> {
    return extractZonesFromGeoJSON(await this.collection(a1, a2, a3));
  }

  /**
   * The zones of one map (`GET /venues/{ns}/{venueId}/maps/{mapId}/zones`).
   *
   * @deprecated served from the server's sample dataset; always empty for real namespaces (USI-P4-6). Use
   *   `zones.list({ level })`.
   * @param options per-call `namespace`, `venueId`, `mapId`, request options
   * @param requestOptions @deprecated pass the request options in `options`
   * @throws {ContextError} no namespace, venue or map, or a malformed id (nothing is sent)
   */
  async listByMap(
    options?: CallContext & RequestOptions,
    /** @deprecated pass the request options in `options` */
    requestOptions?: RequestOptions
  ): Promise<ZoneFeatureCollection>;
  /** @deprecated sample data only (USI-P4-6); use `zones.list({ level })`. */
  async listByMap(
    namespace: string,
    venueId: number | string,
    mapId: number | string,
    requestOptions?: RequestOptions
  ): Promise<ZoneFeatureCollection>;
  async listByMap(
    a1?: string | (CallContext & RequestOptions),
    a2?: number | string | RequestOptions,
    a3?: number | string | RequestOptions,
    a4?: RequestOptions
  ): Promise<ZoneFeatureCollection> {
    return await this.mapCollection(a1, a2, a3, a4);
  }

  /**
   * The zones of one map as flat items.
   *
   * @deprecated sample data only (USI-P4-6); use `zones.listAsArray({ level })`.
   * @param options per-call `namespace`, `venueId`, `mapId`, request options
   * @param requestOptions @deprecated pass the request options in `options`
   * @throws {ContextError} no namespace, venue or map, or a malformed id (nothing is sent)
   */
  async listByMapAsArray(
    options?: CallContext & RequestOptions,
    /** @deprecated pass the request options in `options` */
    requestOptions?: RequestOptions
  ): Promise<Zone[]>;
  /** @deprecated sample data only (USI-P4-6); use `zones.listAsArray({ level })`. */
  async listByMapAsArray(
    namespace: string,
    venueId: number | string,
    mapId: number | string,
    requestOptions?: RequestOptions
  ): Promise<Zone[]>;
  async listByMapAsArray(
    a1?: string | (CallContext & RequestOptions),
    a2?: number | string | RequestOptions,
    a3?: number | string | RequestOptions,
    a4?: RequestOptions
  ): Promise<Zone[]> {
    return extractZonesFromGeoJSON(await this.mapCollection(a1, a2, a3, a4));
  }

  /**
   * The zone timeline of **one asset** (`GET /es/zone_presence/{ns}`): one slot per interval, from the asset's first
   * to its last position document in the range.
   *
   * Time range: neither bound → the last 24 h; only `timestampFrom` → up to now; only `timestampTo` → the 24 h before
   * it. `value` is the asset's udid: a valid MAC is normalised to the stored 12-lowercase-hex form; without `value`
   * the server picks the asset with the most documents in the range. Slots: occupied → the zone of one document of
   * the slot (not the dominant one, USI-P4-18) plus `timestamp`; empty → `{ id: 0, name: 'OUTSIDE_ALL_ZONES' }`;
   * document without zone → `{ name: 'UNKNOWN_ZONE' }`.
   *
   * Errors: 400 `{ error: 'timestampFrom and timestampTo are required parameters' }` → `ValidationError`; 500
   * `{ error: <Elasticsearch message> }` → `ServerError`; 401 → `AuthenticationError`.
   *
   * @param options `timestampFrom`, `timestampTo` (epoch ms, `Date` or ISO string), `value`, `interval` (ES fixed
   *   interval such as `'15m'`), `key` (deprecated), per-call `namespace`, request options
   * @param requestOptions @deprecated pass the request options in `options`
   * @throws {ContextError} no namespace (nothing is sent)
   * @throws {ValidationError} status 0 for `from > to`, an unparseable time or an invalid `interval` (nothing is sent)
   * @example
   * ```typescript
   * import { createRtlsClient } from 'ubudu-rtls-sdk';
   *
   * const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace' });
   * const slots = await client.zones.getPresence({
   *   value: 'AA:BB:CC:DD:EE:FF',
   *   timestampFrom: Date.now() - 3_600_000,
   *   interval: '5m',
   * });
   * ```
   */
  async getPresence(
    options?: ZonePresenceOptions & CallContext & RequestOptions,
    /** @deprecated pass the request options in `options` */
    requestOptions?: RequestOptions
  ): Promise<ZonePresenceSlot[]>;
  /** Legacy positional namespace. */
  async getPresence(
    namespace: string,
    options?: ZonePresenceOptions,
    requestOptions?: RequestOptions
  ): Promise<ZonePresenceSlot[]>;
  async getPresence(
    a1?: string | (ZonePresenceOptions & CallContext & RequestOptions),
    a2?: ZonePresenceOptions | RequestOptions,
    a3?: RequestOptions
  ): Promise<ZonePresenceSlot[]> {
    const legacy = typeof a1 === 'string';
    const { ctx, request, rest } = legacy
      ? splitCallOptions<ZonePresenceOptions>(a2, a3)
      : splitCallOptions<ZonePresenceOptions>(a1, a2 as RequestOptions | undefined);
    const namespace = legacy ? a1 : this.ns(ctx);
    const { from, to } = resolveTimeRange({ from: rest.timestampFrom, to: rest.timestampTo });
    const { interval, key } = rest;
    if (
      interval !== undefined &&
      !(typeof interval === 'string' && FIXED_INTERVAL.test(interval))
    ) {
      throw new ValidationError(
        `interval must be an Elasticsearch fixed interval such as '15m' or '1h' (calendar units are refused), not ${JSON.stringify(interval)}`,
        undefined,
        { status: 0, details: ['interval'] }
      );
    }
    const udidKey = key === undefined || key === 'user.udid';
    const value =
      udidKey && typeof rest.value === 'string' && isValidMac(rest.value)
        ? normalizeMac(rest.value)
        : rest.value;
    return await this.transport.request<ZonePresenceSlot[]>(
      'GET',
      '/es/zone_presence/{appNamespace}',
      {
        params: { appNamespace: namespace },
        query: { timestampFrom: String(from), timestampTo: String(to), value, key, interval },
        ...request,
      }
    );
  }

  private async collection(
    a1: string | ListZonesOptions | undefined,
    a2: number | string | RequestOptions | undefined,
    a3: RequestOptions | undefined
  ): Promise<ZoneFeatureCollection> {
    const { namespace, venueId, query, request } = zonesQuery(this.client, a1, a2, a3);
    return await this.transport.request<ZoneFeatureCollection>(
      'GET',
      '/venues/{namespace}/{venueId}/zones',
      { params: { namespace, venueId: String(venueId) }, query, ...request }
    );
  }

  private async mapCollection(
    a1: string | (CallContext & RequestOptions) | undefined,
    a2: number | string | RequestOptions | undefined,
    a3: number | string | RequestOptions | undefined,
    a4: RequestOptions | undefined
  ): Promise<ZoneFeatureCollection> {
    let namespace: string;
    let venueId: number;
    let mapId: number;
    let request: RequestOptions;
    if (typeof a1 === 'string') {
      const legacy = resolveMapArgs<CallContext & RequestOptions>(this.client, a1, a2, a3, a4);
      ({ namespace, venueId, mapId } = legacy);
      ({ request } = splitCallOptions(legacy.options));
    } else {
      const split = splitCallOptions(a1, typeof a2 === 'object' ? a2 : undefined);
      namespace = this.ns(split.ctx);
      venueId = this.venueId(split.ctx);
      mapId = this.mapId(split.ctx);
      request = split.request;
    }
    return await this.transport.request<ZoneFeatureCollection>(
      'GET',
      '/venues/{namespace}/{venueId}/maps/{mapId}/zones',
      { params: { namespace, venueId, mapId }, ...request }
    );
  }
}
