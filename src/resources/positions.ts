import { BaseClient, type RequestOptions } from '../client/base';
import type { QueryOptions, FilterOptions } from '../types';
import { buildQueryParams } from '../utils';

export type ListPositionsOptions = QueryOptions & FilterOptions & Record<string, unknown>;

export interface PositionHistoryOptions {
  timestampFrom: number;
  timestampTo: number;
  key?: string;
  value: string;
}

export interface PublishPositionData {
  user_udid: string;
  lat?: number;
  lon?: number;
  map_uuid?: string;
  user_name?: string;
}

export class PositionsResource {
  constructor(private client: BaseClient) {}

  async listCached(
    namespace: string,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/cache/{app_namespace}/positions', {
          params: { path: { app_namespace: namespace } },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<Record<string, unknown>[]>;
  }

  async getCached(
    namespace: string,
    macAddress: string,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/cache/{app_namespace}/positions/{mac_address}', {
          params: { path: { app_namespace: namespace, mac_address: macAddress } },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<Record<string, unknown>>;
  }

  async getLast(
    namespace: string,
    macAddress: string,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/asset_last_position/{app_namespace}/{mac_address}', {
          params: { path: { app_namespace: namespace, mac_address: macAddress } },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<Record<string, unknown>>;
  }

  async listLast(
    namespace: string,
    options?: ListPositionsOptions & {
      key?: string;
      queryString?: string;
      mapUuids?: string[];
      timestampFrom?: number;
      timestampTo?: number;
    },
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    const { key, queryString, mapUuids, timestampFrom, timestampTo, ...queryOptions } =
      options ?? {};

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/es/last_positions/{appNamespace}', {
          params: {
            path: { appNamespace: namespace },
            query: {
              key,
              queryString,
              mapUuids: mapUuids?.join(','),
              timestampFrom,
              timestampTo,
              ...buildQueryParams(queryOptions),
            } as Record<string, unknown>,
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<Record<string, unknown>[]>;
  }

  async getHistory(
    namespace: string,
    options: PositionHistoryOptions,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/es/position_history/{appNamespace}', {
          params: {
            path: { appNamespace: namespace },
            query: {
              key: options.key ?? 'user.udid',
              value: options.value,
              timestampFrom: String(options.timestampFrom),
              timestampTo: String(options.timestampTo),
            },
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<Record<string, unknown>[]>;
  }

  async publish(
    namespace: string,
    position: PublishPositionData,
    options?: { patchAssetData?: boolean },
    requestOptions?: RequestOptions
  ): Promise<void> {
    await this.client['request'](
      (fetchOpts) =>
        this.client.raw.POST('/publisher/{app_namespace}', {
          params: {
            path: { app_namespace: namespace },
            query: options?.patchAssetData ? { patch_asset_data: 'true' } : undefined,
          },
          body: position as never,
          ...fetchOpts,
        }),
      requestOptions
    );
  }
}
