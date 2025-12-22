import { BaseClient, type RequestOptions } from '../client/base';
import type { QueryOptions, FilterOptions } from '../types';
import { buildQueryParams, extractDataArray } from '../utils';

export type ListAssetsOptions = QueryOptions & FilterOptions & Record<string, unknown>;

export class AssetsResource {
  constructor(private client: BaseClient) {}

  /**
   * List all assets for a namespace.
   * API returns direct array, not paginated.
   */
  async list(
    namespace: string,
    options?: ListAssetsOptions,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    const params = buildQueryParams(options);
    const response = await this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/assets/{app_namespace}', {
          params: { path: { app_namespace: namespace }, query: params as Record<string, unknown> },
          ...fetchOpts,
        }),
      requestOptions
    );
    return extractDataArray<Record<string, unknown>>(response);
  }

  /**
   * Get a single asset by MAC address.
   */
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

  /**
   * Create a new asset.
   */
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

  /**
   * Update an existing asset.
   */
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

  /**
   * Delete an asset.
   */
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

  /**
   * Batch save multiple assets.
   */
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

  /**
   * Batch delete multiple assets.
   */
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

  /**
   * Get asset history.
   */
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

  /**
   * Get asset statistics.
   */
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

  /**
   * Iterate over all assets.
   * Since API returns all assets at once, yields each asset.
   */
  async *iterate(
    namespace: string,
    options?: ListAssetsOptions,
    requestOptions?: RequestOptions
  ): AsyncGenerator<Record<string, unknown>, void, unknown> {
    const assets = await this.list(namespace, options, requestOptions);
    for (const asset of assets) {
      yield asset;
    }
  }

  /**
   * Get all assets as array.
   */
  async getAll(
    namespace: string,
    options?: ListAssetsOptions,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    return this.list(namespace, options, requestOptions);
  }
}
