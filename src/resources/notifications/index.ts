/**
 * The notification center (`client.notifications`): the caller's inbox (flat list, thread roll-ups, facets,
 * export, state changes, bulk with undo), sending, the live stream, and the sub-resources for rules, connections,
 * saved views, the retention policy and the role-gated admin configuration.
 *
 * Every route is scoped to the caller: with an API key, the user who created the key.
 *
 * @module resources/notifications
 */
import type { BaseClient, RequestOptions } from '../../client/base';
import { ResourceBase } from '../../client/resource';
import type { CallContext } from '../../context';
import { ResponseParseError } from '../../errors';
import type {
  NotificationBulkAction,
  NotificationBulkRequest,
  NotificationBulkResult,
  NotificationCleanupPolicy,
  NotificationExportQuery,
  NotificationFacets,
  NotificationFilter,
  NotificationGroup,
  NotificationGroupBy,
  NotificationGroupQuery,
  NotificationItem,
  NotificationListQuery,
  NotificationMissionStatus,
  NotificationSendRequest,
  NotificationStream,
  NotificationStreamOptions,
  NotificationUndoResult,
  NotificationUnreadCount,
} from '../../types/notifications';
import type { OffsetPage } from '../../types';
import { splitCallOptions } from '../../utils/args';
import { paginateOffset, readTotalCount } from '../../utils/pagination';
import { toEpochMs } from '../../utils/time';
import { NotificationsAdminResource } from './admin';
import { NotificationCleanupPolicyResource } from './cleanup-policy';
import { NotificationConnectionsResource } from './connections';
import {
  assertLimit,
  assertNonEmptyString,
  assertObjectId,
  assertSelectiveFilter,
  invalidArgument,
  toWireFilter,
} from './query';
import { NotificationRulesResource } from './rules';
import { NotificationSavedViewsResource } from './saved-views';
import { createNotificationStream } from './stream';

export { NotificationRulesResource } from './rules';
export { NotificationConnectionsResource } from './connections';
export { NotificationSavedViewsResource } from './saved-views';
export { NotificationCleanupPolicyResource } from './cleanup-policy';
export {
  NotificationsAdminResource,
  NotificationTenantConfigResource,
  NotificationRecipientMappingsResource,
} from './admin';

const GROUP_BY: readonly NotificationGroupBy[] = ['thread', 'type', 'zone', 'asset'];
const BULK_ACTIONS: readonly NotificationBulkAction[] = [
  'read',
  'acknowledge',
  'archive',
  'delete',
  'pin',
  'mute',
  'snooze',
];
/** The server answers 413 from 1000 matched items on; the client refuses that many ids up front. */
const MAX_BULK_IDS = 999;
const SEND_KEYS = [
  'kind',
  'severity',
  'title',
  'body',
  'params',
  'channels',
  'conversation_id',
  'mission_id',
  'event_type',
] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Query of one flat page: the wire filter plus `limit`/`offset` when given. */
function pageQuery(query: NotificationListQuery | undefined): Record<string, string> {
  assertLimit(query ?? {});
  const wire = toWireFilter(query);
  if (query?.limit !== undefined) wire.limit = String(query.limit);
  if (query?.offset !== undefined) wire.offset = String(query.offset);
  return wire;
}

/** The wire body of `send()`: only the defined keys of the request; `mission.due` as epoch ms; never `source`. */
function sendBody(
  request: Omit<NotificationSendRequest, 'recipients'>,
  recipients: unknown
): Record<string, unknown> {
  if (!Array.isArray(recipients) || recipients.length === 0) {
    throw invalidArgument('send needs at least one recipient', 'recipients');
  }
  const body: Record<string, unknown> = { recipients };
  for (const key of SEND_KEYS) {
    if (request[key] !== undefined) body[key] = request[key];
  }
  if (request.mission !== undefined) {
    if (!isObject(request.mission)) {
      throw invalidArgument('mission must be an object', 'mission');
    }
    const { assignee, status, due } = request.mission;
    const mission: Record<string, unknown> = {};
    if (assignee !== undefined) mission.assignee = assignee;
    if (status !== undefined) mission.status = status;
    if (due !== undefined) mission.due = toEpochMs(due);
    body.mission = mission;
  }
  return body;
}

/**
 * The wire body of `bulk()`, after every client guard, in this order: exactly one selector (`ids`, `thread_key` or
 * `filter`) and its own checks, then `action`, then `snooze_until` for a snooze.
 */
function bulkBody(request: NotificationBulkRequest): Record<string, unknown> {
  if (!isObject(request)) throw invalidArgument('bulk needs a request object', 'request');
  const { ids, thread_key, filter, action, snooze_until } = request as Record<string, unknown>;
  const selectors = [ids, thread_key, filter].filter((value) => value !== undefined).length;
  if (selectors !== 1) {
    throw invalidArgument('bulk needs exactly one of ids, thread_key or filter', 'selection');
  }
  const body: Record<string, unknown> = {};
  if (ids !== undefined) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw invalidArgument('ids must be a non-empty array of ObjectIds', 'ids');
    }
    for (const id of ids) assertObjectId(id, 'ids');
    if (ids.length > MAX_BULK_IDS) {
      throw invalidArgument(
        `ids must hold fewer than 1000 ids (the server refuses 1000 matches), not ${ids.length}`,
        'ids'
      );
    }
    body.ids = ids;
  } else if (thread_key !== undefined) {
    assertNonEmptyString(thread_key, 'thread_key');
    body.thread_key = thread_key;
  } else {
    const wire = toWireFilter(filter as NotificationFilter);
    assertSelectiveFilter(wire);
    body.filter = wire;
  }
  if (typeof action !== 'string' || !(BULK_ACTIONS as readonly string[]).includes(action)) {
    throw invalidArgument(`action must be one of ${BULK_ACTIONS.join(', ')}`, 'action');
  }
  body.action = action;
  if (action === 'snooze') {
    if (snooze_until === undefined || snooze_until === null) {
      throw invalidArgument('action snooze needs snooze_until', 'snooze_until');
    }
    body.snooze_until = toEpochMs(snooze_until as Date | number | string);
  }
  return body;
}

/**
 * Inbox, send, stream and notification configuration of the caller (`client.notifications`).
 *
 * Every method resolves the namespace from `options.namespace`, else the client default, and throws `ContextError`
 * before any request when neither is set. Argument errors throw `ValidationError` (status 0) before any request.
 */
export class NotificationsResource extends ResourceBase {
  /** Forwarding rules of the caller. */
  readonly rules: NotificationRulesResource;
  /** Channel connections of the caller (one per channel). */
  readonly connections: NotificationConnectionsResource;
  /** Saved inbox views of the caller. */
  readonly savedViews: NotificationSavedViewsResource;
  /** Retention policy of the caller. */
  readonly cleanupPolicy: NotificationCleanupPolicyResource;
  /** Role-gated namespace configuration (`manage_api_keys`). */
  readonly admin: NotificationsAdminResource;

  /** The caller's user id per namespace, read once from `GET /cleanup-policy` by {@link sendToSelf}. */
  private readonly selfIds = new Map<string, string>();

  /**
   * Public, so `new XResource(client)` keeps working; the client creates every resource, so the constructor is not
   * part of the documented surface.
   * @internal
   */
  constructor(client: BaseClient) {
    super(client);
    this.rules = new NotificationRulesResource(client);
    this.connections = new NotificationConnectionsResource(client);
    this.savedViews = new NotificationSavedViewsResource(client);
    this.cleanupPolicy = new NotificationCleanupPolicyResource(client);
    this.admin = new NotificationsAdminResource(client);
  }

  /**
   * One page of the flat inbox, newest first (pinned items first). Always sends `group_by=flat`: the server's
   * default is thread groups (USI-P6-2). Without `state` the list holds the active (not archived) items.
   *
   * @throws {ValidationError} status 0 for a bad filter value or `limit`/`offset` out of bounds; nothing is sent
   * @throws {ContextError} no namespace; nothing is sent
   * @example
   * ```typescript
   * const unread = await client.notifications.list({ state: 'unread', limit: 20 });
   * ```
   */
  async list(
    query?: NotificationListQuery,
    options?: CallContext & RequestOptions
  ): Promise<NotificationItem[]> {
    const { ctx, request } = splitCallOptions(options);
    const namespace = this.ns(ctx);
    const wire = pageQuery(query);
    return await this.transport.request<NotificationItem[]>('GET', '/notifications/{namespace}', {
      params: { namespace },
      query: { group_by: 'flat', ...wire },
      ...request,
    });
  }

  /**
   * One page of the flat inbox with its total: `total` comes from `X-Total-Count` and is omitted when the header
   * is absent or unreadable (cross-origin browsers cannot read it, USI-P6-14).
   *
   * @throws {ValidationError} status 0 for a bad filter value or `limit`/`offset` out of bounds; nothing is sent
   * @throws {ContextError} no namespace; nothing is sent
   */
  async listPage(
    query?: NotificationListQuery,
    options?: CallContext & RequestOptions
  ): Promise<OffsetPage<NotificationItem>> {
    const { ctx, request } = splitCallOptions(options);
    const namespace = this.ns(ctx);
    const wire = pageQuery(query);
    const response = await this.transport.requestWithResponse<NotificationItem[]>(
      'GET',
      '/notifications/{namespace}',
      { params: { namespace }, query: { group_by: 'flat', ...wire }, ...request }
    );
    const page: OffsetPage<NotificationItem> = {
      items: response.data,
      limit: query?.limit ?? 50,
      offset: query?.offset ?? 0,
    };
    const total = readTotalCount(response.headers);
    if (total !== undefined) page.total = total;
    return page;
  }

  /**
   * Every matching item, page by page (page size `limit ?? 200`, from `offset ?? 0`). `to` is pinned to the start
   * time unless given, so items arriving during the iteration are not returned; an id already yielded is skipped.
   * The next page is fetched only when the consumer pulls past the current one. Pin or state changes during the
   * iteration reorder pages, so items can be missed. Bound it with `collectAll(it, { maxItems })`.
   *
   * @throws {ValidationError} status 0, at once, for a bad filter value or `limit`/`offset` out of bounds
   * @throws {ContextError} at once, no namespace
   */
  iterate(
    query?: NotificationListQuery,
    options?: CallContext & RequestOptions
  ): AsyncIterableIterator<NotificationItem> {
    const { ctx, request } = splitCallOptions(options);
    const namespace = this.ns(ctx);
    assertLimit(query ?? {});
    const pinned: NotificationListQuery = { ...query, to: query?.to ?? Date.now() };
    const wire = toWireFilter(pinned);
    const pages = paginateOffset<NotificationItem>(
      async (offset, limit) => {
        const response = await this.transport.requestWithResponse<NotificationItem[]>(
          'GET',
          '/notifications/{namespace}',
          {
            params: { namespace },
            query: { group_by: 'flat', ...wire, limit: String(limit), offset: String(offset) },
            ...request,
          }
        );
        const page: OffsetPage<NotificationItem> = { items: response.data, limit, offset };
        const total = readTotalCount(response.headers);
        if (total !== undefined) page.total = total;
        return page;
      },
      { limit: query?.limit ?? 200, startOffset: query?.offset ?? 0, signal: request.signal }
    );
    return (async function* unique(): AsyncGenerator<NotificationItem, void, undefined> {
      const seen = new Set<string>();
      for await (const item of pages) {
        if (seen.has(item._id)) continue;
        seen.add(item._id);
        yield item;
      }
    })();
  }

  /**
   * Group rows (`group_by` default `'thread'`). The groups cover only the `limit` newest matching items (server
   * default 50), not the whole inbox; `X-Total-Count` counts items, not groups.
   *
   * @throws {ValidationError} status 0 for `group_by` outside `thread|type|zone|asset` (e.g. `'flat'`), a `q` key
   *   (free text would force flat results), a bad filter value or bounds; nothing is sent
   * @throws {ContextError} no namespace; nothing is sent
   */
  async listGroups(
    query?: NotificationGroupQuery,
    options?: CallContext & RequestOptions
  ): Promise<NotificationGroup[]> {
    const { ctx, request } = splitCallOptions(options);
    const namespace = this.ns(ctx);
    const groupBy: unknown = query?.group_by ?? 'thread';
    if (typeof groupBy !== 'string' || !(GROUP_BY as readonly string[]).includes(groupBy)) {
      throw invalidArgument(`group_by must be one of ${GROUP_BY.join(', ')}`, 'group_by');
    }
    if ((query as { q?: unknown } | undefined)?.q !== undefined) {
      throw invalidArgument('listGroups does not take q (free text forces flat results)', 'q');
    }
    const wire = pageQuery(query);
    return await this.transport.request<NotificationGroup[]>('GET', '/notifications/{namespace}', {
      params: { namespace },
      query: { group_by: groupBy, ...wire },
      ...request,
    });
  }

  /**
   * Counts by kind, severity, zone, channel and state of the items matching a filter (every list filter applies).
   *
   * @throws {ValidationError} status 0 for a bad filter value; nothing is sent
   * @throws {ContextError} no namespace; nothing is sent
   */
  async facets(
    filter?: NotificationFilter,
    options?: CallContext & RequestOptions
  ): Promise<NotificationFacets> {
    const { ctx, request } = splitCallOptions(options);
    const namespace = this.ns(ctx);
    const wire = toWireFilter(filter);
    return await this.transport.request<NotificationFacets>(
      'GET',
      '/notifications/{namespace}/facets',
      { params: { namespace }, query: wire, ...request }
    );
  }

  /**
   * Unread and needs-action counts (not archived; muted and snoozed items are counted, USI-P6-5).
   * @throws {ContextError} no namespace; nothing is sent
   */
  async unreadCount(options?: CallContext & RequestOptions): Promise<NotificationUnreadCount> {
    const { ctx, request } = splitCallOptions(options);
    const namespace = this.ns(ctx);
    return await this.transport.request<NotificationUnreadCount>(
      'GET',
      '/notifications/{namespace}/unread_count',
      { params: { namespace }, ...request }
    );
  }

  /**
   * Every matching item as CSV text (header
   * `_id,created_at,kind,severity,title,read,acknowledged,archived,thread_key,zone_name,asset_name`) or as JSON
   * items. The server truncates at 10 000 rows without any signal (USI-P6-12) and ignores paging and grouping.
   *
   * @throws {ValidationError} status 0 for a bad filter value or a `format` other than csv/json; nothing is sent
   * @throws {ContextError} no namespace; nothing is sent
   */
  export(
    query: NotificationFilter & { format: 'csv' },
    options?: CallContext & RequestOptions
  ): Promise<string>;
  export(
    query?: NotificationFilter & { format?: 'json' },
    options?: CallContext & RequestOptions
  ): Promise<NotificationItem[]>;
  export(
    query?: NotificationExportQuery,
    options?: CallContext & RequestOptions
  ): Promise<string | NotificationItem[]>;
  async export(
    query?: NotificationExportQuery,
    options?: CallContext & RequestOptions
  ): Promise<string | NotificationItem[]> {
    const { ctx, request } = splitCallOptions(options);
    const namespace = this.ns(ctx);
    const format: unknown = query?.format ?? 'json';
    if (format !== 'csv' && format !== 'json') {
      throw invalidArgument("format must be 'csv' or 'json'", 'format');
    }
    const wire = toWireFilter(query);
    const transportOptions = {
      params: { namespace },
      query: { format, ...wire },
      ...request,
    };
    if (format === 'csv') {
      return await this.transport.request<string>('GET', '/notifications/{namespace}/export', {
        ...transportOptions,
        parseAs: 'text',
      });
    }
    return await this.transport.request<NotificationItem[]>(
      'GET',
      '/notifications/{namespace}/export',
      { ...transportOptions, parseAs: 'json' }
    );
  }

  /**
   * One item of the caller.
   * @throws {ValidationError} status 0 when `id` is not a 24-hex ObjectId; nothing is sent
   * @throws {NotFoundError} `apiCode 'not_found'` for an unknown id
   */
  async get(id: string, options?: CallContext & RequestOptions): Promise<NotificationItem> {
    return await this.itemRequest('GET', '/notifications/{namespace}/{id}', id, options);
  }

  /**
   * Marks an item read (re-stamps `read_at` on repeat; there is no un-read).
   * @throws {ValidationError} status 0 when `id` is not a 24-hex ObjectId; nothing is sent
   */
  async markRead(id: string, options?: CallContext & RequestOptions): Promise<NotificationItem> {
    return await this.itemRequest('POST', '/notifications/{namespace}/{id}/read', id, options);
  }

  /**
   * Acknowledges an alert or a mission (does not mark it read).
   * @throws {ValidationError} status 0 when `id` is not a 24-hex ObjectId; nothing is sent
   * @throws {ConflictError} `apiCode 'not_actionable'` for a direct message
   */
  async acknowledge(id: string, options?: CallContext & RequestOptions): Promise<NotificationItem> {
    return await this.itemRequest(
      'POST',
      '/notifications/{namespace}/{id}/acknowledge',
      id,
      options
    );
  }

  /**
   * Archives an item. Irreversible: there is no un-archive and no undo token; use
   * `bulk({ ids: [id], action: 'archive' })` for an undoable archive.
   * @throws {ValidationError} status 0 when `id` is not a 24-hex ObjectId; nothing is sent
   */
  async archive(id: string, options?: CallContext & RequestOptions): Promise<NotificationItem> {
    return await this.itemRequest('POST', '/notifications/{namespace}/{id}/archive', id, options);
  }

  /**
   * Pins an item (pinned items sort first). Idempotent.
   * @throws {ValidationError} status 0 when `id` is not a 24-hex ObjectId; nothing is sent
   */
  async pin(id: string, options?: CallContext & RequestOptions): Promise<NotificationItem> {
    return await this.itemRequest('POST', '/notifications/{namespace}/{id}/pin', id, options, {
      pinned: true,
    });
  }

  /**
   * Unpins an item. Idempotent.
   * @throws {ValidationError} status 0 when `id` is not a 24-hex ObjectId; nothing is sent
   */
  async unpin(id: string, options?: CallContext & RequestOptions): Promise<NotificationItem> {
    return await this.itemRequest('POST', '/notifications/{namespace}/{id}/pin', id, options, {
      pinned: false,
    });
  }

  /**
   * Sets `snooze_until`. A marker only: nothing is hidden or resurfaced and the item stays in the list and the
   * counts (USI-P6-5); `0` or a past time clears the snoozed state.
   * @throws {ValidationError} status 0 when `id` is not a 24-hex ObjectId or `until` is not a valid time
   */
  async snooze(
    id: string,
    until: Date | number | string,
    options?: CallContext & RequestOptions
  ): Promise<NotificationItem> {
    assertObjectId(id);
    return await this.itemRequest('POST', '/notifications/{namespace}/{id}/snooze', id, options, {
      until: toEpochMs(until),
    });
  }

  /**
   * Sets the status of a mission (the only writable field).
   * @throws {ValidationError} status 0 when `id` is not a 24-hex ObjectId; status 400 for an invalid status
   * @throws {ConflictError} `apiCode 'not_a_mission'` when the item is not a mission (checked before the status)
   */
  async updateMission(
    id: string,
    status: NotificationMissionStatus,
    options?: CallContext & RequestOptions
  ): Promise<NotificationItem> {
    return await this.itemRequest('PATCH', '/notifications/{namespace}/{id}', id, options, {
      mission: { status },
    });
  }

  /**
   * Applies an action to a selection: `ids` (non-empty, fewer than 1000), a `thread_key`, or a selective `filter`.
   *
   * - `delete` is a hard delete (undo within 300 s with the returned token).
   * - `affected` counts changed documents; `read`, `archive` and `acknowledge` re-stamp timestamps, so items
   *   already in that state are counted again.
   * - `ids` and `thread_key` also match archived items; `filter` does not unless its `state` says so.
   * - `pin` cannot unpin; `mute` and `snooze` are markers only (USI-P6-5).
   * - `acknowledge` with `filter.kind` acknowledges any kind, also direct messages (USI-P6-10).
   * - "Mark all as read": `bulk({ filter: { state: 'unread' }, action: 'read' })`.
   *
   * @throws {ValidationError} status 0 (nothing sent) for a missing or second selector, empty or invalid ids,
   *   1000 ids or more, a blank thread key, a bad or non-selective filter (USI-P6-4), an unknown action, or a
   *   snooze without a valid `snooze_until`
   * @throws {PayloadTooLargeError} `apiCode 'too_many_matched'` when 1000 items or more match (nothing changed)
   */
  async bulk(
    request: NotificationBulkRequest,
    options?: CallContext & RequestOptions
  ): Promise<NotificationBulkResult> {
    const { ctx, request: requestOptions } = splitCallOptions(options);
    const namespace = this.ns(ctx);
    const body = bulkBody(request);
    return await this.transport.request<NotificationBulkResult>(
      'POST',
      '/notifications/{namespace}/bulk',
      { params: { namespace }, body, ...requestOptions }
    );
  }

  /**
   * Reverts a bulk action with its `undo_token` (single use, valid 300 s).
   * @throws {ValidationError} status 0 for an empty token; nothing is sent
   * @throws {NotFoundError} `apiCode 'undo_unavailable'` for an unknown, used or expired token
   */
  async undo(
    undoToken: string,
    options?: CallContext & RequestOptions
  ): Promise<NotificationUndoResult> {
    const { ctx, request } = splitCallOptions(options);
    const namespace = this.ns(ctx);
    assertNonEmptyString(undoToken, 'undoToken');
    return await this.transport.request<NotificationUndoResult>(
      'POST',
      '/notifications/{namespace}/bulk/undo',
      { params: { namespace }, body: { undo_token: undoToken }, ...request }
    );
  }

  /**
   * Sends a notification and returns the created items of all recipients. Never retried (not idempotent). Only
   * `user` recipients are resolved; sending to anyone but exactly yourself, or `severity: 'critical'`, needs the
   * `send_notifications` role. Without `channels` nothing leaves the platform.
   *
   * @throws {ValidationError} status 0 for no recipients or an invalid `mission.due`; nothing is sent
   * @throws {AuthorizationError} `apiCode 'insufficient_role'` without the role
   * @throws {RateLimitError} more than 60 sends per 60 s (`retryAfter` in ms)
   */
  async send(
    request: NotificationSendRequest,
    options?: CallContext & RequestOptions
  ): Promise<NotificationItem[]> {
    const { ctx, request: requestOptions } = splitCallOptions(options);
    const namespace = this.ns(ctx);
    if (!isObject(request)) throw invalidArgument('send needs a request object', 'request');
    const body = sendBody(request, request.recipients);
    return await this.postSend(namespace, body, requestOptions);
  }

  /**
   * Sends a notification to the caller only (no role needed unless `severity: 'critical'`) and returns the created
   * item. The caller's user id is resolved once per namespace and cached (USI-P6-13); a failed lookup is not
   * cached.
   *
   * @throws {ValidationError} status 0 for an invalid `mission.due`; nothing is sent
   * @throws {ResponseParseError} when the server creates no item
   */
  async sendToSelf(
    message: Omit<NotificationSendRequest, 'recipients'>,
    options?: CallContext & RequestOptions
  ): Promise<NotificationItem> {
    const { ctx, request } = splitCallOptions(options);
    const namespace = this.ns(ctx);
    if (!isObject(message)) throw invalidArgument('sendToSelf needs a message object', 'message');
    const placeholder = [{ target_type: 'user', id: '' }];
    sendBody(message, placeholder);
    const userId = await this.selfId(namespace, request);
    const body = sendBody(message, [{ target_type: 'user', id: userId }]);
    const items = await this.postSend(namespace, body, request);
    const [item] = Array.isArray(items) ? items : [];
    if (item === undefined) {
      throw new ResponseParseError('POST /send created no item for the caller', { status: 201 });
    }
    return item;
  }

  /**
   * The live stream of the caller's inbox (async iterator and emitter). `signal` is required; the stream
   * reconnects by default and has no total timeout. After a `reconnected` event, re-fetch `unreadCount()` and the
   * list (the server does not replay missed events).
   *
   * @throws {ContextError} no namespace; nothing is sent
   * @throws {ValidationError} status 0 for a missing signal or invalid options; nothing is sent
   */
  stream(options: NotificationStreamOptions): NotificationStream {
    const namespace = this.ns(options);
    return createNotificationStream(this.transport, namespace, options);
  }

  private async postSend(
    namespace: string,
    body: Record<string, unknown>,
    request: RequestOptions
  ): Promise<NotificationItem[]> {
    return await this.transport.request<NotificationItem[]>(
      'POST',
      '/notifications/{namespace}/send',
      { params: { namespace }, body, ...request, retry: false }
    );
  }

  private async selfId(namespace: string, request: RequestOptions): Promise<string> {
    const cached = this.selfIds.get(namespace);
    if (cached !== undefined) return cached;
    const policy = await this.transport.request<NotificationCleanupPolicy>(
      'GET',
      '/notifications/{namespace}/cleanup-policy',
      { params: { namespace }, ...request }
    );
    const userId: unknown = isObject(policy) ? policy.user_id : undefined;
    if (typeof userId !== 'string' || userId === '') {
      throw new ResponseParseError('GET /cleanup-policy did not return the caller user_id', {
        status: 200,
      });
    }
    this.selfIds.set(namespace, userId);
    return userId;
  }

  private async itemRequest(
    method: 'GET' | 'POST' | 'PATCH',
    path:
      | '/notifications/{namespace}/{id}'
      | '/notifications/{namespace}/{id}/read'
      | '/notifications/{namespace}/{id}/acknowledge'
      | '/notifications/{namespace}/{id}/archive'
      | '/notifications/{namespace}/{id}/pin'
      | '/notifications/{namespace}/{id}/snooze',
    id: string,
    options: (CallContext & RequestOptions) | undefined,
    body?: Record<string, unknown>
  ): Promise<NotificationItem> {
    const { ctx, request } = splitCallOptions(options);
    const namespace = this.ns(ctx);
    assertObjectId(id);
    return await this.transport.request<NotificationItem>(method, path, {
      params: { namespace, id },
      ...(body === undefined ? {} : { body }),
      ...request,
    });
  }
}
