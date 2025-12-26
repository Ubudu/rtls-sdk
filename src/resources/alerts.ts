import type { BaseClient, RequestOptions } from '../client/base';
import type { CallContext } from '../context';

export interface GetAlertsOptions {
  timestampFrom: number;
  timestampTo: number;
  size?: number;
}

export class AlertsResource {
  constructor(private client: BaseClient) {}

  // ─── Get Alert Rules ────────────────────────────────────────────────────────

  /**
   * Get alert rules for a namespace.
   *
   * @example
   * // Using default namespace
   * const rules = await client.alerts.getRules();
   *
   * // Explicit namespace (legacy)
   * const rules = await client.alerts.getRules('my-namespace');
   */
  async getRules(requestOptions?: RequestOptions): Promise<Record<string, unknown>[]>;
  async getRules(
    namespace: string,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]>;
  async getRules(
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
        this.client.raw.GET('/alert_rules/{app_namespace}', {
          params: { path: { app_namespace: namespace } },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<Record<string, unknown>[]>;
  }

  // ─── Save Alert Rules ───────────────────────────────────────────────────────

  /**
   * Save alert rules for a namespace.
   *
   * @example
   * // Using default namespace
   * await client.alerts.saveRules([{ ... }]);
   *
   * // Explicit namespace (legacy)
   * await client.alerts.saveRules('my-namespace', [{ ... }]);
   */
  async saveRules(
    rules: Record<string, unknown>[],
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]>;
  async saveRules(
    namespace: string,
    rules: Record<string, unknown>[],
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]>;
  async saveRules(
    arg1: string | Record<string, unknown>[],
    arg2?: Record<string, unknown>[] | RequestOptions,
    arg3?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    let namespace: string;
    let rules: Record<string, unknown>[];
    let requestOptions: RequestOptions | undefined;

    if (typeof arg1 === 'string') {
      namespace = arg1;
      rules = arg2 as Record<string, unknown>[];
      requestOptions = arg3;
    } else {
      namespace = this.client.requireNs();
      rules = arg1;
      requestOptions = arg2 as RequestOptions | undefined;
    }

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.POST('/alert_rules/{app_namespace}', {
          params: { path: { app_namespace: namespace } },
          body: rules as never,
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<Record<string, unknown>[]>;
  }

  // ─── List Alerts ────────────────────────────────────────────────────────────

  /**
   * List alerts from Elasticsearch.
   *
   * @example
   * // Using default namespace
   * const alerts = await client.alerts.list({
   *   timestampFrom: Date.now() - 86400000,
   *   timestampTo: Date.now(),
   * });
   *
   * // Explicit namespace (legacy)
   * const alerts = await client.alerts.list('my-namespace', { ... });
   */
  async list(
    options: GetAlertsOptions & CallContext,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]>;
  async list(
    namespace: string,
    options: GetAlertsOptions,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]>;
  async list(
    arg1: string | (GetAlertsOptions & CallContext),
    arg2?: GetAlertsOptions | RequestOptions,
    arg3?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    let namespace: string;
    let options: GetAlertsOptions;
    let requestOptions: RequestOptions | undefined;

    if (typeof arg1 === 'string') {
      namespace = arg1;
      options = arg2 as GetAlertsOptions;
      requestOptions = arg3;
    } else {
      namespace = this.client.requireNs(arg1);
      options = arg1 as GetAlertsOptions;
      requestOptions = arg2 as RequestOptions | undefined;
    }

    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/es/alerts/{appNamespace}', {
          params: {
            path: { appNamespace: namespace },
            query: {
              timestampFrom: String(options.timestampFrom),
              timestampTo: String(options.timestampTo),
              size: options.size,
            },
          },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<Record<string, unknown>[]>;
  }
}
