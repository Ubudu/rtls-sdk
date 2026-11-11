/**
 * The caller's notification cleanup policy (`client.notifications.cleanupPolicy`).
 *
 * @module resources/notifications/cleanup-policy
 */
import type { RequestOptions } from '../../client/base';
import { ResourceBase } from '../../client/resource';
import type { CallContext } from '../../context';
import type {
  NotificationCleanupPolicy,
  NotificationCleanupPolicyInput,
} from '../../types/notifications';
import { splitCallOptions } from '../../utils/args';
import { invalidArgument } from './query';

/** A field as the caller gave it: JavaScript callers can pass any value, `null` included. */
function givenField(
  policy: Partial<Record<keyof NotificationCleanupPolicyInput, unknown>> | null | undefined,
  key: keyof NotificationCleanupPolicyInput
): unknown {
  return policy?.[key];
}

/** The notification retention policy: get, replace (the server has no delete route). */
export class NotificationCleanupPolicyResource extends ResourceBase {
  /**
   * The caller's policy: the stored row, or the server defaults (`auto_archive_days: 30`, `auto_purge_days: 180`)
   * without `_id` when nothing is stored. The read never creates a row.
   * @throws {ContextError} no namespace (per call or client default); nothing is sent
   */
  async get(options?: CallContext & RequestOptions): Promise<NotificationCleanupPolicy> {
    const { ctx, request } = splitCallOptions(options);
    return await this.transport.request<NotificationCleanupPolicy>(
      'GET',
      '/notifications/{namespace}/cleanup-policy',
      { params: { namespace: this.ns(ctx) }, ...request }
    );
  }

  /**
   * Replaces the caller's policy. Both fields are required on every write: the server resets an omitted field to
   * its default rather than keeping it.
   *
   * Warning (USI-P6-6): this creates a **permanent** row (there is no delete route); the values are clamped to the
   * tenant `cleanup_cap`.
   * @throws {ValidationError} status 0 unless both fields are integers `>= 1` (nothing is sent)
   *
   * @example
   * ```typescript
   * await client.notifications.cleanupPolicy.replace({ auto_archive_days: 30, auto_purge_days: 180 });
   * ```
   */
  async replace(
    policy: NotificationCleanupPolicyInput,
    options?: CallContext & RequestOptions
  ): Promise<NotificationCleanupPolicy> {
    for (const key of ['auto_archive_days', 'auto_purge_days'] as const) {
      const value = givenField(policy, key);
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
        throw invalidArgument(
          `cleanupPolicy.replace: ${key} must be an integer >= 1, not ${String(value)}`,
          key
        );
      }
    }
    const { ctx, request } = splitCallOptions(options);
    return await this.transport.request<NotificationCleanupPolicy>(
      'PUT',
      '/notifications/{namespace}/cleanup-policy',
      {
        params: { namespace: this.ns(ctx) },
        body: {
          auto_archive_days: policy.auto_archive_days,
          auto_purge_days: policy.auto_purge_days,
        },
        ...request,
      }
    );
  }
}
