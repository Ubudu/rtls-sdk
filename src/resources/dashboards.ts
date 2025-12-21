import { BaseClient, type RequestOptions } from '../client/base';

export interface CreateDashboardData {
  name: string;
  namespace: string;
  data?: Record<string, unknown>;
}

export interface UpdateDashboardData {
  name?: string;
  data?: Record<string, unknown>;
}

export interface SharePermissions {
  read?: boolean;
  write?: boolean;
  delete?: boolean;
}

export class DashboardsResource {
  constructor(private client: BaseClient) {}

  async list(
    namespace?: string,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/dashboards', {
          params: { query: namespace ? { namespace } : undefined },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<Record<string, unknown>[]>;
  }

  async listCreated(
    namespace?: string,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/dashboards/created', {
          params: { query: namespace ? { namespace } : undefined },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<Record<string, unknown>[]>;
  }

  async listShared(
    namespace?: string,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/dashboards/shared', {
          params: { query: namespace ? { namespace } : undefined },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<Record<string, unknown>[]>;
  }

  async listSelected(
    namespace?: string,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/dashboards/selected', {
          params: { query: namespace ? { namespace } : undefined },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<Record<string, unknown>[]>;
  }

  async get(
    id: string,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/dashboards/{id}', {
          params: { path: { id } },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<Record<string, unknown>>;
  }

  async create(
    data: CreateDashboardData,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.POST('/dashboards', {
          body: data as never,
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<Record<string, unknown>>;
  }

  async update(
    id: string,
    data: UpdateDashboardData,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.PUT('/dashboards/{id}', {
          params: { path: { id } },
          body: data as never,
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<Record<string, unknown>>;
  }

  async delete(
    id: string,
    requestOptions?: RequestOptions
  ): Promise<void> {
    await this.client['request'](
      (fetchOpts) =>
        this.client.raw.DELETE('/dashboards/{id}', {
          params: { path: { id } },
          ...fetchOpts,
        }),
      requestOptions
    );
  }

  async share(
    id: string,
    users: Array<{ username: string; permissions: SharePermissions }>,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.POST('/dashboards/{id}/share', {
          params: { path: { id } },
          body: { users } as never,
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<Record<string, unknown>>;
  }

  async unshare(
    id: string,
    usernames: string[],
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.POST('/dashboards/{id}/unshare', {
          params: { path: { id } },
          body: { usernames } as never,
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<Record<string, unknown>>;
  }
}
