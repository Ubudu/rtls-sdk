/**
 * Notification administration (`client.notifications.admin`): tenant configuration and recipient mappings. Every
 * route needs the `manage_api_keys` client role; without it the server answers 403 (`AuthorizationError`).
 *
 * @module resources/notifications/admin
 */
import type { BaseClient, RequestOptions } from '../../client/base';
import { ResourceBase } from '../../client/resource';
import type { CallContext } from '../../context';
import type {
  NotificationRecipientMapping,
  NotificationRecipientMappingInput,
  NotificationRecipientMappingPatch,
  NotificationTenantConfig,
  NotificationTenantConfigPatch,
} from '../../types/notifications';
import { splitCallOptions } from '../../utils/args';
import { assertNonEmptyString, invalidArgument } from './query';

/** Server-managed keys of the tenant document, never sent back. */
const READ_ONLY_KEYS: readonly string[] = ['app_namespace', '_id', 'updated_at', '__v'];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

/**
 * The tenant notification configuration (channel settings, rate limits, retention cap): get, update. Role-gated
 * (`manage_api_keys`).
 */
export class NotificationTenantConfigResource extends ResourceBase {
  /**
   * The tenant configuration with every secret redacted to `{ set: true, fingerprint }`; `{ app_namespace }` alone
   * when nothing is stored.
   * @throws {AuthorizationError} without the `manage_api_keys` role
   */
  async get(options?: CallContext & RequestOptions): Promise<NotificationTenantConfig> {
    const { ctx, request } = splitCallOptions(options);
    return await this.transport.request<NotificationTenantConfig>(
      'GET',
      '/notifications/{namespace}/tenant-config',
      { params: { namespace: this.ns(ctx) }, ...request }
    );
  }

  /**
   * Merges `patch` into the tenant configuration at the top level: an omitted top-level key is kept, a supplied
   * channel object **replaces** the stored one wholesale. Secrets are write-only: a missing, empty or redacted
   * (`{ set: true, fingerprint }`) secret keeps the stored one, so a fetched document can be sent back as is.
   * `app_namespace`, `_id`, `updated_at` and `__v` are stripped. The write always upserts a **permanent** document
   * (there is no delete route) and is audited. Role-gated (`manage_api_keys`).
   * @throws {ValidationError} status 0 when `patch` is not a plain object or has no key left after stripping
   *   (nothing is sent)
   * @throws {AuthorizationError} without the `manage_api_keys` role
   *
   * @example
   * ```typescript
   * const config = await client.notifications.admin.tenantConfig.get();
   * await client.notifications.admin.tenantConfig.update({ ...config, cleanup_cap: { max_purge_days: 365 } });
   * ```
   */
  async update(
    patch: NotificationTenantConfigPatch,
    options?: CallContext & RequestOptions
  ): Promise<NotificationTenantConfig> {
    if (!isPlainObject(patch)) {
      throw invalidArgument('tenantConfig.update: patch must be a plain object', 'patch');
    }
    const body: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      if (!READ_ONLY_KEYS.includes(key) && value !== undefined) body[key] = value;
    }
    if (Object.keys(body).length === 0) {
      throw invalidArgument(
        'tenantConfig.update: patch has no key to write (an empty update would still create a permanent document)',
        'patch'
      );
    }
    const { ctx, request } = splitCallOptions(options);
    return await this.transport.request<NotificationTenantConfig>(
      'PUT',
      '/notifications/{namespace}/tenant-config',
      { params: { namespace: this.ns(ctx) }, body, ...request }
    );
  }
}

/**
 * Recipient mappings (who receives matching engine events by role, zone responsibility or user id): list, get,
 * create, update, delete. Ids look like `map_<epochms>_<seq>` (not ObjectIds). Role-gated (`manage_api_keys`).
 *
 * The mappings are one namespace-wide document written read-modify-write: a concurrent admin edit can be lost.
 * An **enabled** mapping makes its recipients receive every matching engine event.
 */
export class NotificationRecipientMappingsResource extends ResourceBase {
  /**
   * The namespace's mappings (`[]` when none).
   * @throws {AuthorizationError} without the `manage_api_keys` role
   */
  async list(options?: CallContext & RequestOptions): Promise<NotificationRecipientMapping[]> {
    const { ctx, request } = splitCallOptions(options);
    return await this.transport.request<NotificationRecipientMapping[]>(
      'GET',
      '/notifications/{namespace}/recipient-mappings',
      { params: { namespace: this.ns(ctx) }, ...request }
    );
  }

  /**
   * One mapping by id.
   * @param id the mapping's `id` (non-empty string)
   * @throws {ValidationError} status 0 for an empty id (nothing is sent)
   * @throws {NotFoundError} unknown id
   */
  async get(
    id: string,
    options?: CallContext & RequestOptions
  ): Promise<NotificationRecipientMapping> {
    assertNonEmptyString(id, 'id');
    const { ctx, request } = splitCallOptions(options);
    return await this.transport.request<NotificationRecipientMapping>(
      'GET',
      '/notifications/{namespace}/recipient-mappings/{id}',
      { params: { namespace: this.ns(ctx), id }, ...request }
    );
  }

  /**
   * Adds a mapping. `enabled` is required: the server would default it to `true`, which routes matching events to
   * the recipients at once. `recipients.roles` and `recipients.zone_responsibles` are stored but not resolved yet.
   * @throws {ValidationError} status 0 when `input.enabled` is not a boolean (nothing is sent); status 400 for an
   *   invalid value
   *
   * @example
   * ```typescript
   * const mapping = await client.notifications.admin.recipientMappings.create({
   *   enabled: false,
   *   match: { kinds: ['alert'], min_severity: 'critical' },
   *   recipients: { user_ids: ['user-1'] },
   *   channels: ['inapp'],
   * });
   * ```
   */
  async create(
    input: NotificationRecipientMappingInput,
    options?: CallContext & RequestOptions
  ): Promise<NotificationRecipientMapping> {
    if (
      typeof input !== 'object' ||
      input === null ||
      typeof (input as { enabled?: unknown }).enabled !== 'boolean'
    ) {
      throw invalidArgument(
        'recipientMappings.create: input.enabled must be a boolean (the server would default it to true)',
        'enabled'
      );
    }
    const { ctx, request } = splitCallOptions(options);
    return await this.transport.request<NotificationRecipientMapping>(
      'POST',
      '/notifications/{namespace}/recipient-mappings',
      { params: { namespace: this.ns(ctx) }, body: input, ...request }
    );
  }

  /**
   * Shallow-merges the given keys into a mapping.
   * @param id the mapping's `id` (non-empty string)
   * @throws {ValidationError} status 0 for an empty id (nothing is sent); status 400 for an invalid value
   * @throws {NotFoundError} unknown id
   */
  async update(
    id: string,
    patch: NotificationRecipientMappingPatch,
    options?: CallContext & RequestOptions
  ): Promise<NotificationRecipientMapping> {
    assertNonEmptyString(id, 'id');
    const { ctx, request } = splitCallOptions(options);
    return await this.transport.request<NotificationRecipientMapping>(
      'PATCH',
      '/notifications/{namespace}/recipient-mappings/{id}',
      { params: { namespace: this.ns(ctx), id }, body: patch, ...request }
    );
  }

  /**
   * Deletes a mapping (204).
   * @param id the mapping's `id` (non-empty string)
   * @throws {ValidationError} status 0 for an empty id (nothing is sent)
   * @throws {NotFoundError} unknown id
   */
  async delete(id: string, options?: CallContext & RequestOptions): Promise<void> {
    assertNonEmptyString(id, 'id');
    const { ctx, request } = splitCallOptions(options);
    await this.transport.request<void>(
      'DELETE',
      '/notifications/{namespace}/recipient-mappings/{id}',
      { params: { namespace: this.ns(ctx), id }, ...request }
    );
  }
}

/**
 * Notification administration: `tenantConfig` and `recipientMappings`. Every route needs the `manage_api_keys`
 * client role.
 */
export class NotificationsAdminResource extends ResourceBase {
  /** The tenant notification configuration. */
  readonly tenantConfig: NotificationTenantConfigResource;
  /** Recipient mappings. */
  readonly recipientMappings: NotificationRecipientMappingsResource;

  /**
   * Public, so `new XResource(client)` keeps working; the client creates every resource, so the constructor is not
   * part of the documented surface.
   * @internal
   */
  constructor(client: BaseClient) {
    super(client);
    this.tenantConfig = new NotificationTenantConfigResource(client);
    this.recipientMappings = new NotificationRecipientMappingsResource(client);
  }
}
