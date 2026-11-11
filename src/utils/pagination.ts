/**
 * The three pagination models: the `{ data, pagination }` page envelope (`paginatePages`),
 * `limit`/`offset` with an optional total (`paginateOffset`), and "the server returns everything" (`applyFilters`
 * pages locally).
 *
 * @module utils/pagination
 */
import { AbortError, ValidationError } from '../errors';
import type { OffsetPage, Page, PaginatedResponse } from '../types';

export { buildQueryParams } from './query';
export type { OffsetPage, Page, PaginatedResponse } from '../types';

function invalid(field: string, message: string): ValidationError {
  return new ValidationError(message, undefined, { status: 0, details: [field] });
}

function integerAtLeast(value: unknown, min: number, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min) {
    throw invalid(field, `${field} must be an integer >= ${min}`);
  }
  return value;
}

/** `Infinity` or an integer `>= 1`. */
function pageCap(value: unknown, field: string): number {
  if (value === Infinity) return value;
  return integerAtLeast(value, 1, field);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new AbortError(undefined, { cause: signal.reason });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const LEGACY_KEYS = ['page', 'limit', 'total', 'totalPages', 'hasNext', 'hasPrev'] as const;

/**
 * Any list response as a {@link Page}:
 * - an envelope `{ data, pagination }` is returned as is;
 * - the flat 0.2.0 shape (`{ data, page, limit, total, totalPages, hasNext, hasPrev }`) is nested;
 * - `{ data }` without `pagination` and a bare array become a synthetic single page (the server ignored paging, so
 *   the array is everything it sent): `{ page: request.page ?? 1, limit: request.limit ?? data.length,
 *   total: data.length, totalPages: data.length ? 1 : 0, hasNext: false, hasPrev: (request.page ?? 1) > 1 }`.
 *
 * @throws {ValidationError} status 0 when the value is none of these shapes
 *
 * @example
 * ```typescript
 * import { normalizePage } from 'ubudu-rtls-sdk';
 *
 * normalizePage([1, 2]).pagination; // { page: 1, limit: 2, total: 2, totalPages: 1, hasNext: false, hasPrev: false }
 * ```
 */
export function normalizePage<T>(
  response: Page<T> | PaginatedResponse<T> | { data: T[] } | T[],
  request?: { page?: number; limit?: number }
): Page<T> {
  const synthetic = (data: T[]): Page<T> => {
    const page = request?.page ?? 1;
    return {
      data,
      pagination: {
        page,
        limit: request?.limit ?? data.length,
        total: data.length,
        totalPages: data.length > 0 ? 1 : 0,
        hasNext: false,
        hasPrev: page > 1,
      },
    };
  };
  if (Array.isArray(response)) return synthetic(response);
  if (!isObject(response) || !Array.isArray(response.data)) {
    throw invalid(
      'response',
      'normalizePage needs a { data, pagination } envelope, a { data } object or an array'
    );
  }
  const data = response.data as T[];
  if (isObject((response as { pagination?: unknown }).pagination)) return response as Page<T>;
  if (!LEGACY_KEYS.some((key) => key in response)) return synthetic(data);
  // The flat 0.2.0 shape: keep what it carries, fill the rest like a synthetic page.
  const flat = response as Partial<PaginatedResponse<T>>;
  const base = synthetic(data).pagination;
  return {
    data,
    pagination: {
      page: flat.page ?? base.page,
      limit: flat.limit ?? base.limit,
      total: flat.total ?? base.total,
      totalPages: flat.totalPages ?? base.totalPages,
      hasNext: flat.hasNext ?? base.hasNext,
      hasPrev: flat.hasPrev ?? base.hasPrev,
    },
  };
}

/**
 * Iterates the items of a page-envelope listing, page by page.
 *
 * After each page it stops when the page is empty, when an envelope says `pagination.hasNext === false`, when a bare
 * array is shorter than `limit`, or after `maxPages` pages. The iterator is lazy: the next page is fetched only when
 * the consumer pulls past the last item of the current one. `signal` is checked before each fetch (`AbortError`)
 * and passed to `fetchPage`.
 *
 * @throws {ValidationError} status 0, at once, when `limit` is not an integer `>= 1`, `startPage` not an integer
 *   `>= 1` or `maxPages` neither `Infinity` nor an integer `>= 1`
 *
 * @example
 * ```typescript
 * import { collectAll, paginatePages } from 'ubudu-rtls-sdk';
 *
 * const venues = await collectAll(
 *   paginatePages((page, limit) => fetchVenuePage(page, limit), { limit: 20 }),
 *   { maxItems: 100 }
 * );
 * ```
 */
export function paginatePages<T>(
  fetchPage: (page: number, limit: number, signal?: AbortSignal) => Promise<Page<T> | T[]>,
  options?: { limit?: number; startPage?: number; maxPages?: number; signal?: AbortSignal }
): AsyncGenerator<T, void, undefined> {
  const limit = integerAtLeast(options?.limit ?? 50, 1, 'limit');
  const startPage = integerAtLeast(options?.startPage ?? 1, 1, 'startPage');
  const maxPages = pageCap(options?.maxPages ?? Infinity, 'maxPages');
  const signal = options?.signal;
  return (async function* pages(): AsyncGenerator<T, void, undefined> {
    for (let page = startPage, fetched = 0; fetched < maxPages; page += 1) {
      throwIfAborted(signal);
      const response = await fetchPage(page, limit, signal);
      fetched += 1;
      const items = Array.isArray(response)
        ? response
        : normalizePage<T>(response, { page, limit }).data;
      if (items.length === 0) return;
      for (const item of items) yield item;
      if (Array.isArray(response)) {
        if (items.length < limit) return;
      } else if (normalizePage<T>(response, { page, limit }).pagination.hasNext === false) {
        return;
      }
    }
  })();
}

/**
 * Iterates the items of a `limit`/`offset` listing.
 *
 * The offset grows by `limit` (never by the number of items received). It stops when a page is empty; when the
 * total is known and `offset + limit >= total`; when the total is unknown, `stopOnShortPage` is set (default) and a
 * page is shorter than `limit`; or after `maxPages` pages. Pass `stopOnShortPage: false` when a page may be short
 * although more items remain (grouped rows counted by item). Lazy, like {@link paginatePages}.
 *
 * @throws {ValidationError} status 0, at once, when `limit` is not an integer `>= 1`, `startOffset` not an integer
 *   `>= 0` or `maxPages` neither `Infinity` nor an integer `>= 1`
 */
export function paginateOffset<T>(
  fetchPage: (offset: number, limit: number, signal?: AbortSignal) => Promise<OffsetPage<T>>,
  options?: {
    limit?: number;
    startOffset?: number;
    maxPages?: number;
    stopOnShortPage?: boolean;
    signal?: AbortSignal;
  }
): AsyncGenerator<T, void, undefined> {
  const limit = integerAtLeast(options?.limit ?? 50, 1, 'limit');
  const startOffset = integerAtLeast(options?.startOffset ?? 0, 0, 'startOffset');
  const maxPages = pageCap(options?.maxPages ?? Infinity, 'maxPages');
  const stopOnShortPage = options?.stopOnShortPage ?? true;
  const signal = options?.signal;
  return (async function* offsets(): AsyncGenerator<T, void, undefined> {
    for (let offset = startOffset, fetched = 0; fetched < maxPages; offset += limit) {
      throwIfAborted(signal);
      const page = await fetchPage(offset, limit, signal);
      fetched += 1;
      if (!isObject(page) || !Array.isArray(page.items)) {
        throw invalid(
          'page',
          'paginateOffset: fetchPage must resolve to { items, total?, limit, offset }'
        );
      }
      const items = page.items;
      if (items.length === 0) return;
      for (const item of items) yield item;
      if (page.total !== undefined) {
        if (offset + limit >= page.total) return;
      } else if (stopOnShortPage && items.length < limit) {
        return;
      }
    }
  })();
}

/**
 * Iterates a 0.2.0-style paged fetcher. Accepts the flat 0.2.0 shape and the real `{ data, pagination }` envelope
 * (0.2.0 stopped after page 1 on the envelope); stops on `hasNext === false` or an empty page.
 * @deprecated since 0.3.0 — use {@link paginatePages}.
 */
export async function* paginate<T>(
  fetcher: (page: number, limit: number) => Promise<PaginatedResponse<T> | Page<T>>,
  options?: { pageSize?: number; startPage?: number }
): AsyncGenerator<T, void, unknown> {
  const pageSize = options?.pageSize ?? 100;
  let page = options?.startPage ?? 1;
  let hasNext = true;
  while (hasNext) {
    const response = normalizePage<T>(await fetcher(page, pageSize), { page, limit: pageSize });
    for (const item of response.data) yield item;
    hasNext = response.data.length > 0 && response.pagination.hasNext;
    page += 1;
  }
}

/**
 * Collects the items of an async iterable into an array, at most `maxItems` (the iterator's `return()` is called
 * when the cap is reached, so its clean-up runs).
 *
 * @throws {ValidationError} status 0 when `source` is neither an async iterable nor a fetcher function
 *
 * @example
 * ```typescript
 * import { collectAll, paginateOffset } from 'ubudu-rtls-sdk';
 *
 * const first100 = await collectAll(paginateOffset(fetchOffsetPage, { limit: 50 }), { maxItems: 100 });
 * ```
 */
export function collectAll<T>(
  source: AsyncIterable<T>,
  options?: { maxItems?: number }
): Promise<T[]>;
/**
 * The 0.2.0 form: pages through a fetcher with {@link paginate}.
 * @deprecated since 0.3.0 — use `collectAll(paginatePages(fetchPage), { maxItems })`.
 */
export function collectAll<T>(
  fetcher: (page: number, limit: number) => Promise<PaginatedResponse<T> | Page<T>>,
  options?: { pageSize?: number; maxItems?: number }
): Promise<T[]>;
export async function collectAll<T>(
  source:
    AsyncIterable<T> | ((page: number, limit: number) => Promise<PaginatedResponse<T> | Page<T>>),
  options?: { pageSize?: number; maxItems?: number }
): Promise<T[]> {
  const maxItems = options?.maxItems ?? Infinity;
  if (maxItems !== Infinity) integerAtLeast(maxItems, 0, 'maxItems');
  let iterable: AsyncIterable<T>;
  if (typeof source === 'function') {
    iterable = paginate(source, { pageSize: options?.pageSize });
  } else if (isObject(source) && typeof source[Symbol.asyncIterator] === 'function') {
    iterable = source;
  } else {
    throw invalid('source', 'collectAll needs an async iterable (or a 0.2.0 page fetcher)');
  }
  const items: T[] = [];
  if (maxItems === 0) return items;
  for await (const item of iterable) {
    items.push(item);
    if (items.length >= maxItems) break;
  }
  return items;
}

/**
 * The `X-Total-Count` header as a number: the trimmed value when it is a non-negative integer, else `undefined`
 * (missing, `''`, `'-1'`, `'1.5'`, `'12abc'`). The only reader of that header in the SDK. Cross-origin browsers
 * cannot read it (the server exposes no such header to CORS, USI-P1-4), so callers treat `undefined` as "unknown".
 * @internal
 */
export function readTotalCount(headers: Headers): number | undefined {
  const raw = headers.get('x-total-count');
  if (raw === null) return undefined;
  const value = raw.trim();
  return /^\d+$/.test(value) ? Number(value) : undefined;
}
