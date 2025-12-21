import { BaseClient, type RequestOptions } from '../client/base';

export interface GetAlertsOptions {
  timestampFrom: number;
  timestampTo: number;
  size?: number;
}

export class AlertsResource {
  constructor(private client: BaseClient) {}

  async getRules(
    namespace: string,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
    return this.client['request'](
      (fetchOpts) =>
        this.client.raw.GET('/alert_rules/{app_namespace}', {
          params: { path: { app_namespace: namespace } },
          ...fetchOpts,
        }),
      requestOptions
    ) as unknown as Promise<Record<string, unknown>[]>;
  }

  async saveRules(
    namespace: string,
    rules: Record<string, unknown>[],
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
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

  async list(
    namespace: string,
    options: GetAlertsOptions,
    requestOptions?: RequestOptions
  ): Promise<Record<string, unknown>[]> {
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
