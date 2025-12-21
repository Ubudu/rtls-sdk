import { BaseClient, type RequestOptions } from '../client/base';
import type { QueryOptions, FilterOptions, PaginatedResponse } from '../types';
import { buildQueryParams, paginate } from '../utils';

export type ListVenuesOptions = QueryOptions & FilterOptions & Record<string, unknown>;

export class VenuesResource {
  constructor(private client: BaseClient) {}

  async list(
    namespace: string,
    options?: ListVenuesOptions,
    requestOptions?: RequestOptions
  ): Promise<PaginatedResponse<Record<string, unknown>>> {
    const params = buildQueryParams(options);

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/venues/{namespace}', {
          params: { path: { namespace }, query: params as Record<string, unknown> },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<PaginatedResponse<Record<string, unknown>>>;
  }

  async get(
    namespace: string,
    venueId: string | number,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/venues/{namespace}/{venueId}', {
          params: { path: { namespace, venueId: Number(venueId) } },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<Record<string, unknown>>;
  }

  async listMaps(
    namespace: string,
    venueId: string | number,
    options?: ListVenuesOptions,
    requestOptions?: RequestOptions
  ): Promise<PaginatedResponse<Record<string, unknown>>> {
    const params = buildQueryParams(options);

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/venues/{namespace}/{venueId}/maps', {
          params: { path: { namespace, venueId: Number(venueId) }, query: params as Record<string, unknown> },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<PaginatedResponse<Record<string, unknown>>>;
  }

  async listPois(
    namespace: string,
    venueId: string | number,
    options?: ListVenuesOptions,
    requestOptions?: RequestOptions
  ): Promise<PaginatedResponse<Record<string, unknown>>> {
    const params = buildQueryParams(options);

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/venues/{namespace}/{venueId}/pois', {
          params: { path: { namespace, venueId: String(venueId) }, query: params as Record<string, unknown> },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<PaginatedResponse<Record<string, unknown>>>;
  }

  async listMapPois(
    namespace: string,
    venueId: string | number,
    mapId: string | number,
    options?: ListVenuesOptions,
    requestOptions?: RequestOptions
  ): Promise<PaginatedResponse<Record<string, unknown>>> {
    const params = buildQueryParams(options);

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/venues/{namespace}/{venueId}/maps/{mapId}/pois', {
          params: { path: { namespace, venueId: Number(venueId), mapId: Number(mapId) }, query: params as never },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<PaginatedResponse<Record<string, unknown>>>;
  }

  async listPaths(
    namespace: string,
    venueId: string | number,
    options?: ListVenuesOptions,
    requestOptions?: RequestOptions
  ): Promise<PaginatedResponse<Record<string, unknown>>> {
    const params = buildQueryParams(options);

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/venues/{namespace}/{venueId}/paths', {
          params: { path: { namespace, venueId: String(venueId) }, query: params as Record<string, unknown> },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<PaginatedResponse<Record<string, unknown>>>;
  }

  iterate(
    namespace: string,
    options?: Omit<ListVenuesOptions, 'page' | 'limit'> & { pageSize?: number }
  ): AsyncGenerator<Record<string, unknown>, void, unknown> {
    const { pageSize, ...filterOptions } = options ?? {};
    return paginate(
      (page, limit) => this.list(namespace, { ...filterOptions, page, limit }),
      { pageSize }
    );
  }
}
