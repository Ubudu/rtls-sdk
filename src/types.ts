// Core types of the SDK. Domain types live in `src/types/<domain>.ts` and
// reach this module, and so the package root, through the `./types/index` barrel at the end.
import type { components, paths as GeneratedPaths } from './generated/schema';

/**
 * A named schema of the vendored spec, `components['schemas'][K]`. An unknown name is a compile error.
 *
 * @example
 * ```typescript
 * import type { Schema } from 'ubudu-rtls-sdk';
 *
 * type Health = Schema<'HealthStatus'>; // { status: string }
 * ```
 */
export type Schema<K extends keyof components['schemas']> = components['schemas'][K];

/** Body of `GET /health`: `{ status: 'OK' }`, or the reason in `status` on a 503. */
export type HealthStatus = Schema<'HealthStatus'>;

/**
 * The generated path types of the vendored spec (rtls-api 3.4.0-15bab236), for callers that type their own
 * `client.raw` calls (`client.raw` is a `Client<paths>`). (`operations` is not exported: the spec declares no
 * operation id, so it is empty.)
 *
 * A mapped copy rather than a re-export, so that this comment, not the generated file's header, documents it.
 * `paths` and `components` are exported for typing and left out of the API reference, whose pages would reproduce
 * the whole spec, example values included.
 * @internal
 */
export type paths = { [P in keyof GeneratedPaths]: GeneratedPaths[P] };

/**
 * The generated component types of the vendored spec; {@link Schema} names one of its schemas.
 * @internal
 */
export type { components };

/**
 * The page envelope of the routes where the server pages lists (`{ data, pagination }`). Sent when the request
 * carries `page` and/or `limit`.
 */
export interface Page<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

/**
 * One page of a `limit`/`offset` listing: the items, the total when the server reports it (`X-Total-Count` or a
 * body `total`; it may be missing), and the `limit` and `offset` of the request.
 */
export interface OffsetPage<T> {
  items: T[];
  total?: number;
  limit: number;
  offset: number;
}

/**
 * The flat 0.2.0 page shape. The server nests these fields under `pagination`.
 * @deprecated since 0.3.0 — use {@link Page} (`normalizePage` converts this shape).
 */
export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// Filter operators supported by the API
export type FilterOperator =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'starts'
  | 'ends'
  | 'regex'
  | 'in'
  | 'nin'
  | 'exists'
  | 'between'
  | 'size'
  | 'all'
  | 'elem';

// Query options for list endpoints
export interface QueryOptions {
  page?: number;
  limit?: number;
  sort?: string | string[];
  fields?: string[];
}

/**
 * The typed value of one filter. Builders keep it typed (`filters.between('x', 1, 2)` holds `[1, 2]`);
 * `serializeFilters` turns it into the wire form of the grammar (a `Date` becomes epoch milliseconds).
 */
export type FilterValue = string | number | boolean | Date | readonly (string | number)[];

/**
 * Filters keyed `'<field>:<operator>'`, as the builders of `filters` produce them and `combineFilters` merges them.
 *
 * @example
 * ```typescript
 * import type { FilterOptions } from 'ubudu-rtls-sdk';
 *
 * const f: FilterOptions = { 'user_type:in': ['forklift', 'person'], 'battery:gte': 20 };
 * ```
 */
export type FilterOptions = {
  [K in `${string}:${FilterOperator}`]?: FilterValue;
};

/**
 * What `applyFilters` evaluates locally: the filters, then `sort` (`'field:asc'` / `'field:desc'`, several keys as an
 * array), then the `fields` projection (dot paths), then the page (`page` / `limit`, integers >= 1).
 */
export interface LocalQuery {
  filters?: FilterOptions;
  sort?: string | readonly string[];
  page?: number;
  limit?: number;
  fields?: readonly string[];
}

/** `T` with every property optional, recursively (arrays are kept as they are): the item type after a projection. */
export type DeepPartial<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

// Domain types (assets, positions, spatial, venues, navigation, GeoJSON, dashboards, alerts, notifications, ETL).
export * from './types/index';
