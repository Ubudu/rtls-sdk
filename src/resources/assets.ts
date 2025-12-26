import type { BaseClient, RequestOptions } from '../client/base';
import type { QueryOptions, FilterOptions } from '../types';
import type { CallContext } from '../context';
import {
  buildQueryParams,
  extractDataArray,
  resolveNamespaceArgs,
  stripContextFromOptions,
} from '../utils';

/** Options for listing assets */
export type ListAssetsOptions = QueryOptions & FilterOptions & Record<string, unknown>;

/** Options with optional context override */
export type ListAssetsParams = ListAssetsOptions & CallContext;

export class AssetsResource {
  constructor(private client: BaseClient) {}

  // ─── List Assets ─────────────────────────────────────────────────────────────

  /**
   * List all assets for a namespace.
   *
   * @example
   * // Using default namespace from client
   * const assets = await client.assets.list();
   * const assets = await client.assets.list({ limit: 10 });
   *
   * // Explicit namespace (legacy, still supported)
   * const assets = await client.assets.list('my-namespace');
   * const assets = await client.assets.list('my-namespace', { limit: 10 });
   *
   * // Override namespace in options
   * const assets = await client.assets.list({ namespace: 'other-ns', limit: 10 });
   */
  async list(
    options?: ListAssetsParams,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]>;
  async list(
    namespace: string,
    options?: ListAssetsOptions,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]>;
  async list(
    arg1?: string | ListAssetsParams,
    arg2?: ListAssetsOptions | RequestOptions,
    arg3?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    const { namespace, options } = resolveNamespaceArgs<ListAssetsOptions>(
      this.client,
      arg1,
      arg2 as ListAssetsOptions
    );
    const requestOptions = typeof arg1 === 'string' ? arg3 : (arg2 as RequestOptions | undefined);
    const cleanOptions = stripContextFromOptions(options);
    const params = buildQueryParams(cleanOptions);

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

  // ─── Get Asset ───────────────────────────────────────────────────────────────

  /**
   * Get a single asset by MAC address.
   *
   * @example
   * // Using default namespace
   * const asset = await client.assets.get('AA:BB:CC:DD:EE:FF');
   *
   * // Explicit namespace (legacy)
   * const asset = await client.assets.get('my-namespace', 'AA:BB:CC:DD:EE:FF');
   */
  async get(macAddress: string, requestOptions?: RequestOptions): Promise<Record<string, unknown>>;
  async get(
    namespace: string,
    macAddress: string,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>>;
  async get(
    arg1: string,
    arg2?: string | RequestOptions,
    arg3?: RequestOptions
  ): Promise<Record<string, unknown>> {
    let namespace: string;
    let macAddress: string;
    let requestOptions: RequestOptions | undefined;

    if (typeof arg2 === 'string') {
      // Legacy: get(namespace, macAddress, requestOptions?)
      namespace = arg1;
      macAddress = arg2;
      requestOptions = arg3;
    } else {
      // New: get(macAddress, requestOptions?)
      namespace = this.client.requireNs();
      macAddress = arg1;
      requestOptions = arg2;
    }

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/assets/{app_namespace}/{mac_address}', {
          params: { path: { app_namespace: namespace, mac_address: macAddress } },
          ...fetchOpts,
        }),
      requestOptions
    ) as Promise<Record<string, unknown>>;
  }

  // ─── Create Asset ────────────────────────────────────────────────────────────

  /**
   * Create a new asset.
   *
   * @example
   * // Using default namespace
   * await client.assets.create('AA:BB:CC:DD:EE:FF', { user_name: 'Forklift 1' });
   *
   * // Explicit namespace (legacy)
   * await client.assets.create('my-namespace', 'AA:BB:CC:DD:EE:FF', { user_name: 'Forklift 1' });
   */
  async create(
    macAddress: string,
    asset: Record<string, unknown>,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>>;
  async create(
    namespace: string,
    macAddress: string,
    asset: Record<string, unknown>,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>>;
  async create(
    arg1: string,
    arg2: string | Record<string, unknown>,
    arg3?: Record<string, unknown> | RequestOptions,
    arg4?: RequestOptions
  ): Promise<Record<string, unknown>> {
    let namespace: string;
    let macAddress: string;
    let asset: Record<string, unknown>;
    let requestOptions: RequestOptions | undefined;

    if (typeof arg2 === 'string') {
      // Legacy: create(namespace, macAddress, asset, requestOptions?)
      namespace = arg1;
      macAddress = arg2;
      asset = arg3 as Record<string, unknown>;
      requestOptions = arg4;
    } else {
      // New: create(macAddress, asset, requestOptions?)
      namespace = this.client.requireNs();
      macAddress = arg1;
      asset = arg2;
      requestOptions = arg3 as RequestOptions | undefined;
    }

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

  // ─── Update Asset ────────────────────────────────────────────────────────────

  /**
   * Update an existing asset.
   *
   * @example
   * // Using default namespace
   * await client.assets.update('AA:BB:CC:DD:EE:FF', { user_name: 'Updated Name' });
   *
   * // Explicit namespace (legacy)
   * await client.assets.update('my-namespace', 'AA:BB:CC:DD:EE:FF', { user_name: 'Updated' });
   */
  async update(
    macAddress: string,
    updates: Record<string, unknown>,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>>;
  async update(
    namespace: string,
    macAddress: string,
    updates: Record<string, unknown>,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>>;
  async update(
    arg1: string,
    arg2: string | Record<string, unknown>,
    arg3?: Record<string, unknown> | RequestOptions,
    arg4?: RequestOptions
  ): Promise<Record<string, unknown>> {
    let namespace: string;
    let macAddress: string;
    let updates: Record<string, unknown>;
    let requestOptions: RequestOptions | undefined;

    if (typeof arg2 === 'string') {
      namespace = arg1;
      macAddress = arg2;
      updates = arg3 as Record<string, unknown>;
      requestOptions = arg4;
    } else {
      namespace = this.client.requireNs();
      macAddress = arg1;
      updates = arg2;
      requestOptions = arg3 as RequestOptions | undefined;
    }

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

  // ─── Delete Asset ────────────────────────────────────────────────────────────

  /**
   * Delete an asset.
   *
   * @example
   * // Using default namespace
   * await client.assets.delete('AA:BB:CC:DD:EE:FF');
   *
   * // Explicit namespace (legacy)
   * await client.assets.delete('my-namespace', 'AA:BB:CC:DD:EE:FF');
   */
  async delete(macAddress: string, requestOptions?: RequestOptions): Promise<void>;
  async delete(
    namespace: string,
    macAddress: string,
    requestOptions?: RequestOptions
  ): Promise<void>;
  async delete(arg1: string, arg2?: string | RequestOptions, arg3?: RequestOptions): Promise<void> {
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

    await this.client['request'](
      (fetchOpts) =>
        this.client.raw.DELETE('/assets/{app_namespace}/{mac_address}', {
          params: { path: { app_namespace: namespace, mac_address: macAddress } },
          ...fetchOpts,
        }),
      requestOptions
    );
  }

  // ─── Batch Save ──────────────────────────────────────────────────────────────

  /**
   * Batch save multiple assets.
   *
   * @example
   * // Using default namespace
   * await client.assets.batchSave([{ mac_address: '...', user_name: '...' }]);
   *
   * // Explicit namespace (legacy)
   * await client.assets.batchSave('my-namespace', [...]);
   */
  async batchSave(
    assets: Record<string, unknown>[],
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>>;
  async batchSave(
    namespace: string,
    assets: Record<string, unknown>[],
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>>;
  async batchSave(
    arg1: string | Record<string, unknown>[],
    arg2?: Record<string, unknown>[] | RequestOptions,
    arg3?: RequestOptions
  ): Promise<Record<string, unknown>> {
    let namespace: string;
    let assets: Record<string, unknown>[];
    let requestOptions: RequestOptions | undefined;

    if (typeof arg1 === 'string') {
      namespace = arg1;
      assets = arg2 as Record<string, unknown>[];
      requestOptions = arg3;
    } else {
      namespace = this.client.requireNs();
      assets = arg1;
      requestOptions = arg2 as RequestOptions | undefined;
    }

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

  // ─── Batch Delete ────────────────────────────────────────────────────────────

  /**
   * Batch delete multiple assets by MAC address.
   *
   * @example
   * // Using default namespace
   * await client.assets.batchDelete(['AA:BB:CC:DD:EE:FF', '11:22:33:44:55:66']);
   *
   * // Explicit namespace (legacy)
   * await client.assets.batchDelete('my-namespace', [...]);
   */
  async batchDelete(
    macAddresses: string[],
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>>;
  async batchDelete(
    namespace: string,
    macAddresses: string[],
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>>;
  async batchDelete(
    arg1: string | string[],
    arg2?: string[] | RequestOptions,
    arg3?: RequestOptions
  ): Promise<Record<string, unknown>> {
    let namespace: string;
    let macAddresses: string[];
    let requestOptions: RequestOptions | undefined;

    if (typeof arg1 === 'string' && Array.isArray(arg2)) {
      namespace = arg1;
      macAddresses = arg2;
      requestOptions = arg3;
    } else {
      namespace = this.client.requireNs();
      macAddresses = arg1 as string[];
      requestOptions = arg2 as RequestOptions | undefined;
    }

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

  // ─── Async Iterator ──────────────────────────────────────────────────────────

  /**
   * Iterate over all assets with automatic pagination.
   *
   * @example
   * // Using default namespace
   * for await (const asset of client.assets.iterate()) {
   *   console.log(asset);
   * }
   *
   * // Explicit namespace (legacy)
   * for await (const asset of client.assets.iterate('my-namespace')) {
   *   console.log(asset);
   * }
   */
  iterate(options?: ListAssetsParams): AsyncGenerator<Record<string, unknown>>;
  iterate(namespace: string, options?: ListAssetsOptions): AsyncGenerator<Record<string, unknown>>;
  async *iterate(
    arg1?: string | ListAssetsParams,
    arg2?: ListAssetsOptions
  ): AsyncGenerator<Record<string, unknown>> {
    // Assets API returns all items at once, no pagination needed
    const assets = await this.list(arg1 as any, arg2);
    for (const asset of assets) {
      yield asset;
    }
  }

  // ─── Get All (convenience) ───────────────────────────────────────────────────

  /**
   * Get all assets as array.
   *
   * @example
   * // Using default namespace
   * const allAssets = await client.assets.getAll();
   *
   * // Explicit namespace (legacy)
   * const allAssets = await client.assets.getAll('my-namespace');
   */
  async getAll(
    options?: ListAssetsParams,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]>;
  async getAll(
    namespace: string,
    options?: ListAssetsOptions,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]>;
  async getAll(
    arg1?: string | ListAssetsParams,
    arg2?: ListAssetsOptions | RequestOptions,
    arg3?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    return this.list(arg1 as any, arg2 as any, arg3);
  }
}
