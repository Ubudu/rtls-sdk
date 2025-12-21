import { BaseClient, type RequestOptions } from '../client/base';
import type { QueryOptions, FilterOptions, PaginatedResponse } from '../types';
import { buildQueryParams, paginate, collectAll } from '../utils';

export type ListAssetsOptions = QueryOptions & FilterOptions & Record<string, unknown>;

export class AssetsResource {
  constructor(private client: BaseClient) {}

  async list(
    namespace: string,
    options?: ListAssetsOptions,
    requestOptions?: RequestOptions
  ): Promise<PaginatedResponse<Record<string, unknown>>> {
    const params = buildQueryParams(options);

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/assets/{app_namespace}', {
          params: { path: { app_namespace: namespace }, query: params as Record<string, unknown> },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<PaginatedResponse<Record<string, unknown>>>;
  }

  async get(
    namespace: string,
    macAddress: string,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/assets/{app_namespace}/{mac_address}', {
          params: { path: { app_namespace: namespace, mac_address: macAddress } },
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>>;
  }

  async create(
    namespace: string,
    macAddress: string,
    asset: Record<string, unknown>,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.POST('/assets/{app_namespace}/{mac_address}', {
          params: { path: { app_namespace: namespace, mac_address: macAddress } },
          body: asset as never,
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>>;
  }

  async update(
    namespace: string,
    macAddress: string,
    updates: Record<string, unknown>,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.PATCH('/assets/{app_namespace}/{mac_address}', {
          params: { path: { app_namespace: namespace, mac_address: macAddress } },
          body: updates as never,
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>>;
  }

  async delete(
    namespace: string,
    macAddress: string,
    requestOptions?: RequestOptions
  ): Promise<void> {
    await this.client['request'](
      (fetchOpts) =>
        this.client.raw.DELETE('/assets/{app_namespace}/{mac_address}', {
          params: { path: { app_namespace: namespace, mac_address: macAddress } },
          ...fetchOpts,
        }),
      requestOptions
    );
  }

  async batchSave(
    namespace: string,
    assets: Record<string, unknown>[],
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.POST('/assets/{app_namespace}', {
          params: { path: { app_namespace: namespace } },
          body: assets as never,
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>>;
  }

  async batchDelete(
    namespace: string,
    macAddresses: string[],
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.DELETE('/assets/{app_namespace}', {
          params: { path: { app_namespace: namespace } },
          body: macAddresses as never,
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>>;
  }

  async getHistory(
    namespace: string,
    macAddress: string,
    options: { startTime: number; endTime: number },
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/asset_history/{app_namespace}/{mac_address}', {
          params: {
            path: { app_namespace: namespace, mac_address: macAddress },
            query: { start_time: options.startTime, end_time: options.endTime },
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>[]>;
  }

  async getStats(
    namespace: string,
    options: { startTime: number; endTime: number },
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/asset_stats/{app_namespace}/{start_time}/{end_time}', {
          params: {
            path: {
              app_namespace: namespace,
              start_time: options.startTime,
              end_time: options.endTime,
            },
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>>;
  }

  iterate(
    namespace: string,
    options?: Omit<ListAssetsOptions, 'page' | 'limit'> & { pageSize?: number }
  ): AsyncGenerator<Record<string, unknown>, void, unknown> {
    const { pageSize, ...filterOptions } = options ?? {};
    return paginate((page, limit) => this.list(namespace, { ...filterOptions, page, limit }), {
      pageSize,
    });
  }

  async getAll(
    namespace: string,
    options?: Omit<ListAssetsOptions, 'page' | 'limit'> & { pageSize?: number; maxItems?: number }
  ): Promise<Record<string, unknown>[]> {
    const { pageSize, maxItems, ...filterOptions } = options ?? {};
    return collectAll((page, limit) => this.list(namespace, { ...filterOptions, page, limit }), {
      pageSize,
      maxItems,
    });
  }
}
