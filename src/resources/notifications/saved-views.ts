/**
 * Saved inbox views (`client.notifications.savedViews`): the caller's named searches.
 *
 * @module resources/notifications/saved-views
 */
import type { RequestOptions } from '../../client/base';
import { ResourceBase } from '../../client/resource';
import type { CallContext } from '../../context';
import type {
  NotificationSavedView,
  NotificationSavedViewInput,
  NotificationSavedViewQuery,
} from '../../types/notifications';
import { splitCallOptions } from '../../utils/args';
import { toEpochMs, type TimeInput } from '../../utils/time';
import { assertObjectId, invalidArgument } from './query';

/** The stored query: `from` / `to` as epoch ms, every other key as given. */
function wireQuery(query: NotificationSavedViewQuery | undefined): Record<string, unknown> {
  if (query === undefined) return {};
  if (typeof query !== 'object' || query === null || Array.isArray(query)) {
    throw invalidArgument('savedViews.create: query must be an object', 'query');
  }
  const out: Record<string, unknown> = { ...query };
  for (const key of ['from', 'to'] as const) {
    const value = query[key] as TimeInput | undefined;
    if (value !== undefined) out[key] = toEpochMs(value);
  }
  return out;
}

/**
 * Per-user saved inbox views: list, get, create, delete (the server has no update route).
 */
export class NotificationSavedViewsResource extends ResourceBase {
  /**
   * The caller's saved views.
   * @throws {ContextError} no namespace (per call or client default); nothing is sent
   */
  async list(options?: CallContext & RequestOptions): Promise<NotificationSavedView[]> {
    const { ctx, request } = splitCallOptions(options);
    return await this.transport.request<NotificationSavedView[]>(
      'GET',
      '/notifications/{namespace}/saved-views',
      { params: { namespace: this.ns(ctx) }, ...request }
    );
  }

  /**
   * One saved view by id.
   * @param id the view's `_id` (24-hex ObjectId)
   * @throws {ValidationError} status 0 when `id` is not an ObjectId; nothing is sent
   * @throws {NotFoundError} unknown id
   */
  async get(id: string, options?: CallContext & RequestOptions): Promise<NotificationSavedView> {
    assertObjectId(id, 'id');
    const { ctx, request } = splitCallOptions(options);
    return await this.transport.request<NotificationSavedView>(
      'GET',
      '/notifications/{namespace}/saved-views/{id}',
      { params: { namespace: this.ns(ctx), id }, ...request }
    );
  }

  /**
   * Saves a named view. `query` takes the list filters and defaults to `{}`; its `from` / `to` are sent as epoch ms
   * and every other key as given (USI-P6-11).
   * @throws {ValidationError} status 0 when `name` is not a string with a non-blank value, or for an invalid
   *   `from` / `to` (nothing is sent)
   *
   * @example
   * ```typescript
   * const view = await client.notifications.savedViews.create({
   *   name: 'Unread critical',
   *   query: { state: 'unread', severity: 'critical' },
   * });
   * ```
   */
  async create(
    input: NotificationSavedViewInput,
    options?: CallContext & RequestOptions
  ): Promise<NotificationSavedView> {
    const name = (input as { name?: unknown } | null | undefined)?.name;
    if (typeof name !== 'string' || name.trim() === '') {
      throw invalidArgument('savedViews.create: name must be a non-empty string', 'name');
    }
    const query = wireQuery(input.query);
    const { ctx, request } = splitCallOptions(options);
    return await this.transport.request<NotificationSavedView>(
      'POST',
      '/notifications/{namespace}/saved-views',
      { params: { namespace: this.ns(ctx) }, body: { name, query }, ...request }
    );
  }

  /**
   * Deletes a saved view (204).
   * @param id the view's `_id` (24-hex ObjectId)
   * @throws {ValidationError} status 0 when `id` is not an ObjectId; nothing is sent
   * @throws {NotFoundError} unknown id
   */
  async delete(id: string, options?: CallContext & RequestOptions): Promise<void> {
    assertObjectId(id, 'id');
    const { ctx, request } = splitCallOptions(options);
    await this.transport.request<void>('DELETE', '/notifications/{namespace}/saved-views/{id}', {
      params: { namespace: this.ns(ctx), id },
      ...request,
    });
  }
}
