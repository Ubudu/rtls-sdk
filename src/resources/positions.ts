import type { BaseClient, RequestOptions } from '../client/base';
import type { QueryOptions, FilterOptions } from '../types';
import type { CallContext } from '../context';
import { buildQueryParams, stripContextFromOptions } from '../utils';

export type ListPositionsOptions = QueryOptions & FilterOptions & Record<string, unknown>;
export type ListPositionsParams = ListPositionsOptions & CallContext;

export interface PositionHistoryOptions {
  timestampFrom: number;
  timestampTo: number;
  key?: string;
  value: string;
}

export interface ListLastPositionsOptions extends ListPositionsOptions {
  key?: string;
  queryString?: string;
  mapUuids?: string[];
  timestampFrom?: number;
  timestampTo?: number;
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

  // ─── List Cached Positions ──────────────────────────────────────────────────

  /**
   * List all cached positions for a namespace.
   *
   * @example
   * // Using default namespace
   * const positions = await client.positions.listCached();
   *
   * // Explicit namespace (legacy)
   * const positions = await client.positions.listCached('my-namespace');
   */
  async listCached(requestOptions?: RequestOptions): Promise<Record<string, unknown>[]>;
  async listCached(namespace: string, requestOptions?: RequestOptions): Promise<Record<string, unknown>[]>;
  async listCached(
    arg1?: string | RequestOptions,
    arg2?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    let namespace: string;
    let requestOptions: RequestOptions | undefined;

    if (typeof arg1 === 'string') {
      namespace = arg1;
      requestOptions = arg2;
    } else {
      namespace = this.client.requireNs();
      requestOptions = arg1;
    }

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/cache/{app_namespace}/positions', {
          params: { path: { app_namespace: namespace } },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<Record<string, unknown>[]>;
  }

  // ─── Get Cached Position ────────────────────────────────────────────────────

  /**
   * Get a single cached position by MAC address.
   *
   * @example
   * // Using default namespace
   * const position = await client.positions.getCached('AA:BB:CC:DD:EE:FF');
   *
   * // Explicit namespace (legacy)
   * const position = await client.positions.getCached('my-namespace', 'AA:BB:CC:DD:EE:FF');
   */
  async getCached(macAddress: string, requestOptions?: RequestOptions): Promise<Record<string, unknown>>;
  async getCached(namespace: string, macAddress: string, requestOptions?: RequestOptions): Promise<Record<string, unknown>>;
  async getCached(
    arg1: string,
    arg2?: string | RequestOptions,
    arg3?: RequestOptions
  ): Promise<Record<string, unknown>> {
    let namespace: string;
    let macAddress: string;
    let requestOptions: RequestOptions | undefined;

    if (typeof arg2 === 'string') {
      namespace = arg1;
      macAddress = arg2;
      requestOptions = arg3;
    } else {
      namespace = this.client.requireNs();
      macAddress = arg1;
      requestOptions = arg2;
    }

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/cache/{app_namespace}/positions/{mac_address}', {
          params: { path: { app_namespace: namespace, mac_address: macAddress } },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<Record<string, unknown>>;
  }

  // ─── Get Last Position ──────────────────────────────────────────────────────

  /**
   * Get the last known position for an asset.
   *
   * @example
   * // Using default namespace
   * const position = await client.positions.getLast('AA:BB:CC:DD:EE:FF');
   *
   * // Explicit namespace (legacy)
   * const position = await client.positions.getLast('my-namespace', 'AA:BB:CC:DD:EE:FF');
   */
  async getLast(macAddress: string, requestOptions?: RequestOptions): Promise<Record<string, unknown>>;
  async getLast(namespace: string, macAddress: string, requestOptions?: RequestOptions): Promise<Record<string, unknown>>;
  async getLast(
    arg1: string,
    arg2?: string | RequestOptions,
    arg3?: RequestOptions
  ): Promise<Record<string, unknown>> {
    let namespace: string;
    let macAddress: string;
    let requestOptions: RequestOptions | undefined;

    if (typeof arg2 === 'string') {
      namespace = arg1;
      macAddress = arg2;
      requestOptions = arg3;
    } else {
      namespace = this.client.requireNs();
      macAddress = arg1;
      requestOptions = arg2;
    }

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/asset_last_position/{app_namespace}/{mac_address}', {
          params: { path: { app_namespace: namespace, mac_address: macAddress } },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<Record<string, unknown>>;
  }

  // ─── List Last Positions ────────────────────────────────────────────────────

  /**
   * List last known positions with filtering.
   *
   * @example
   * // Using default namespace
   * const positions = await client.positions.listLast();
   * const positions = await client.positions.listLast({ mapUuids: ['uuid1'] });
   *
   * // Explicit namespace (legacy)
   * const positions = await client.positions.listLast('my-namespace');
   */
  async listLast(options?: ListLastPositionsOptions & CallContext, requestOptions?: RequestOptions): Promise<Record<string, unknown>[]>;
  async listLast(namespace: string, options?: ListLastPositionsOptions, requestOptions?: RequestOptions): Promise<Record<string, unknown>[]>;
  async listLast(
    arg1?: string | (ListLastPositionsOptions & CallContext),
    arg2?: ListLastPositionsOptions | RequestOptions,
    arg3?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    let namespace: string;
    let options: ListLastPositionsOptions | undefined;
    let requestOptions: RequestOptions | undefined;

    if (typeof arg1 === 'string') {
      namespace = arg1;
      options = arg2 as ListLastPositionsOptions | undefined;
      requestOptions = arg3;
    } else {
      namespace = this.client.requireNs(arg1);
      options = stripContextFromOptions(arg1) as ListLastPositionsOptions | undefined;
      requestOptions = arg2 as RequestOptions | undefined;
    }

    const { key, queryString, mapUuids, timestampFrom, timestampTo, ...queryOptions } = options ?? {};

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

  // ─── Get Position History ───────────────────────────────────────────────────

  /**
   * Get position history for an asset.
   *
   * @example
   * // Using default namespace
   * const history = await client.positions.getHistory({
   *   value: 'asset-id',
   *   timestampFrom: Date.now() - 86400000,
   *   timestampTo: Date.now(),
   * });
   *
   * // Explicit namespace (legacy)
   * const history = await client.positions.getHistory('my-namespace', {...});
   */
  async getHistory(options: PositionHistoryOptions & CallContext, requestOptions?: RequestOptions): Promise<Record<string, unknown>[]>;
  async getHistory(namespace: string, options: PositionHistoryOptions, requestOptions?: RequestOptions): Promise<Record<string, unknown>[]>;
  async getHistory(
    arg1: string | (PositionHistoryOptions & CallContext),
    arg2?: PositionHistoryOptions | RequestOptions,
    arg3?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    let namespace: string;
    let options: PositionHistoryOptions;
    let requestOptions: RequestOptions | undefined;

    if (typeof arg1 === 'string') {
      namespace = arg1;
      options = arg2 as PositionHistoryOptions;
      requestOptions = arg3;
    } else {
      namespace = this.client.requireNs(arg1);
      options = arg1 as PositionHistoryOptions;
      requestOptions = arg2 as RequestOptions | undefined;
    }

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

  // ─── Publish Position ───────────────────────────────────────────────────────

  /**
   * Publish a position update.
   *
   * @example
   * // Using default namespace
   * await client.positions.publish({ user_udid: 'asset-id', lat: 48.85, lon: 2.35 });
   *
   * // Explicit namespace (legacy)
   * await client.positions.publish('my-namespace', { user_udid: 'asset-id', lat: 48.85, lon: 2.35 });
   */
  async publish(position: PublishPositionData, options?: { patchAssetData?: boolean } & CallContext, requestOptions?: RequestOptions): Promise<void>;
  async publish(namespace: string, position: PublishPositionData, options?: { patchAssetData?: boolean }, requestOptions?: RequestOptions): Promise<void>;
  async publish(
    arg1: string | PublishPositionData,
    arg2?: PublishPositionData | ({ patchAssetData?: boolean } & CallContext) | RequestOptions,
    arg3?: { patchAssetData?: boolean } | RequestOptions,
    arg4?: RequestOptions
  ): Promise<void> {
    let namespace: string;
    let position: PublishPositionData;
    let patchAssetData: boolean | undefined;
    let requestOptions: RequestOptions | undefined;

    if (typeof arg1 === 'string') {
      namespace = arg1;
      position = arg2 as PublishPositionData;
      patchAssetData = (arg3 as { patchAssetData?: boolean } | undefined)?.patchAssetData;
      requestOptions = arg4;
    } else {
      namespace = this.client.requireNs(arg2 as CallContext | undefined);
      position = arg1;
      const opts = arg2 as { patchAssetData?: boolean } & CallContext | undefined;
      patchAssetData = opts?.patchAssetData;
      requestOptions = arg3 as RequestOptions | undefined;
    }

    await this.client['request'](
      (fetchOpts) =>
        this.client.raw.POST('/publisher/{app_namespace}', {
          params: {
            path: { app_namespace: namespace },
            query: patchAssetData ? { patch_asset_data: 'true' } : undefined,
          },
          body: position as never,
          ...fetchOpts,
        }),
      requestOptions
    );
  }
}
