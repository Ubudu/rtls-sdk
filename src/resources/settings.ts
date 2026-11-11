/**
 * Namespace settings (`client.settings`): read-only access to the namespace configuration document.
 *
 * @module resources/settings
 */
import type { RequestOptions } from '../client/base';
import { ResourceBase } from '../client/resource';
import type { CallContext } from '../context';
import { splitCallOptions } from '../utils/args';

/**
 * One tag action of the product UI: a flag, or `{ enabled?, duration? }`. Shape read by the product UI; not in
 * the spec (USI-P5-12).
 */
export type TagActionSetting =
  boolean | { enabled?: boolean; duration?: number; [key: string]: unknown };

/**
 * The `tagActions` setting: `tagActions[action]` (flat form) or `tagActions[service][action]`, where `service` is
 * a tag family such as `pdi`, `minew` or `bleComms` and `action` a key such as `ptlRed` or `uwbBlink`. Shape read by
 * the product UI; not in the spec (USI-P5-12).
 */
export type TagActionsSettings = Record<
  string,
  TagActionSetting | Record<string, TagActionSetting>
>;

/**
 * The settings document of a namespace, as `GET /settings/{app_namespace}` returns it: the stored, free-form
 * settings plus `positionsExpirationPeriod` and `accuracy`, which the server always fills in. The spec omits the
 * server defaults and the `tagActions` key (USI-P5-12). The document may hold namespace identifiers
 * (`linkedApplications`, `assetPermissions`): do not log it.
 */
export interface NamespaceSettings {
  /** Always present; server default `{ accuracy_meter: 5, show: false }`. */
  accuracy: { accuracy_meter: number; show: boolean };
  /** Always present; seconds, server default 60. */
  positionsExpirationPeriod: number;
  assetPermissions?: Record<string, { create?: string[]; read?: string[] }>;
  defaultSelectedModels?: string[];
  lastPositions?: { defaultSearchInterval?: number };
  linkedApplications?: string[];
  map?: { rotation?: number; rotationPerVenue?: Record<string, number> };
  /** Not in the spec (USI-P5-12). */
  tagActions?: TagActionsSettings;
  /** Stored settings are free-form. */
  [key: string]: unknown;
}

/**
 * @deprecated since 0.3.0 — use {@link NamespaceSettings}. The name is kept because `client.getSettings()` returns
 * it.
 */
export type Settings = NamespaceSettings;

/** Read access to the namespace configuration (writing it is an operator task, not wrapped by the SDK). */
export class SettingsResource extends ResourceBase {
  /**
   * The settings document of the namespace (`GET /settings/{app_namespace}`). `positionsExpirationPeriod` (default
   * 60 s) and `accuracy` (default `{ accuracy_meter: 5, show: false }`) are always present; every other key is the
   * stored, free-form configuration. The document may hold namespace identifiers: do not log it.
   *
   * @param options per-call `namespace` (else the client default) and request options
   * @throws {ContextError} when no namespace is given or set (nothing is sent)
   * @throws {AuthenticationError} 401; {@link ServerError} 500 on a store error
   * @example
   * ```typescript
   * import { createRtlsClient } from 'ubudu-rtls-sdk';
   *
   * const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: 'my-namespace' });
   * const settings = await client.settings.get();
   * console.log(settings.positionsExpirationPeriod); // seconds
   * const other = await client.settings.get({ namespace: 'other-namespace', timeoutMs: 5000 });
   * ```
   */
  async get(options?: CallContext & RequestOptions): Promise<NamespaceSettings> {
    const { ctx, request } = splitCallOptions(options);
    return await this.transport.request<NamespaceSettings>('GET', '/settings/{app_namespace}', {
      params: { app_namespace: this.ns(ctx) },
      ...request,
    });
  }
}
