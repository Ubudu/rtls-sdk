[**ubudu-rtls-sdk**](../README.md)

***

[ubudu-rtls-sdk](../README.md) / NotificationsResource

# Class: NotificationsResource

Inbox, send, stream and notification configuration of the caller (`client.notifications`).

Every method resolves the namespace from `options.namespace`, else the client default, and throws `ContextError`
before any request when neither is set. Argument errors throw `ValidationError` (status 0) before any request.

## Extends

- `ResourceBase`

## Properties

### rules

> `readonly` **rules**: [`NotificationRulesResource`](NotificationRulesResource.md)

Forwarding rules of the caller.

***

### connections

> `readonly` **connections**: [`NotificationConnectionsResource`](NotificationConnectionsResource.md)

Channel connections of the caller (one per channel).

***

### savedViews

> `readonly` **savedViews**: [`NotificationSavedViewsResource`](NotificationSavedViewsResource.md)

Saved inbox views of the caller.

***

### cleanupPolicy

> `readonly` **cleanupPolicy**: [`NotificationCleanupPolicyResource`](NotificationCleanupPolicyResource.md)

Retention policy of the caller.

***

### admin

> `readonly` **admin**: [`NotificationsAdminResource`](NotificationsAdminResource.md)

Role-gated namespace configuration (`manage_api_keys`).

## Methods

### list()

> **list**(`query?`, `options?`): `Promise`\<[`NotificationItem`](../interfaces/NotificationItem.md)[]\>

One page of the flat inbox, newest first (pinned items first). Always sends `group_by=flat`: the server's
default is thread groups (USI-P6-2). Without `state` the list holds the active (not archived) items.

#### Parameters

##### query?

[`NotificationListQuery`](../interfaces/NotificationListQuery.md)

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`NotificationItem`](../interfaces/NotificationItem.md)[]\>

#### Throws

status 0 for a bad filter value or `limit`/`offset` out of bounds; nothing is sent

#### Throws

no namespace; nothing is sent

#### Example

```typescript
const unread = await client.notifications.list({ state: 'unread', limit: 20 });
```

***

### listPage()

> **listPage**(`query?`, `options?`): `Promise`\<[`OffsetPage`](../interfaces/OffsetPage.md)\<[`NotificationItem`](../interfaces/NotificationItem.md)\>\>

One page of the flat inbox with its total: `total` comes from `X-Total-Count` and is omitted when the header
is absent or unreadable (cross-origin browsers cannot read it, USI-P6-14).

#### Parameters

##### query?

[`NotificationListQuery`](../interfaces/NotificationListQuery.md)

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`OffsetPage`](../interfaces/OffsetPage.md)\<[`NotificationItem`](../interfaces/NotificationItem.md)\>\>

#### Throws

status 0 for a bad filter value or `limit`/`offset` out of bounds; nothing is sent

#### Throws

no namespace; nothing is sent

***

### iterate()

> **iterate**(`query?`, `options?`): `AsyncIterableIterator`\<[`NotificationItem`](../interfaces/NotificationItem.md)\>

Every matching item, page by page (page size `limit ?? 200`, from `offset ?? 0`). `to` is pinned to the start
time unless given, so items arriving during the iteration are not returned; an id already yielded is skipped.
The next page is fetched only when the consumer pulls past the current one. Pin or state changes during the
iteration reorder pages, so items can be missed. Bound it with `collectAll(it, { maxItems })`.

#### Parameters

##### query?

[`NotificationListQuery`](../interfaces/NotificationListQuery.md)

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`AsyncIterableIterator`\<[`NotificationItem`](../interfaces/NotificationItem.md)\>

#### Throws

status 0, at once, for a bad filter value or `limit`/`offset` out of bounds

#### Throws

at once, no namespace

***

### listGroups()

> **listGroups**(`query?`, `options?`): `Promise`\<[`NotificationGroup`](../interfaces/NotificationGroup.md)[]\>

Group rows (`group_by` default `'thread'`). The groups cover only the `limit` newest matching items (server
default 50), not the whole inbox; `X-Total-Count` counts items, not groups.

#### Parameters

##### query?

[`NotificationGroupQuery`](../interfaces/NotificationGroupQuery.md)

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`NotificationGroup`](../interfaces/NotificationGroup.md)[]\>

#### Throws

status 0 for `group_by` outside `thread|type|zone|asset` (e.g. `'flat'`), a `q` key
  (free text would force flat results), a bad filter value or bounds; nothing is sent

#### Throws

no namespace; nothing is sent

***

### facets()

> **facets**(`filter?`, `options?`): `Promise`\<[`NotificationFacets`](../interfaces/NotificationFacets.md)\>

Counts by kind, severity, zone, channel and state of the items matching a filter (every list filter applies).

#### Parameters

##### filter?

[`NotificationFilter`](../interfaces/NotificationFilter.md)

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`NotificationFacets`](../interfaces/NotificationFacets.md)\>

#### Throws

status 0 for a bad filter value; nothing is sent

#### Throws

no namespace; nothing is sent

***

### unreadCount()

> **unreadCount**(`options?`): `Promise`\<[`NotificationUnreadCount`](../interfaces/NotificationUnreadCount.md)\>

Unread and needs-action counts (not archived; muted and snoozed items are counted, USI-P6-5).

#### Parameters

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`NotificationUnreadCount`](../interfaces/NotificationUnreadCount.md)\>

#### Throws

no namespace; nothing is sent

***

### export()

#### Call Signature

> **export**(`query`, `options?`): `Promise`\<`string`\>

Every matching item as CSV text (header
`_id,created_at,kind,severity,title,read,acknowledged,archived,thread_key,zone_name,asset_name`) or as JSON
items. The server truncates at 10 000 rows without any signal (USI-P6-12) and ignores paging and grouping.

##### Parameters

###### query

[`NotificationFilter`](../interfaces/NotificationFilter.md) & `object`

###### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<`string`\>

##### Throws

status 0 for a bad filter value or a `format` other than csv/json; nothing is sent

##### Throws

no namespace; nothing is sent

#### Call Signature

> **export**(`query?`, `options?`): `Promise`\<[`NotificationItem`](../interfaces/NotificationItem.md)[]\>

Every matching item as CSV text (header
`_id,created_at,kind,severity,title,read,acknowledged,archived,thread_key,zone_name,asset_name`) or as JSON
items. The server truncates at 10 000 rows without any signal (USI-P6-12) and ignores paging and grouping.

##### Parameters

###### query?

[`NotificationFilter`](../interfaces/NotificationFilter.md) & `object`

###### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<[`NotificationItem`](../interfaces/NotificationItem.md)[]\>

##### Throws

status 0 for a bad filter value or a `format` other than csv/json; nothing is sent

##### Throws

no namespace; nothing is sent

#### Call Signature

> **export**(`query?`, `options?`): `Promise`\<`string` \| [`NotificationItem`](../interfaces/NotificationItem.md)[]\>

Every matching item as CSV text (header
`_id,created_at,kind,severity,title,read,acknowledged,archived,thread_key,zone_name,asset_name`) or as JSON
items. The server truncates at 10 000 rows without any signal (USI-P6-12) and ignores paging and grouping.

##### Parameters

###### query?

[`NotificationExportQuery`](../type-aliases/NotificationExportQuery.md)

###### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

##### Returns

`Promise`\<`string` \| [`NotificationItem`](../interfaces/NotificationItem.md)[]\>

##### Throws

status 0 for a bad filter value or a `format` other than csv/json; nothing is sent

##### Throws

no namespace; nothing is sent

***

### get()

> **get**(`id`, `options?`): `Promise`\<[`NotificationItem`](../interfaces/NotificationItem.md)\>

One item of the caller.

#### Parameters

##### id

`string`

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`NotificationItem`](../interfaces/NotificationItem.md)\>

#### Throws

status 0 when `id` is not a 24-hex ObjectId; nothing is sent

#### Throws

`apiCode 'not_found'` for an unknown id

***

### markRead()

> **markRead**(`id`, `options?`): `Promise`\<[`NotificationItem`](../interfaces/NotificationItem.md)\>

Marks an item read (re-stamps `read_at` on repeat; there is no un-read).

#### Parameters

##### id

`string`

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`NotificationItem`](../interfaces/NotificationItem.md)\>

#### Throws

status 0 when `id` is not a 24-hex ObjectId; nothing is sent

***

### acknowledge()

> **acknowledge**(`id`, `options?`): `Promise`\<[`NotificationItem`](../interfaces/NotificationItem.md)\>

Acknowledges an alert or a mission (does not mark it read).

#### Parameters

##### id

`string`

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`NotificationItem`](../interfaces/NotificationItem.md)\>

#### Throws

status 0 when `id` is not a 24-hex ObjectId; nothing is sent

#### Throws

`apiCode 'not_actionable'` for a direct message

***

### archive()

> **archive**(`id`, `options?`): `Promise`\<[`NotificationItem`](../interfaces/NotificationItem.md)\>

Archives an item. Irreversible: there is no un-archive and no undo token; use
`bulk({ ids: [id], action: 'archive' })` for an undoable archive.

#### Parameters

##### id

`string`

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`NotificationItem`](../interfaces/NotificationItem.md)\>

#### Throws

status 0 when `id` is not a 24-hex ObjectId; nothing is sent

***

### pin()

> **pin**(`id`, `options?`): `Promise`\<[`NotificationItem`](../interfaces/NotificationItem.md)\>

Pins an item (pinned items sort first). Idempotent.

#### Parameters

##### id

`string`

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`NotificationItem`](../interfaces/NotificationItem.md)\>

#### Throws

status 0 when `id` is not a 24-hex ObjectId; nothing is sent

***

### unpin()

> **unpin**(`id`, `options?`): `Promise`\<[`NotificationItem`](../interfaces/NotificationItem.md)\>

Unpins an item. Idempotent.

#### Parameters

##### id

`string`

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`NotificationItem`](../interfaces/NotificationItem.md)\>

#### Throws

status 0 when `id` is not a 24-hex ObjectId; nothing is sent

***

### snooze()

> **snooze**(`id`, `until`, `options?`): `Promise`\<[`NotificationItem`](../interfaces/NotificationItem.md)\>

Sets `snooze_until`. A marker only: nothing is hidden or resurfaced and the item stays in the list and the
counts (USI-P6-5); `0` or a past time clears the snoozed state.

#### Parameters

##### id

`string`

##### until

`string` \| `number` \| `Date`

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`NotificationItem`](../interfaces/NotificationItem.md)\>

#### Throws

status 0 when `id` is not a 24-hex ObjectId or `until` is not a valid time

***

### updateMission()

> **updateMission**(`id`, `status`, `options?`): `Promise`\<[`NotificationItem`](../interfaces/NotificationItem.md)\>

Sets the status of a mission (the only writable field).

#### Parameters

##### id

`string`

##### status

[`NotificationMissionStatus`](../type-aliases/NotificationMissionStatus.md)

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`NotificationItem`](../interfaces/NotificationItem.md)\>

#### Throws

status 0 when `id` is not a 24-hex ObjectId; status 400 for an invalid status

#### Throws

`apiCode 'not_a_mission'` when the item is not a mission (checked before the status)

***

### bulk()

> **bulk**(`request`, `options?`): `Promise`\<[`NotificationBulkResult`](../interfaces/NotificationBulkResult.md)\>

Applies an action to a selection: `ids` (non-empty, fewer than 1000), a `thread_key`, or a selective `filter`.

- `delete` is a hard delete (undo within 300 s with the returned token).
- `affected` counts changed documents; `read`, `archive` and `acknowledge` re-stamp timestamps, so items
  already in that state are counted again.
- `ids` and `thread_key` also match archived items; `filter` does not unless its `state` says so.
- `pin` cannot unpin; `mute` and `snooze` are markers only (USI-P6-5).
- `acknowledge` with `filter.kind` acknowledges any kind, also direct messages (USI-P6-10).
- "Mark all as read": `bulk({ filter: { state: 'unread' }, action: 'read' })`.

#### Parameters

##### request

[`NotificationBulkRequest`](../type-aliases/NotificationBulkRequest.md)

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`NotificationBulkResult`](../interfaces/NotificationBulkResult.md)\>

#### Throws

status 0 (nothing sent) for a missing or second selector, empty or invalid ids,
  1000 ids or more, a blank thread key, a bad or non-selective filter (USI-P6-4), an unknown action, or a
  snooze without a valid `snooze_until`

#### Throws

`apiCode 'too_many_matched'` when 1000 items or more match (nothing changed)

***

### undo()

> **undo**(`undoToken`, `options?`): `Promise`\<[`NotificationUndoResult`](../interfaces/NotificationUndoResult.md)\>

Reverts a bulk action with its `undo_token` (single use, valid 300 s).

#### Parameters

##### undoToken

`string`

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`NotificationUndoResult`](../interfaces/NotificationUndoResult.md)\>

#### Throws

status 0 for an empty token; nothing is sent

#### Throws

`apiCode 'undo_unavailable'` for an unknown, used or expired token

***

### send()

> **send**(`request`, `options?`): `Promise`\<[`NotificationItem`](../interfaces/NotificationItem.md)[]\>

Sends a notification and returns the created items of all recipients. Never retried (not idempotent). Only
`user` recipients are resolved; sending to anyone but exactly yourself, or `severity: 'critical'`, needs the
`send_notifications` role. Without `channels` nothing leaves the platform.

#### Parameters

##### request

[`NotificationSendRequest`](../interfaces/NotificationSendRequest.md)

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`NotificationItem`](../interfaces/NotificationItem.md)[]\>

#### Throws

status 0 for no recipients or an invalid `mission.due`; nothing is sent

#### Throws

`apiCode 'insufficient_role'` without the role

#### Throws

more than 60 sends per 60 s (`retryAfter` in ms)

***

### sendToSelf()

> **sendToSelf**(`message`, `options?`): `Promise`\<[`NotificationItem`](../interfaces/NotificationItem.md)\>

Sends a notification to the caller only (no role needed unless `severity: 'critical'`) and returns the created
item. The caller's user id is resolved once per namespace and cached (USI-P6-13); a failed lookup is not
cached.

#### Parameters

##### message

`Omit`\<[`NotificationSendRequest`](../interfaces/NotificationSendRequest.md), `"recipients"`\>

##### options?

[`RtlsContext`](../interfaces/RtlsContext.md) & [`RequestOptions`](../interfaces/RequestOptions.md)

#### Returns

`Promise`\<[`NotificationItem`](../interfaces/NotificationItem.md)\>

#### Throws

status 0 for an invalid `mission.due`; nothing is sent

#### Throws

when the server creates no item

***

### stream()

> **stream**(`options`): [`NotificationStream`](../interfaces/NotificationStream.md)

The live stream of the caller's inbox (async iterator and emitter). `signal` is required; the stream
reconnects by default and has no total timeout. After a `reconnected` event, re-fetch `unreadCount()` and the
list (the server does not replay missed events).

#### Parameters

##### options

[`NotificationStreamOptions`](../interfaces/NotificationStreamOptions.md)

#### Returns

[`NotificationStream`](../interfaces/NotificationStream.md)

#### Throws

no namespace; nothing is sent

#### Throws

status 0 for a missing signal or invalid options; nothing is sent
