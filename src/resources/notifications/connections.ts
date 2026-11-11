/**
 * Notification channel connections (`client.notifications.connections`): the caller's own channels.
 *
 * @module resources/notifications/connections
 */
import type { RequestOptions } from '../../client/base';
import { ResourceBase } from '../../client/resource';
import type { CallContext } from '../../context';
import { RtlsError } from '../../errors';
import type {
  NotificationConnection,
  NotificationConnectionInput,
  NotificationConnectionTestResult,
} from '../../types/notifications';
import { splitCallOptions } from '../../utils/args';
import { assertObjectId } from './query';

/** A 422 body of `POST /connections/{id}/test`: a boolean `verified` and an object `delivery`. */
function isTestResult(body: unknown): body is NotificationConnectionTestResult {
  if (typeof body !== 'object' || body === null) return false;
  const { verified, delivery } = body as { verified?: unknown; delivery?: unknown };
  return typeof verified === 'boolean' && typeof delivery === 'object' && delivery !== null;
}

/**
 * Per-user channel connections: list, get, upsert, test, delete. Secrets are write-only: they come back as
 * `{ set: true, fingerprint }`.
 */
export class NotificationConnectionsResource extends ResourceBase {
  /**
   * The caller's connections (secrets redacted).
   * @throws {ContextError} no namespace (per call or client default); nothing is sent
   */
  async list(options?: CallContext & RequestOptions): Promise<NotificationConnection[]> {
    const { ctx, request } = splitCallOptions(options);
    return await this.transport.request<NotificationConnection[]>(
      'GET',
      '/notifications/{namespace}/connections',
      { params: { namespace: this.ns(ctx) }, ...request }
    );
  }

  /**
   * One connection by id (secrets redacted).
   * @param id the connection's `_id` (24-hex ObjectId)
   * @throws {ValidationError} status 0 when `id` is not an ObjectId; nothing is sent
   * @throws {NotFoundError} unknown id
   */
  async get(id: string, options?: CallContext & RequestOptions): Promise<NotificationConnection> {
    assertObjectId(id, 'id');
    const { ctx, request } = splitCallOptions(options);
    return await this.transport.request<NotificationConnection>(
      'GET',
      '/notifications/{namespace}/connections/{id}',
      { params: { namespace: this.ns(ctx), id }, ...request }
    );
  }

  /**
   * Creates or replaces the caller's connection for `input.channel` (one per channel): the credentials are
   * replaced, `verified` is reset to `false` and `created_at` is reset. An unverified connection is never used by
   * the fan-out: call {@link test} to verify it.
   * @throws {ValidationError} status 400 for an invalid channel, or `apiCode 'ssrf_blocked'` for a rejected
   *   outbound URL
   *
   * @example
   * ```typescript
   * const inapp = await client.notifications.connections.upsert({ channel: 'inapp' });
   * ```
   */
  async upsert(
    input: NotificationConnectionInput,
    options?: CallContext & RequestOptions
  ): Promise<NotificationConnection> {
    const { ctx, request } = splitCallOptions(options);
    return await this.transport.request<NotificationConnection>(
      'POST',
      '/notifications/{namespace}/connections',
      { params: { namespace: this.ns(ctx) }, body: input, ...request }
    );
  }

  /**
   * Sends a test message through a connection. On success (200) the connection becomes verified. A delivery that
   * did not go through (422 `{ verified: false, delivery }`) **resolves** with that result instead of throwing.
   *
   * For every channel except `inapp` this sends a **real external message** when credentials are present.
   * @param id the connection's `_id` (24-hex ObjectId)
   * @throws {ValidationError} status 0 when `id` is not an ObjectId; status 422 when the body is not a test result
   * @throws {NotFoundError} unknown id (nothing is sent)
   *
   * @example
   * ```typescript
   * const { verified, delivery } = await client.notifications.connections.test(connection._id);
   * if (!verified) console.log(delivery.status, delivery.error);
   * ```
   */
  async test(
    id: string,
    options?: CallContext & RequestOptions
  ): Promise<NotificationConnectionTestResult> {
    assertObjectId(id, 'id');
    const { ctx, request } = splitCallOptions(options);
    const namespace = this.ns(ctx);
    try {
      return await this.transport.request<NotificationConnectionTestResult>(
        'POST',
        '/notifications/{namespace}/connections/{id}/test',
        { params: { namespace, id }, ...request }
      );
    } catch (error) {
      if (error instanceof RtlsError && error.status === 422 && isTestResult(error.body)) {
        return error.body;
      }
      throw error;
    }
  }

  /**
   * Deletes a connection (204).
   * @param id the connection's `_id` (24-hex ObjectId)
   * @throws {ValidationError} status 0 when `id` is not an ObjectId; nothing is sent
   * @throws {NotFoundError} unknown id
   */
  async delete(id: string, options?: CallContext & RequestOptions): Promise<void> {
    assertObjectId(id, 'id');
    const { ctx, request } = splitCallOptions(options);
    await this.transport.request<void>('DELETE', '/notifications/{namespace}/connections/{id}', {
      params: { namespace: this.ns(ctx), id },
      ...request,
    });
  }
}
