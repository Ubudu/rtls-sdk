/**
 * Venues, indoor maps, POIs and the path graph (`client.venues`).
 *
 * The venue routes never receive paging or sort keys from the SDK (paging keys change the body, USI-P4-3, and any
 * other unrecognised key empties the result, USI-P4-4); filters are sent as `filters=<JSON>`.
 *
 * @module resources/venues
 */
import type { BaseClient, RequestOptions } from '../client/base';
import { ResourceBase } from '../client/resource';
import type { TransportResponse } from '../client/transport';
import { checkLevel, type CallContext } from '../context';
import { ResponseParseError } from '../errors';
import type { FilterOptions } from '../types';
import type {
  PathFeatureCollection,
  PathNode,
  PathNodeType,
  PathSegment,
  POI,
  POIFeatureCollection,
} from '../types/geojson';
import type {
  IndoorMap,
  ListMapsOptions,
  ListPathsOptions,
  ListPoisOptions,
  ListVenuesOptions,
  MapPoisResponse,
  VenueDetails,
  VenueSummary,
} from '../types/venues';
import { resolveMapArgs, resolveVenueArgs, splitCallOptions } from '../utils/args';
import { combineFilters, filters as filterBuilders, serializeFilters } from '../utils/filtering';
import {
  extractPathNodesFromGeoJSON,
  extractPathSegmentsFromGeoJSON,
  extractPoisFromGeoJSON,
} from '../utils/geojson';

export type { ListVenuesOptions } from '../types/venues';

/** The list-option keys of this file (filters and shorthands). */
interface ListBag {
  filters?: FilterOptions;
  tag?: string;
  nodeType?: PathNodeType;
}

type Bag = ListBag & CallContext & RequestOptions;

/** What a venue-scoped call needs once its arguments are resolved. */
interface VenueCall {
  namespace: string;
  venueId: number;
  /** The call's own `level` (the client default is not applied, O12). */
  level: number | undefined;
  rest: ListBag;
  request: RequestOptions;
}

/**
 * Resolves `(options?, requestOptions?)` or the legacy `(namespace, venueId?, options?)`; ContextError before any
 * request for a missing or malformed namespace, venue id or level. The options bag of the legacy form is split like
 * the new form's, so its `level`, `tag`, `nodeType` and `filters` are sent, not dropped.
 */
function venueCall(
  client: BaseClient,
  a1: string | Bag | undefined,
  a2: number | string | RequestOptions | undefined,
  a3: RequestOptions | undefined
): VenueCall {
  const legacy = typeof a1 === 'string' ? resolveVenueArgs<Bag>(client, a1, a2, a3) : undefined;
  const { ctx, request, rest } = legacy
    ? splitCallOptions<ListBag>(legacy.options)
    : splitCallOptions<ListBag>(a1 as Bag | undefined, typeof a2 === 'object' ? a2 : undefined);
  return {
    namespace: legacy?.namespace ?? client.requireNs(ctx),
    venueId: legacy?.venueId ?? client.requireVenue(ctx),
    level: ctx.level === undefined ? undefined : checkLevel(ctx.level),
    rest,
    request,
  };
}

/** The `filters=<JSON>` query of the user filters merged with the shorthands (the shorthand wins per key). */
function filterQuery(
  user: FilterOptions | undefined,
  ...shorthand: FilterOptions[]
): Record<string, string> {
  return serializeFilters(combineFilters(user ?? {}, ...shorthand), 'venue');
}

/** `filters.equals(field, value)` when the value is set. */
function equalsIfSet(field: string, value: string | number | undefined): FilterOptions {
  return value === undefined ? {} : filterBuilders.equals(field, value);
}

/** `filters.contains(field, value)` when the value is set. */
function containsIfSet(field: string, value: string | undefined): FilterOptions {
  return value === undefined ? {} : filterBuilders.contains(field, value);
}

/**
 * The items of an array route: an array as is; `{ data: [...] }` (the paging envelope, never requested by the SDK)
 * → `data`; anything else is a `ResponseParseError`.
 */
function toArray<T>(response: TransportResponse<unknown>, route: string): T[] {
  const body = response.data;
  const items: unknown = Array.isArray(body)
    ? body
    : typeof body === 'object' && body !== null && 'data' in body
      ? body.data
      : undefined;
  if (Array.isArray(items)) return items as T[];
  throw new ResponseParseError(`${route}: expected a JSON array or { data: [...] }`, {
    status: response.status,
    contentType: response.headers.get('content-type') ?? undefined,
  });
}

/**
 * Venues of a namespace and their maps, POIs and path graph. `list*()` of a GeoJSON route returns the
 * FeatureCollection; `listPoisAsArray()`, `listPathNodes()` and `listPathSegments()` return flat items.
 */
export class VenuesResource extends ResourceBase {
  /**
   * The venues of the namespace (`GET /venues/{ns}`), as one array (the route has no server paging the SDK uses).
   *
   * @param options per-call `namespace`, `filters` (sent as `filters=<JSON>`), request options
   * @throws {ContextError} no namespace (nothing is sent)
   * @throws {ResponseParseError} the body is neither an array nor `{ data: [...] }`
   * @example
   * ```typescript
   * import { createRtlsClient, filters } from 'ubudu-rtls-sdk';
   *
   * const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace' });
   * const venues = await client.venues.list();
   * const hall = await client.venues.list({ filters: filters.equals('name', 'Hall A') });
   * ```
   */
  async list(options?: ListVenuesOptions): Promise<VenueSummary[]>;
  /** Legacy positional namespace. */
  async list(namespace: string, requestOptions?: RequestOptions): Promise<VenueSummary[]>;
  async list(a1?: string | ListVenuesOptions, a2?: RequestOptions): Promise<VenueSummary[]> {
    return await this.listVenues(a1, a2);
  }

  /**
   * Yields the venues of {@link VenuesResource.list} one by one (one request, then each item).
   *
   * @throws {ContextError} from the first `next()` when no namespace is set (nothing is sent)
   * @example
   * ```typescript
   * import { collectAll, createRtlsClient } from 'ubudu-rtls-sdk';
   *
   * const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace' });
   * const firstTen = await collectAll(client.venues.iterate(), { maxItems: 10 });
   * ```
   */
  iterate(options?: ListVenuesOptions): AsyncGenerator<VenueSummary>;
  /** Legacy positional namespace. */
  iterate(namespace: string, requestOptions?: RequestOptions): AsyncGenerator<VenueSummary>;
  async *iterate(
    a1?: string | ListVenuesOptions,
    a2?: RequestOptions
  ): AsyncGenerator<VenueSummary> {
    yield* await this.listVenues(a1, a2);
  }

  /**
   * One venue (`GET /venues/{ns}/{venueId}`). For an unknown id rtls-api answers 200 `{ id, statistics }` instead of
   * 404 (USI-P4-2); the stub is returned as is.
   *
   * @param options per-call `namespace`, `venueId`, request options
   * @param requestOptions @deprecated pass the request options in `options` (these keys win when both are given)
   * @throws {ContextError} no namespace or venue, or a malformed venue id (nothing is sent)
   * @throws {NotFoundError} 404 `{ error: 'Venue not found' }`
   * @example
   * ```typescript
   * import { createRtlsClient } from 'ubudu-rtls-sdk';
   *
   * const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace', venueId: 42 });
   * const venue = await client.venues.get();
   * console.log(venue.name, venue.metadata?.openingHours?.week);
   * ```
   */
  async get(
    options?: CallContext & RequestOptions,
    /** @deprecated pass the request options in `options` */
    requestOptions?: RequestOptions
  ): Promise<VenueDetails>;
  /** Legacy positional form; a digit-string id is read as a number. */
  async get(
    namespace: string,
    venueId: number | string,
    requestOptions?: RequestOptions
  ): Promise<VenueDetails>;
  async get(
    a1?: string | (CallContext & RequestOptions),
    a2?: number | string | RequestOptions,
    a3?: RequestOptions
  ): Promise<VenueDetails> {
    const { namespace, venueId, request } = venueCall(this.client, a1, a2, a3);
    return await this.transport.request<VenueDetails>('GET', '/venues/{namespace}/{venueId}', {
      params: { namespace, venueId },
      ...request,
    });
  }

  /**
   * The indoor maps of a venue (`GET /venues/{ns}/{venueId}/maps`); several maps may share a level. `map_bounds` is
   * latitude first; `tiles_url_base` holds literal `{z}/{x}/{y}` placeholders.
   *
   * @param options per-call `namespace`, `venueId`, `level` (floor filter; the client's default level is not
   *   applied), `filters`, request options
   * @param requestOptions @deprecated pass the request options in `options` (these keys win when both are given)
   * @throws {ContextError} no namespace or venue, or a malformed id or level (nothing is sent)
   * @example
   * ```typescript
   * import { createRtlsClient } from 'ubudu-rtls-sdk';
   *
   * const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace', venueId: 42 });
   * const groundFloor = await client.venues.listMaps({ level: 0 });
   * ```
   */
  async listMaps(
    options?: ListMapsOptions,
    /** @deprecated pass the request options in `options` */
    requestOptions?: RequestOptions
  ): Promise<IndoorMap[]>;
  /** Legacy positional form; a digit-string id is read as a number. */
  async listMaps(
    namespace: string,
    venueId: number | string,
    requestOptions?: RequestOptions
  ): Promise<IndoorMap[]>;
  async listMaps(
    a1?: string | ListMapsOptions,
    a2?: number | string | RequestOptions,
    a3?: RequestOptions
  ): Promise<IndoorMap[]> {
    const { namespace, venueId, level, rest, request } = venueCall(this.client, a1, a2, a3);
    const response = await this.transport.requestWithResponse<unknown>(
      'GET',
      '/venues/{namespace}/{venueId}/maps',
      {
        params: { namespace, venueId },
        query: filterQuery(rest.filters, equalsIfSet('level', level)),
        ...request,
      }
    );
    return toArray<IndoorMap>(response, 'venues.listMaps');
  }

  /**
   * The POIs of a venue as a GeoJSON FeatureCollection (`GET /venues/{ns}/{venueId}/pois`). A filtered call adds
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
   * const exits = await client.venues.listPois({ tag: 'exit', level: 0 });
   * ```
   */
  async listPois(
    options?: ListPoisOptions,
    /** @deprecated pass the request options in `options` */
    requestOptions?: RequestOptions
  ): Promise<POIFeatureCollection>;
  /** Legacy positional form; a digit-string id is read as a number. */
  async listPois(
    namespace: string,
    venueId: number | string,
    requestOptions?: RequestOptions
  ): Promise<POIFeatureCollection>;
  async listPois(
    a1?: string | ListPoisOptions,
    a2?: number | string | RequestOptions,
    a3?: RequestOptions
  ): Promise<POIFeatureCollection> {
    return await this.poiCollection(a1, a2, a3);
  }

  /**
   * The POIs of a venue as flat items ({@link VenuesResource.listPois} then `extractPoisFromGeoJSON`).
   *
   * @param options as {@link VenuesResource.listPois}
   * @param requestOptions @deprecated pass the request options in `options`
   * @throws {ContextError} no namespace or venue, or a malformed id or level (nothing is sent)
   * @example
   * ```typescript
   * import { createRtlsClient } from 'ubudu-rtls-sdk';
   *
   * const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace', venueId: 42 });
   * const pois = await client.venues.listPoisAsArray({ level: 0 });
   * ```
   */
  async listPoisAsArray(
    options?: ListPoisOptions,
    /** @deprecated pass the request options in `options` */
    requestOptions?: RequestOptions
  ): Promise<POI[]>;
  /** Legacy positional form; a digit-string id is read as a number. */
  async listPoisAsArray(
    namespace: string,
    venueId: number | string,
    requestOptions?: RequestOptions
  ): Promise<POI[]>;
  async listPoisAsArray(
    a1?: string | ListPoisOptions,
    a2?: number | string | RequestOptions,
    a3?: RequestOptions
  ): Promise<POI[]> {
    return extractPoisFromGeoJSON(await this.poiCollection(a1, a2, a3));
  }

  /**
   * The path graph of a venue as a GeoJSON FeatureCollection of nodes (points) and segments (line strings)
   * (`GET /venues/{ns}/{venueId}/paths`).
   *
   * @param options per-call `namespace`, `venueId`, `level` (floor filter; the client's default level is not
   *   applied), `nodeType` (keeps nodes of that `node_type` only), `filters`, request options
   * @param requestOptions @deprecated pass the request options in `options` (these keys win when both are given)
   * @throws {ContextError} no namespace or venue, or a malformed id or level (nothing is sent)
   * @example
   * ```typescript
   * import { createRtlsClient } from 'ubudu-rtls-sdk';
   *
   * const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace', venueId: 42 });
   * const elevators = await client.venues.listPaths({ nodeType: 'elevator' });
   * ```
   */
  async listPaths(
    options?: ListPathsOptions,
    /** @deprecated pass the request options in `options` */
    requestOptions?: RequestOptions
  ): Promise<PathFeatureCollection>;
  /** Legacy positional form; a digit-string id is read as a number. */
  async listPaths(
    namespace: string,
    venueId: number | string,
    requestOptions?: RequestOptions
  ): Promise<PathFeatureCollection>;
  async listPaths(
    a1?: string | ListPathsOptions,
    a2?: number | string | RequestOptions,
    a3?: RequestOptions
  ): Promise<PathFeatureCollection> {
    return await this.pathCollection(a1, a2, a3);
  }

  /**
   * The path nodes of a venue as flat items ({@link VenuesResource.listPaths} then
   * `extractPathNodesFromGeoJSON`).
   *
   * @param options as {@link VenuesResource.listPaths}
   * @param requestOptions @deprecated pass the request options in `options`
   * @throws {ContextError} no namespace or venue, or a malformed id or level (nothing is sent)
   * @example
   * ```typescript
   * import { createRtlsClient } from 'ubudu-rtls-sdk';
   *
   * const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace', venueId: 42 });
   * const nodes = await client.venues.listPathNodes({ level: 0 });
   * ```
   */
  async listPathNodes(
    options?: ListPathsOptions,
    /** @deprecated pass the request options in `options` */
    requestOptions?: RequestOptions
  ): Promise<PathNode[]>;
  /** Legacy positional form; a digit-string id is read as a number. */
  async listPathNodes(
    namespace: string,
    venueId: number | string,
    requestOptions?: RequestOptions
  ): Promise<PathNode[]>;
  async listPathNodes(
    a1?: string | ListPathsOptions,
    a2?: number | string | RequestOptions,
    a3?: RequestOptions
  ): Promise<PathNode[]> {
    return extractPathNodesFromGeoJSON(await this.pathCollection(a1, a2, a3));
  }

  /**
   * The path segments of a venue as flat items, with the stored property names (`sourceNodeId`, `targetNodeId`,
   * `bidirectional`, `distance`, …) ({@link VenuesResource.listPaths} then `extractPathSegmentsFromGeoJSON`).
   *
   * @param options as {@link VenuesResource.listPaths}, without `nodeType`
   * @param requestOptions @deprecated pass the request options in `options`
   * @throws {ContextError} no namespace or venue, or a malformed id or level (nothing is sent)
   * @example
   * ```typescript
   * import { createRtlsClient } from 'ubudu-rtls-sdk';
   *
   * const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace', venueId: 42 });
   * const oneWay = (await client.venues.listPathSegments()).filter((s) => !s.bidirectional);
   * ```
   */
  async listPathSegments(
    options?: Omit<ListPathsOptions, 'nodeType'>,
    /** @deprecated pass the request options in `options` */
    requestOptions?: RequestOptions
  ): Promise<PathSegment[]>;
  /** Legacy positional form; a digit-string id is read as a number. */
  async listPathSegments(
    namespace: string,
    venueId: number | string,
    requestOptions?: RequestOptions
  ): Promise<PathSegment[]>;
  async listPathSegments(
    a1?: string | Omit<ListPathsOptions, 'nodeType'>,
    a2?: number | string | RequestOptions,
    a3?: RequestOptions
  ): Promise<PathSegment[]> {
    return extractPathSegmentsFromGeoJSON(await this.pathCollection(a1, a2, a3));
  }

  /**
   * The POIs of one map (`GET /venues/{ns}/{venueId}/maps/{mapId}/pois`), as the route returns them:
   * `{ items, total }`, not GeoJSON.
   *
   * @deprecated served from the server's sample dataset; always empty for real namespaces (USI-P4-6). Use
   *   `listPois({ level })`.
   * @param options per-call `namespace`, `venueId`, `mapId`, request options
   * @param requestOptions @deprecated pass the request options in `options`
   * @throws {ContextError} no namespace, venue or map, or a malformed id (nothing is sent)
   */
  async listMapPois(
    options?: CallContext & RequestOptions,
    /** @deprecated pass the request options in `options` */
    requestOptions?: RequestOptions
  ): Promise<MapPoisResponse>;
  /** @deprecated sample data only (USI-P4-6); use `listPois({ level })`. */
  async listMapPois(
    namespace: string,
    venueId: number | string,
    mapId: number | string,
    requestOptions?: RequestOptions
  ): Promise<MapPoisResponse>;
  async listMapPois(
    a1?: string | (CallContext & RequestOptions),
    a2?: number | string | RequestOptions,
    a3?: number | string | RequestOptions,
    a4?: RequestOptions
  ): Promise<MapPoisResponse> {
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
    return await this.transport.request<MapPoisResponse>(
      'GET',
      '/venues/{namespace}/{venueId}/maps/{mapId}/pois',
      { params: { namespace, venueId, mapId }, ...request }
    );
  }

  private async listVenues(
    a1: string | ListVenuesOptions | undefined,
    a2: RequestOptions | undefined
  ): Promise<VenueSummary[]> {
    const legacy = typeof a1 === 'string';
    const { ctx, request, rest } = splitCallOptions<ListBag>(legacy ? a2 : a1);
    const namespace = legacy ? a1 : this.ns(ctx);
    const response = await this.transport.requestWithResponse<unknown>(
      'GET',
      '/venues/{namespace}',
      {
        params: { namespace },
        query: filterQuery(rest.filters),
        ...request,
      }
    );
    return toArray<VenueSummary>(response, 'venues.list');
  }

  private async poiCollection(
    a1: string | ListPoisOptions | undefined,
    a2: number | string | RequestOptions | undefined,
    a3: RequestOptions | undefined
  ): Promise<POIFeatureCollection> {
    const { namespace, venueId, level, rest, request } = venueCall(this.client, a1, a2, a3);
    return await this.transport.request<POIFeatureCollection>(
      'GET',
      '/venues/{namespace}/{venueId}/pois',
      {
        params: { namespace, venueId: String(venueId) },
        query: filterQuery(
          rest.filters,
          equalsIfSet('properties.level', level),
          containsIfSet('properties.tags', rest.tag)
        ),
        ...request,
      }
    );
  }

  private async pathCollection(
    a1: string | ListPathsOptions | undefined,
    a2: number | string | RequestOptions | undefined,
    a3: RequestOptions | undefined
  ): Promise<PathFeatureCollection> {
    const { namespace, venueId, level, rest, request } = venueCall(this.client, a1, a2, a3);
    return await this.transport.request<PathFeatureCollection>(
      'GET',
      '/venues/{namespace}/{venueId}/paths',
      {
        params: { namespace, venueId: String(venueId) },
        query: filterQuery(
          rest.filters,
          equalsIfSet('properties.level', level),
          equalsIfSet('properties.node_type', rest.nodeType)
        ),
        ...request,
      }
    );
  }
}
