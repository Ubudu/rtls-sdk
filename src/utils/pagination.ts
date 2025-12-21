import type { QueryOptions, PaginatedResponse } from '../types';

export function buildQueryParams(
  options?: QueryOptions & Record<string, unknown>
): Record<string, string> {
  if (!options) return {};

  const params: Record<string, string> = {};

  if (options.page !== undefined) {
    params.page = String(options.page);
  }

  if (options.limit !== undefined) {
    params.limit = String(options.limit);
  }

  if (options.sort !== undefined) {
    params.sort = Array.isArray(options.sort) ? options.sort.join(',') : options.sort;
  }

  if (options.fields !== undefined) {
    params.fields = options.fields.join(',');
  }

  for (const [key, value] of Object.entries(options)) {
    if (['page', 'limit', 'sort', 'fields'].includes(key)) continue;
    if (value === undefined || value === null) continue;
    if (key.includes(':')) {
      params[key] = String(value);
    }
  }

  return params;
}

export async function* paginate<T>(
  fetcher: (page: number, limit: number) => Promise<PaginatedResponse<T>>,
  options?: { pageSize?: number; startPage?: number }
): AsyncGenerator<T, void, unknown> {
  const pageSize = options?.pageSize ?? 100;
  let currentPage = options?.startPage ?? 1;
  let hasMore = true;

  while (hasMore) {
    const response = await fetcher(currentPage, pageSize);
    for (const item of response.data) {
      yield item;
    }
    hasMore = response.hasNext;
    currentPage++;
  }
}

export async function collectAll<T>(
  fetcher: (page: number, limit: number) => Promise<PaginatedResponse<T>>,
  options?: { pageSize?: number; maxItems?: number }
): Promise<T[]> {
  const items: T[] = [];
  const maxItems = options?.maxItems ?? Infinity;

  for await (const item of paginate(fetcher, { pageSize: options?.pageSize })) {
    items.push(item);
    if (items.length >= maxItems) break;
  }

  return items;
}
