import { BaseClient, type RequestOptions } from '../client/base';
import type { QueryOptions, FilterOptions, PaginatedResponse } from '../types';
import { buildQueryParams, paginate, collectAll } from '../utils';

export type ListZonesOptions = QueryOptions & FilterOptions & Record<string, unknown>;

export interface ZonePresenceOptions {
  timestampFrom: number;
  timestampTo: number;
  key?: string;
  value?: string;
  interval?: string;
}

export class ZonesResource {
  constructor(private client: BaseClient) {}

  async list(
    namespace: string,
    venueId: string | number,
    options?: ListZonesOptions,
    requestOptions?: RequestOptions
  ): Promise<PaginatedResponse<Record<string, unknown>>> {
    const params = buildQueryParams(options);

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/venues/{namespace}/{venueId}/zones', {
          params: {
            path: { namespace, venueId: String(venueId) },
            query: params as Record<string, unknown>,
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<PaginatedResponse<Record<string, unknown>>>;
  }

  async listByMap(
    namespace: string,
    venueId: string | number,
    mapId: string | number,
    options?: ListZonesOptions,
    requestOptions?: RequestOptions
  ): Promise<PaginatedResponse<Record<string, unknown>>> {
    const params = buildQueryParams(options);

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/venues/{namespace}/{venueId}/maps/{mapId}/zones', {
          params: {
            path: { namespace, venueId: Number(venueId), mapId: Number(mapId) },
            query: params as never,
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<PaginatedResponse<Record<string, unknown>>>;
  }

  async getPresence(
    namespace: string,
    options: ZonePresenceOptions,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/es/zone_presence/{appNamespace}', {
          params: {
            path: { appNamespace: namespace },
            query: {
              timestampFrom: String(options.timestampFrom),
              timestampTo: String(options.timestampTo),
              key: options.key,
              value: options.value,
              interval: options.interval,
            },
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<Record<string, unknown>[]>;
  }

  iterate(
    namespace: string,
    venueId: string | number,
    options?: Omit<ListZonesOptions, 'page' | 'limit'> & { pageSize?: number }
  ): AsyncGenerator<Record<string, unknown>, void, unknown> {
    const { pageSize, ...filterOptions } = options ?? {};
    return paginate(
      (page, limit) => this.list(namespace, venueId, { ...filterOptions, page, limit }),
      { pageSize }
    );
  }

  async getAll(
    namespace: string,
    venueId: string | number,
    options?: Omit<ListZonesOptions, 'page' | 'limit'> & { pageSize?: number; maxItems?: number }
  ): Promise<Record<string, unknown>[]> {
    const { pageSize, maxItems, ...filterOptions } = options ?? {};
    return collectAll(
      (page, limit) => this.list(namespace, venueId, { ...filterOptions, page, limit }),
      { pageSize, maxItems }
    );
  }
}
