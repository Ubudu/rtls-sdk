/**
 * Notification rules (`client.notifications.rules`): the caller's own forwarding rules.
 *
 * @module resources/notifications/rules
 */
import type { RequestOptions } from '../../client/base';
import { ResourceBase } from '../../client/resource';
import type { CallContext } from '../../context';
import type {
  NotificationRule,
  NotificationRuleInput,
  NotificationRulePatch,
} from '../../types/notifications';
import { splitCallOptions } from '../../utils/args';
import { assertObjectId, invalidArgument } from './query';

/**
 * Per-user notification rules: list, get, create, update, delete. Every rule belongs to the caller (the user who
 * created the API key).
 *
 * An **enabled** rule subscribes its owner to every matching engine event, and an absent or empty `match` matches
 * every event.
 */
export class NotificationRulesResource extends ResourceBase {
  /**
   * The caller's rules.
   * @throws {ContextError} no namespace (per call or client default); nothing is sent
   */
  async list(options?: CallContext & RequestOptions): Promise<NotificationRule[]> {
    const { ctx, request } = splitCallOptions(options);
    return await this.transport.request<NotificationRule[]>(
      'GET',
      '/notifications/{namespace}/rules',
      { params: { namespace: this.ns(ctx) }, ...request }
    );
  }

  /**
   * One rule by id.
   * @param id the rule's `_id` (24-hex ObjectId)
   * @throws {ValidationError} status 0 when `id` is not an ObjectId; nothing is sent
   * @throws {NotFoundError} unknown id
   */
  async get(id: string, options?: CallContext & RequestOptions): Promise<NotificationRule> {
    assertObjectId(id, 'id');
    const { ctx, request } = splitCallOptions(options);
    return await this.transport.request<NotificationRule>(
      'GET',
      '/notifications/{namespace}/rules/{id}',
      { params: { namespace: this.ns(ctx), id }, ...request }
    );
  }

  /**
   * Creates a rule. `enabled` is required: the server would default it to `true` and subscribe the caller to every
   * matching event at once.
   * @throws {ValidationError} status 0 when `input.enabled` is not a boolean (nothing is sent); status 400 for an
   *   invalid value (first problem in `message`)
   *
   * @example
   * ```typescript
   * const rule = await client.notifications.rules.create({
   *   enabled: false,
   *   name: 'Critical alerts to Slack',
   *   match: { kinds: ['alert'], min_severity: 'critical' },
   *   channels: ['slack'],
   * });
   * ```
   */
  async create(
    input: NotificationRuleInput,
    options?: CallContext & RequestOptions
  ): Promise<NotificationRule> {
    if (
      typeof input !== 'object' ||
      input === null ||
      typeof (input as { enabled?: unknown }).enabled !== 'boolean'
    ) {
      throw invalidArgument(
        'rules.create: input.enabled must be a boolean (the server would default it to true)',
        'enabled'
      );
    }
    const { ctx, request } = splitCallOptions(options);
    return await this.transport.request<NotificationRule>(
      'POST',
      '/notifications/{namespace}/rules',
      { params: { namespace: this.ns(ctx) }, body: input, ...request }
    );
  }

  /**
   * Updates the given keys of a rule (`{}` leaves it unchanged).
   *
   * `match` is replaced wholesale, not merged; `channels: []` is ignored by the server, so channels cannot be
   * cleared (USI-P6-9). Enabling a broad rule subscribes the caller to every matching event.
   * @param id the rule's `_id` (24-hex ObjectId)
   * @throws {ValidationError} status 0 when `id` is not an ObjectId; status 400 for an invalid value
   * @throws {NotFoundError} unknown id
   */
  async update(
    id: string,
    patch: NotificationRulePatch,
    options?: CallContext & RequestOptions
  ): Promise<NotificationRule> {
    assertObjectId(id, 'id');
    const { ctx, request } = splitCallOptions(options);
    return await this.transport.request<NotificationRule>(
      'PATCH',
      '/notifications/{namespace}/rules/{id}',
      { params: { namespace: this.ns(ctx), id }, body: patch, ...request }
    );
  }

  /**
   * Deletes a rule (204).
   * @param id the rule's `_id` (24-hex ObjectId)
   * @throws {ValidationError} status 0 when `id` is not an ObjectId; nothing is sent
   * @throws {NotFoundError} unknown id
   */
  async delete(id: string, options?: CallContext & RequestOptions): Promise<void> {
    assertObjectId(id, 'id');
    const { ctx, request } = splitCallOptions(options);
    await this.transport.request<void>('DELETE', '/notifications/{namespace}/rules/{id}', {
      params: { namespace: this.ns(ctx), id },
      ...request,
    });
  }
}
