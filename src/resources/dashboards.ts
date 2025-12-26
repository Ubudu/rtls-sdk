import type { BaseClient, RequestOptions } from '../client/base';
import type { CallContext } from '../context';

export interface CreateDashboardData {
  name: string;
  namespace?: string;
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

  // ─── List Dashboards ────────────────────────────────────────────────────────

  /**
   * List all dashboards, optionally filtered by namespace.
   * Uses client's default namespace if available.
   *
   * @example
   * // Using default namespace
   * const dashboards = await client.dashboards.list();
   *
   * // Explicit namespace (legacy)
   * const dashboards = await client.dashboards.list('my-namespace');
   */
  async list(
    options?: CallContext,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]>;
  async list(
    namespace: string,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]>;
  async list(
    arg1?: string | CallContext,
    arg2?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    let namespace: string | undefined;
    let requestOptions: RequestOptions | undefined;

    if (typeof arg1 === 'string') {
      namespace = arg1;
      requestOptions = arg2;
    } else {
      namespace = arg1?.namespace ?? this.client.namespace;
      requestOptions = arg2;
    }

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/dashboards', {
          params: { query: namespace ? { namespace } : undefined },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<Record<string, unknown>[]>;
  }

  // ─── List Created Dashboards ────────────────────────────────────────────────

  async listCreated(
    options?: CallContext,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]>;
  async listCreated(
    namespace: string,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]>;
  async listCreated(
    arg1?: string | CallContext,
    arg2?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    let namespace: string | undefined;
    let requestOptions: RequestOptions | undefined;

    if (typeof arg1 === 'string') {
      namespace = arg1;
      requestOptions = arg2;
    } else {
      namespace = arg1?.namespace ?? this.client.namespace;
      requestOptions = arg2;
    }

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/dashboards/created', {
          params: { query: namespace ? { namespace } : undefined },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<Record<string, unknown>[]>;
  }

  // ─── List Shared Dashboards ─────────────────────────────────────────────────

  async listShared(
    options?: CallContext,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]>;
  async listShared(
    namespace: string,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]>;
  async listShared(
    arg1?: string | CallContext,
    arg2?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    let namespace: string | undefined;
    let requestOptions: RequestOptions | undefined;

    if (typeof arg1 === 'string') {
      namespace = arg1;
      requestOptions = arg2;
    } else {
      namespace = arg1?.namespace ?? this.client.namespace;
      requestOptions = arg2;
    }

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/dashboards/shared', {
          params: { query: namespace ? { namespace } : undefined },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<Record<string, unknown>[]>;
  }

  // ─── List Selected Dashboards ───────────────────────────────────────────────

  async listSelected(
    options?: CallContext,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]>;
  async listSelected(
    namespace: string,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]>;
  async listSelected(
    arg1?: string | CallContext,
    arg2?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    let namespace: string | undefined;
    let requestOptions: RequestOptions | undefined;

    if (typeof arg1 === 'string') {
      namespace = arg1;
      requestOptions = arg2;
    } else {
      namespace = arg1?.namespace ?? this.client.namespace;
      requestOptions = arg2;
    }

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/dashboards/selected', {
          params: { query: namespace ? { namespace } : undefined },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<Record<string, unknown>[]>;
  }

  // ─── Get Dashboard ──────────────────────────────────────────────────────────

  async get(id: string, requestOptions?: RequestOptions): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/dashboards/{id}', {
          params: { path: { id } },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<Record<string, unknown>>;
  }

  // ─── Create Dashboard ───────────────────────────────────────────────────────

  /**
   * Create a new dashboard.
   * Uses client's default namespace if not specified in data.
   */
  async create(
    data: CreateDashboardData,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    const namespace = data.namespace ?? this.client.namespace;
    if (!namespace) {
      throw new Error('Namespace is required for creating a dashboard');
    }

    const apiData = {
      name: data.name,
      application_namespace: namespace,
      data: data.data ?? {},
    };

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.POST('/dashboards', {
          body: apiData as never,
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<Record<string, unknown>>;
  }

  // ─── Update Dashboard ───────────────────────────────────────────────────────

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

  // ─── Delete Dashboard ───────────────────────────────────────────────────────

  async delete(id: string, requestOptions?: RequestOptions): Promise<void> {
    await this.client['request'](
      (fetchOpts) =>
        this.client.raw.DELETE('/dashboards/{id}', {
          params: { path: { id } },
          ...fetchOpts,
        }),
      requestOptions
    );
  }

  // ─── Share Dashboard ────────────────────────────────────────────────────────

  async share(
    id: string,
    email: string,
    permissions: SharePermissions,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.POST('/dashboards/{id}/share', {
          params: { path: { id } },
          body: { users: [{ username: email, permissions }] } as never,
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<Record<string, unknown>>;
  }

  // ─── Unshare Dashboard ──────────────────────────────────────────────────────

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
