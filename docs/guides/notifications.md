# Notifications Guide

The notification center is a per-user inbox of alerts, direct messages and missions, with a live stream,
forwarding rules, channel connections, saved views and a retention policy. `client.notifications` wraps all of
it (rtls-api 3.4.0).

## Quick Reference

| Operation | Method | Returns |
|-----------|--------|---------|
| Unread badge | `client.notifications.unreadCount()` | `NotificationUnreadCount` |
| One flat page | `client.notifications.list(query?)` | `NotificationItem[]` |
| Page with total | `client.notifications.listPage(query?)` | `OffsetPage<NotificationItem>` |
| Every page | `client.notifications.iterate(query?)` | `AsyncIterableIterator<NotificationItem>` |
| Roll-ups | `client.notifications.listGroups(query?)` | `NotificationGroup[]` |
| Counts per kind/state | `client.notifications.facets(filter?)` | `NotificationFacets` |
| Export | `client.notifications.export(query?)` | `string` (CSV) or `NotificationItem[]` |
| One item | `client.notifications.get(id)` | `NotificationItem` |
| Triage one item | `markRead`, `acknowledge`, `archive`, `pin`, `unpin`, `snooze`, `updateMission` | `NotificationItem` |
| Bulk change | `client.notifications.bulk(request)` / `undo(token)` | `NotificationBulkResult` / `NotificationUndoResult` |
| Send | `client.notifications.send(request)` / `sendToSelf(message)` | `NotificationItem[]` / `NotificationItem` |
| Live updates | `client.notifications.stream({ signal })` | `NotificationStream` |
| Forwarding rules | `client.notifications.rules.*` | `NotificationRule` |
| Channel connections | `client.notifications.connections.*` | `NotificationConnection` |
| Saved views | `client.notifications.savedViews.*` | `NotificationSavedView` |
| Retention | `client.notifications.cleanupPolicy.get()` / `replace()` | `NotificationCleanupPolicy` |
| Administration | `client.notifications.admin.tenantConfig.*`, `.recipientMappings.*` (`list`, `get`, `create`, `update`, `delete`) | role-gated |

> **Note:** Every method takes an optional last `options` argument (`{ namespace, signal, timeoutMs, headers }`)
> and uses the client's default namespace otherwise. Without either, it throws `ContextError` before any request.

## 1. Concepts

**Whose inbox.** Every route works on the caller's own inbox: items, rules, connections, saved views and the
retention policy all belong to the caller, and anything sent to the caller appears in the caller's notification
bell in the web UI.

**Kinds and severities.** An item is an `alert` (produced by alert rules), a `direct_message` or a `mission` (a
task with a status `open` → `in_progress` → `done`). Alerts and missions are *actionable*: they can be
acknowledged. Severities are `info`, `warning` and `critical`.

**State.** An item is `read` or unread, `acknowledged` or not (actionable kinds only), and `archived` or active.
It can also be `pinned` (sorted first), `snoozed` (`snooze_until` set) and `muted`. Snoozed and muted are markers
only: the server stores them but does not hide or resurface anything.

**Threads.** Every item has a `thread_key`, computed when it is written: `dm:<conversation_id>` for direct
messages, `mission:<mission_id>` for missions, `alert:zone:<zone>:rule:<rule>` or `alert:asset:<udid>:rule:<rule>`
for alerts. A send without `conversation_id` / `mission_id` starts its own thread. Bulk actions and filters can
select a whole thread by its key.

**Not the WebSocket alerts.** WebSocket frames with `event_type: 'NOTIFICATION'` (see the
[WebSocket guide](websocket.md)) are a live broadcast of alert-rule messages to every subscriber of a namespace.
The notification center is a stored, per-user inbox with its own [stream](#6-live-stream).

## 2. Reading the inbox

<!-- snippet: prelude=client -->
```ts
const { unread, needs_action } = await client.notifications.unreadCount();
console.log(`${unread} unread, ${needs_action} to acknowledge`);

// One page of flat items, newest first (pinned items first).
const items = await client.notifications.list({ state: 'unread', limit: 20 });
for (const item of items) console.log(item.kind, item.severity, item.title);

// Roll-ups of the newest page: one row per thread (default), kind, zone or asset.
const groups = await client.notifications.listGroups({ group_by: 'type', limit: 100 });
for (const g of groups) console.log(g.group_key, g.count, g.unread_count, g.max_severity);
```

`list()` always asks for flat items. `listGroups()` returns group rows built from the `limit` newest matching
items only: a group's `count` is not a total.

### Filters

Every read (`list`, `listPage`, `iterate`, `listGroups`, `facets`, `export`) and the bulk `filter` accept:

| Key | Meaning |
|---|---|
| `state` | `unread`, `read`, `needs_action` (actionable and not acknowledged; overrides `kind`), `archived`, `pinned`, `muted`, `snoozed`, `all`. Absent: the active inbox (not archived) |
| `kind` | `alert`, `direct_message`, `mission` |
| `severity` | `info`, `warning`, `critical` |
| `zone` | integer zone id |
| `asset` | asset udid |
| `thread_key` | exact thread key |
| `pinned` | `true` only (there is no "not pinned" filter) |
| `from`, `to` | creation time range, inclusive (`Date`, epoch milliseconds or ISO string) |
| `q` | search, see below |

The SDK checks enums and types before sending and refuses an invalid value with `ValidationError` (status 0).

### Search grammar

`q` combines scoped terms with free text:

- `zone:<id>`, `tag:<asset tag>`, `severity:<level>` and `from:<source>`, where the source is `rule_engine`,
  `agent`, `operator` or `system` (`from:` in `q` is the sender; the `from` key above is a time);
- everything else is a full-text search over the title, the body, and zone and asset names and tags;
  `"quoted phrases"` are kept together.

At most 8 scoped terms, 256 characters. A scoped term with an unknown value is dropped silently. Free text
always returns flat items, so `listGroups()` refuses `q`.

<!-- snippet: prelude=client -->
```ts
const hits = await client.notifications.list({ q: 'severity:critical "cold room"', state: 'all' });
console.log(hits.length);
```

### Pagination

`listPage()` returns `{ items, total, limit, offset }`; `total` comes from the `X-Total-Count` header and counts
items, not groups. A browser on another origin cannot read that header, so `total` is optional.

`iterate()` pages lazily (200 items per page by default), fixes `to` to the start time so new items do not shift
the pages, and skips an id it has already yielded. Pinning or changing items while iterating still reorders the
pages, so an item can be missed. Bound a full read with `collectAll`:

<!-- snippet: prelude=client -->
```ts
import { collectAll } from 'ubudu-rtls-sdk';

const page = await client.notifications.listPage({ state: 'all', limit: 50 });
console.log(`${page.items.length} of ${page.total ?? '?'}`);

const all = await collectAll(client.notifications.iterate({ kind: 'mission', state: 'all' }), {
  maxItems: 1000,
});
console.log(all.length);
```

### Facets and export

<!-- snippet: prelude=client -->
```ts
const facets = await client.notifications.facets({ state: 'all' });
console.log(facets.kind.alert ?? 0, facets.state.unread, facets.state.needs_action);

// CSV text (header: _id,created_at,kind,severity,title,read,acknowledged,archived,thread_key,zone_name,asset_name)
const csv = await client.notifications.export({ format: 'csv', from: Date.now() - 86_400_000 });
console.log(csv.split('\n')[0]);

// JSON items
const rows = await client.notifications.export({ state: 'archived' });
console.log(rows.length);
```

An export stops at 10 000 rows without any signal; use `iterate()` when you need every item.

## 3. Triage

<!-- snippet: prelude=client -->
```ts
import { ConflictError } from 'ubudu-rtls-sdk';

declare const id: string; // a 24-hex item id

const item = await client.notifications.get(id);
console.log(item.kind, item.read, item.acknowledged);

await client.notifications.markRead(id); // there is no "mark unread"
await client.notifications.pin(id);
await client.notifications.unpin(id);
await client.notifications.snooze(id, new Date(Date.now() + 3_600_000)); // marker only; 0 clears it

try {
  await client.notifications.acknowledge(id); // alerts and missions only; does not mark read
} catch (error) {
  if (error instanceof ConflictError) console.log('direct messages cannot be acknowledged');
  else throw error;
}

await client.notifications.updateMission(id, 'in_progress'); // ConflictError if the item is not a mission
await client.notifications.archive(id); // irreversible
```

`archive(id)` cannot be undone. For an undoable archive use `bulk({ ids: [id], action: 'archive' })` and keep the
undo token. `get(id)` reads one item (`NotFoundError` for an unknown id). Every item method checks the id locally
(24 hex characters) before any request.

## 4. Bulk and undo

Select items in exactly one way: `ids` (fewer than 1000), a `thread_key`, or a `filter`. Actions: `read`,
`acknowledge`, `archive`, `delete`, `pin`, `mute`, `snooze` (with `snooze_until`).

<!-- snippet: prelude=client -->
```ts
// Mark all as read
await client.notifications.bulk({ filter: { state: 'unread' }, action: 'read' });

// Mute a thread (a marker: nothing is hidden)
await client.notifications.bulk({ thread_key: 'mission:pick-42', action: 'mute' });

// Delete with undo
declare const ids: string[];
const result = await client.notifications.bulk({ ids, action: 'delete' });
if (result.undo_token !== undefined) {
  const { restored } = await client.notifications.undo(result.undo_token);
  console.log(`restored ${restored}`);
}
```

- **Non-selective filters are refused.** `bulk()` validates every filter before sending and throws
  `ValidationError` for `{}`, `{ state: 'all' }`, a lone `from` / `to`, and a `q` made only of scoped terms; add
  `thread_key`, `kind`, `severity`, `zone`, `asset`, `pinned`, another `state` or free text. Every filter (bulk,
  list, facets, export) refuses a blank or whitespace-only `thread_key` or `asset` with `ValidationError`.
- **Scope.** `ids` and `thread_key` also match archived items; a `filter` does not, unless its `state` is
  `archived` or `all`.
- **Limits.** 1000 or more matching items → `PayloadTooLargeError` (nothing changed).
- **`affected`** counts the items whose stored fields changed. `read`, `archive` and `acknowledge` write a fresh
  timestamp, so items already read, archived or acknowledged are counted again; `pin` and `mute` are not.
  `pin` cannot unpin. `acknowledge` with a `filter.kind` acknowledges any kind, direct messages included.
- **Undo.** A token is returned when something changed; it is single use and valid for 300 s. `delete` is a hard
  delete — the only way to delete items — and undo re-inserts them. An unknown, used or expired token →
  `NotFoundError` (`apiCode: 'undo_unavailable'`).

## 5. Sending

<!-- snippet: prelude=client -->
```ts
import { RateLimitError } from 'ubudu-rtls-sdk';

// To yourself: no role needed. The SDK finds your user id once per namespace.
const note = await client.notifications.sendToSelf({
  kind: 'mission',
  title: 'Restock aisle 4',
  mission_id: 'restock-a4', // thread_key 'mission:restock-a4'
  mission: { status: 'open', due: Date.now() + 3_600_000 },
  params: { zoneName: 'Aisle 4' }, // context goes here: the server ignores zone and asset on a send
});
console.log(note.thread_key);

// To another user: needs the send_notifications role.
try {
  const created = await client.notifications.send({
    recipients: [{ target_type: 'user', id: 'user-id' }],
    title: 'Shift handover',
    conversation_id: 'handover', // thread_key 'dm:handover'
  });
  console.log(created.length);
} catch (error) {
  if (error instanceof RateLimitError) console.log(`retry in ${error.retryAfter ?? 0} ms`);
  else throw error;
}
```

- **Roles.** A self-send needs no role. Any other recipient, more than one recipient, and `severity: 'critical'`
  need `send_notifications` (`AuthorizationError` otherwise).
- **Recipients.** Only `target_type: 'user'` is resolved; at most 100; duplicates collapse.
- **External delivery.** `channels` (`email`, `slack`, `telegram`, `teams`, `whatsapp`) forwards each item to the
  recipient's *verified* connections of those channels. Without `channels` nothing leaves the platform.
- **Not idempotent.** A send is never retried by the SDK, whatever the client's retry policy.
- **Rate limit.** 60 sends per minute per user and namespace, counted before validation;
  `RateLimitError.retryAfter` is in milliseconds.

## 6. Live stream

`stream({ signal })` opens the server-sent events stream of the caller's inbox. The signal is required; abort it
to close the stream. Consume it with `for await` or with listeners; `done` always resolves and says why it ended.
A `for await` loop also throws when the stream ends in error, so wrap it in `try` / `catch`.

<!-- snippet: prelude=client -->
```ts
const controller = new AbortController();
setTimeout(() => controller.abort(), 60_000);

const stream = client.notifications.stream({ signal: controller.signal });
try {
  for await (const event of stream) {
    if (event.type === 'open') console.log('connected');
    if (event.type === 'item') console.log('new item', event.data.thread_key);
    if (event.type === 'state') console.log('changed', event.data.id);
  }
} catch (error) {
  console.log('stream failed:', error instanceof Error ? error.message : error);
}
console.log((await stream.done).reason); // 'aborted', or 'error' after the catch
```

<!-- snippet: prelude=client -->
```ts
const controller = new AbortController();
let badge = await client.notifications.unreadCount();
const refresh = async (): Promise<void> => {
  badge = await client.notifications.unreadCount();
  console.log(badge.unread);
};
const onItem = (): void => void refresh();

const stream = client.notifications
  .stream({ signal: controller.signal, reconnect: { initialDelayMs: 1000, maxDelayMs: 30_000 } })
  .on('item', onItem)
  .on('state', () => void refresh())
  .on('unread_count', () => void refresh())
  .on('reconnected', () => void refresh()) // events were missed: re-fetch the list too
  .on('error', (error, { fatal }) => console.log(fatal ? 'stopped' : 'reconnecting', error.name));

// Later: stop reacting to new items; the stream and the other listeners stay.
stream.off('item', onItem);

const end = await stream.done;
if (end.reason === 'error') console.log(end.error.message);
```

`on(type, listener)` returns the stream, so calls chain; `off(type, listener)` removes a listener (pass the same
function you registered).

| Event | `data` | When |
|---|---|---|
| `open` | `{ app_namespace, user_id }` | on every (re)connection |
| `item` | the new item | a send or the alert engine created an item for you |
| `state` | `{ id, …changed fields }` | a single-item change (read, acknowledge, archive, pin, snooze, mission) |
| `unread_count` | `{ action, affected }` — not counts | a bulk change |
| `reconnected` | `{ attempt }` | emitted by the SDK right after the `open` of a re-connection |

- **Re-sync.** The server does not resume: after `reconnected`, re-fetch `unreadCount()` and the list. Bulk undo
  and sends emit no `unread_count`; re-fetch the badge on `item`, `state` and `unread_count`.
- **Reconnect.** On by default: `{ initialDelayMs: 1000, maxDelayMs: 30000, maxAttempts: Infinity }` with
  exponential back-off; the counter resets on every `open`. A stream silent for `idleTimeoutMs` (default 45 s; the
  server sends a heartbeat every 20 s) reconnects. `reconnect: false` ends the stream instead.
- **`done`.** `{ reason: 'aborted' }` (signal aborted or the loop left), `{ reason: 'ended' }` (server closed with
  reconnect off), `{ reason: 'error', error }` (401, 403 or 404, for example 404 when notifications are disabled;
  attempts exhausted; or any failure with `reconnect: false`). With `for await`, an error end also makes the loop
  throw that error once the queued events are delivered: wrap the loop in `try` / `catch`, or consume with
  listeners and read `done`. A listener that throws does not stop the stream: `error` listeners receive a
  `StreamError` with `reason: 'protocol'`.
- **Authentication** is sent in a header. Browser `EventSource` cannot send headers, and the SDK never puts the key
  in a URL; the stream reads the `fetch` response body as it arrives, which works in every Node version the SDK
  supports (20.3+) and in current browsers.

## 7. Forwarding rules

A rule subscribes its owner to engine events and forwards them to channels. **An enabled rule with an empty
`match` matches every event**, so the SDK requires `enabled` on `create`.

<!-- snippet: prelude=client -->
```ts
const rule = await client.notifications.rules.create({
  enabled: false, // enable it once the match is right
  name: 'Critical cold-room alerts',
  match: { kinds: ['alert'], min_severity: 'critical', zones: [12], asset_tags: ['freezer'] },
  channels: ['inapp', 'email'],
  throttle: { coalesce_seconds: 300, group: 'zone' },
});

const stored = await client.notifications.rules.get(rule._id);
console.log(stored.enabled, stored.match);
await client.notifications.rules.update(rule._id, { name: 'Cold-room alerts' });
console.log((await client.notifications.rules.list()).length);
await client.notifications.rules.delete(rule._id);
```

`match` keys: `kinds`, `min_severity`, `zones` (ids), `asset_tags`, `event_types`; all present keys must match.
`update` sets only the keys you pass, replaces `match` as a whole, and ignores `channels: []` (a rule's channels
cannot be cleared). Enabling a broad rule subscribes you to every matching event.

## 8. Channel connections

A connection holds the caller's address for one external channel. `upsert` replaces the caller's connection of
that channel and resets `verified` to `false`; unverified connections are never used.

<!-- snippet: prelude=client -->
```ts
const conn = await client.notifications.connections.upsert({
  channel: 'email',
  credentials: { address: '<your e-mail address>' },
});

const check = await client.notifications.connections.test(conn._id); // sends a real e-mail
console.log(check.verified, check.delivery.status, check.delivery.error);

const stored = await client.notifications.connections.get(conn._id); // secrets redacted
console.log(stored.channel, stored.verified);
await client.notifications.connections.delete(conn._id);
```

`get(id)` returns one connection, secrets redacted. `delete(id)` removes the connection: nothing is forwarded on
that channel until a new connection is upserted and verified.

| Channel | `credentials` |
|---|---|
| `inapp` | none |
| `email` | `address` |
| `slack` | `webhook_url`, optional `bot_token` (write-only) |
| `telegram` | `chat_id` |
| `teams` | `workflow_url` |
| `whatsapp` | `phone_e164` |

`test()` sends a real message on every external channel. It resolves on success **and** on a 422 "not
delivered" answer (`verified: false` with the delivery status and error code, e.g. `not_connected`); other errors
throw. Secrets come back redacted as `{ set: true, fingerprint }`. Outbound URLs the server refuses →
`ValidationError` with `apiCode: 'ssrf_blocked'`.

## 9. Saved views and retention

<!-- snippet: prelude=client -->
```ts
const view = await client.notifications.savedViews.create({
  name: 'Critical this week',
  query: { severity: 'critical', from: new Date(Date.now() - 7 * 86_400_000) },
});
const stored = await client.notifications.savedViews.get(view._id);
const items = await client.notifications.list({ severity: stored.query.severity });
console.log(items.length);
await client.notifications.savedViews.delete(view._id);

const policy = await client.notifications.cleanupPolicy.get();
console.log(policy.auto_archive_days, policy.auto_purge_days, '_id' in policy ? 'stored' : 'defaults');
```

A saved view's `query` takes the list filters; the SDK sends `from` / `to` as epoch milliseconds. There is no
update. The `cleanupPolicy.get()` answer without `_id` means nothing is stored and the defaults (30 / 180 days)
apply.

**Before you call `cleanupPolicy.replace()`:** it creates a permanent row (there is no delete), values are clamped
to the tenant's cap, and both fields are required on every write (the server resets an omitted one to its
default).

<!-- snippet: prelude=client -->
```ts
await client.notifications.cleanupPolicy.replace({ auto_archive_days: 30, auto_purge_days: 180 });
```

## 10. Administration

`client.notifications.admin` needs the `manage_api_keys` role; without it every call throws
`AuthorizationError` (`apiCode: 'insufficient_role'` or `'namespace_access_denied'`).

<!-- snippet: prelude=client -->
```ts
import { AuthorizationError } from 'ubudu-rtls-sdk';

try {
  const config = await client.notifications.admin.tenantConfig.get();
  console.log(Object.keys(config).filter((k) => ['email', 'slack', 'telegram', 'teams', 'whatsapp'].includes(k)));

  // Top-level merge: the supplied channel object replaces the stored one; omitted keys are kept.
  await client.notifications.admin.tenantConfig.update({
    email: { smtp_host: 'smtp.example.com', smtp_port: 587, from: '<sender address>' },
  });

  const mapping = await client.notifications.admin.recipientMappings.create({
    enabled: false,
    match: { kinds: ['alert'], min_severity: 'critical' },
    recipients: { user_ids: ['user-id'] },
    channels: ['inapp'],
  });
  await client.notifications.admin.recipientMappings.update(mapping.id, { enabled: true });
  const one = await client.notifications.admin.recipientMappings.get(mapping.id);
  console.log(one.enabled, (await client.notifications.admin.recipientMappings.list()).length);
  await client.notifications.admin.recipientMappings.delete(mapping.id);
} catch (error) {
  if (error instanceof AuthorizationError) console.log('needs the manage_api_keys role');
  else throw error;
}
```

- **Tenant configuration.** Secrets (`email.auth.pass`, `slack.bot_token`, `telegram.bot_token`,
  `whatsapp.cloud_api.access_token`, `teams.azure_app.client_secret`) are write-only: reads return
  `{ set: true, fingerprint }`, and sending that object (or nothing) back keeps the stored secret. The SDK strips
  `app_namespace`, `_id`, `updated_at` and `__v` and refuses an empty update (it would still create a permanent
  document). There is no delete.
- **Recipient mappings** route matching engine events to extra recipients. `enabled` is required on `create`
  (the server default is `true`). Ids look like `map_<ms>_<seq>`. The mappings are one namespace-wide list
  rewritten on every change, so two admins editing at once can lose an edit. `recipients.roles` and
  `recipients.zone_responsibles` are stored but not resolved; only `user_ids` receive events.

## 11. Known server limitations

- Without `group_by` the server returns thread roll-ups of one page; `list()` asks for flat items explicitly.
- The stream's `unread_count` event carries the bulk action and the number of items it changed, not counts, and
  only bulk changes emit it.
- Bulk filters: the SDK validates every filter before sending and refuses an invalid or non-selective one.
- Mute and snooze are markers: nothing is hidden or resurfaced, `until` is not enforced, there is no unmute. The
  per-item mute route is not wrapped (it leaves a record nothing can delete); use `bulk({ thread_key, action:
  'mute' })`.
- A retention-policy write is permanent; the SDK requires both fields on every write.
- A send ignores `zone`, `asset` and `rule_id` and resolves only `user` recipients; put context in `params`.
- The API specification lacks many request and response schemas; the SDK's types follow the server.
- A rule update cannot clear `channels` and replaces `match` wholesale.
- Bulk `acknowledge` with a `filter.kind` also acknowledges direct messages.
- Saved views have no update; build their `query` from the list filters.
- Exports stop at 10 000 rows silently.
- To send to yourself, use `sendToSelf()`: it resolves your user id once per namespace and caches it.
- Cross-origin browsers cannot read `X-Total-Count` or `Retry-After`.

## 12. Errors in this domain

| Status | `apiCode` | When | SDK class |
|---|---|---|---|
| — | — | invalid argument, caught before any request | `ValidationError` (status 0) |
| 400 | `bad_request` | invalid bulk, send, snooze, mission status, rule, mapping, saved view or channel | `ValidationError` |
| 400 | `too_many_recipients`, `no_resolvable_recipients` | send | `ValidationError` |
| 400 | `ssrf_blocked` | connection with a refused outbound URL | `ValidationError` |
| 401 | — | missing or invalid credentials | `AuthenticationError` |
| 403 | `insufficient_role`, `namespace_access_denied` | send to others / critical, admin routes | `AuthorizationError` |
| 404 | `not_found` | unknown id; also every route when notifications are disabled (no `apiCode` then) | `NotFoundError` |
| 404 | `undo_unavailable` | unknown, used or expired undo token | `NotFoundError` |
| 409 | `not_actionable` | acknowledge on a direct message | `ConflictError` |
| 409 | `not_a_mission` | `updateMission` on a non-mission | `ConflictError` |
| 413 | `too_many_matched` | bulk matching 1000 items or more | `PayloadTooLargeError` |
| 422 | — | connection test not delivered | not an error: `connections.test()` resolves |
| 429 | `rate_limited` | more than 60 sends per minute | `RateLimitError` (`retryAfter` in ms) |
| 500 | `internal_error` | server failure | `ServerError` |
| 503 | `router_unavailable` | connection test | `ServiceUnavailableError` |

See the [Error Handling guide](error-handling.md) for retry strategies.
