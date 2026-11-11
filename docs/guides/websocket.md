# WebSocket streaming

The RTLS platform pushes live data over two WebSocket endpoints: the **subscriber** socket delivers processed
positions, zone entries and exits, zone counters, alerts, asset changes and refetch hints as they happen, and the
**publisher** socket accepts positions from your own sources. The SDK wraps them in three classes:
`RtlsWebSocketSubscriber`, `RtlsWebSocketPublisher` and `RtlsWebSocketClient`, which drives both.

Back to the [documentation index](../README.md).

## Prerequisites

- An API key (or a bearer token) and the application namespace, as for the REST client.
- A WebSocket implementation (see [Runtimes](#runtimes)): on Node install the optional peer dependency `ws`
  (`npm install ws`); Node 22 and later, Bun and browsers also work with their native `WebSocket`.

## Quick example

The shortest path is the client you already have: `createWebSocket()` uses its namespace, its credential and its
base URL.

<!-- snippet: prelude=client -->
```ts
const ws = client.createWebSocket();

ws.on('POSITIONS', (p) => {
  console.log(p.user_uuid, p.lat, p.lon, p.zone.name);
});
ws.on('ZONES_ENTRIES_EVENTS', (e) => {
  console.log(e.event_type, e.user_udid, e.zone === null ? 'outside all zones' : e.zone.properties.id);
});
ws.on('reconnected', () => {
  // Delivery is at most once: refetch the current state through REST after a reconnect.
});

await ws.connect();
await ws.subscribe('ALL');
// … later
await ws.disconnect();
```

The standalone subscriber takes its configuration directly. It has no default context, so `namespace` is required.
It does not read the REST client's `baseUrl` either: it connects to the production broker (`WEBSOCKET_URLS`)
unless you pass `subscriberUrl` (see [Connection settings](#connection-settings)):

```ts
import { RtlsWebSocketSubscriber, SubscriptionType } from 'ubudu-rtls-sdk';

const subscriber = new RtlsWebSocketSubscriber({
  namespace: 'my-namespace',
  apiKey: process.env.RTLS_API_KEY ?? '',
  reconnect: { retryInitialConnect: true },
});
subscriber.on('ALERTS', (alert) => console.log(alert.params?.title));
await subscriber.connect();
await subscriber.subscribe([SubscriptionType.POSITIONS, SubscriptionType.ALERTS]);
```

## Methods

Live tier is the tier of the live test that proves the method against the production API (R: read-only, S: side
effects, here one published test position).

| Class | Method | Wire | Live tier |
|---|---|---|---|
| `RtlsWebSocketSubscriber` | `connect()`, `disconnect()`, `isConnected()`, `getState()`, `getConnectionStatus()` | upgrade of `/ws/subscriber` | R |
| `RtlsWebSocketSubscriber` | `subscribe(request?)` | `SUBSCRIBE` (a change: `UNSUBSCRIBE` then `SUBSCRIBE`) | R |
| `RtlsWebSocketSubscriber` | `unsubscribe(types?)` | `UNSUBSCRIBE` (+ `SUBSCRIBE` of the remaining types) | R |
| `RtlsWebSocketSubscriber` | `setTagFilter(uuids)` | `FILTER_MGT` | R |
| `RtlsWebSocketSubscriber` | `getSubscription()`, `getActiveSubscriptions()` | — (local state) | R |
| all three | `on`, `once`, `off`, `removeAllListeners`, `listenerCount`, `hasListeners`, `eventNames` | — | R |
| `RtlsWebSocketPublisher` | `sendPosition(data)`, `sendBatch(positions)` | one position frame per position on `/ws/publisher` | S (validation and connection failures: R) |
| `RtlsWebSocketPublisher` | `getMapUuid()` | — | R |
| `RtlsWebSocketClient` | every subscriber and publisher method above, plus `isSubscriberConnected()`, `isPublisherConnected()`, `getSubscriber()`, `getPublisher()`, `getConfig()`, `getNamespace()` | both sockets | R |
| `RtlsClient` | `createWebSocket(options?)` | — | R |
| functions | `classifyMessage`, `isPositionMessage`, `isZoneEntryExitMessage`, `isZoneStatsMessage`, `isAlertMessage`, `isAssetMessage`, `isSubscriptionConfirmation` | — | R |

## WebSocket, REST or SSE

- **WebSocket** (this guide): the live stream of every position and event of the namespace, with no history. A
  message missed while disconnected is gone.
- **REST**: the position cache (`client.positions`) answers "where is every tag now", and the history endpoints
  answer "where was it". Use them to initialise state and to resync after a reconnect.
- **Publishing**: the WebSocket publisher is fire-and-forget. The HTTP publish, `client.positions.publish(…)`,
  answers with a status, so use it when you need to know that a position was accepted, or when you want
  `patchAssetData` (persisting asset fields with the position). Declared positions belong to
  `client.declaredLocations`.
- **Notifications** (`client.notifications`, see the [notifications guide](notifications.md)): the server-sent
  event stream of user notifications. The WebSocket `ALERTS` feed carries the raw alert events of the rule engine
  for the whole namespace.

## Runtimes

- **Node `>=20.3.0`** (the SDK's floor). Install `ws`: on Node the SDK prefers it over the built-in global
  because only `ws` provides protocol keepalive, the HTTP status of a refused handshake and header
  authentication. Node 20 has no global `WebSocket`, so `ws` is required there.
- **Node 22 and later, Bun, browsers**: the native `WebSocket` works without `ws`. Keepalive is not available
  on it and authentication failures look like network errors in browsers (see [Authentication](#authentication)).
- **Injecting an implementation**: pass any WebSocket class as `WebSocket` (a custom agent, a test double):

```ts
import WebSocket from 'ws';
import { RtlsWebSocketSubscriber } from 'ubudu-rtls-sdk';

const subscriber = new RtlsWebSocketSubscriber({
  namespace: 'my-namespace',
  apiKey: 'my-api-key',
  WebSocket,
});
```

- **ESM and CommonJS**: both builds resolve `ws` at run time (a dynamic import), so neither needs a global
  `WebSocket` and a bundler does not have to include `ws` for the browser.

## Connection settings

The defaults are exported as `WEBSOCKET_URLS` and `WEBSOCKET_DEFAULTS`.

| Option | Default | Notes |
|---|---|---|
| `subscriberUrl` | `WEBSOCKET_URLS.SUBSCRIBER` (`wss://rtls.ubudu.com/api/ws/subscriber`) | subscriber and unified client |
| `publisherUrl` | `WEBSOCKET_URLS.PUBLISHER` (`wss://rtls.ubudu.com/api/ws/publisher`) | publisher and unified client |
| `connectionTimeout` | `WEBSOCKET_DEFAULTS.CONNECTION_TIMEOUT_MS` (10 000 ms) | from the start of an attempt until the socket opens; then `Connection timeout` |
| `subscriptionTimeoutMs` | `WEBSOCKET_DEFAULTS.SUBSCRIPTION_TIMEOUT_MS` (10 000 ms) | wait for the broker's confirmation of a `SUBSCRIBE` |
| `reconnect` | `initialDelayMs` `RECONNECT_INTERVAL_MS` (5000), `maxDelayMs` `MAX_RECONNECT_DELAY_MS` (30 000), `maxAttempts` `MAX_RECONNECT_ATTEMPTS` (unlimited) | see [Lifecycle](#lifecycle) |
| `keepAliveIntervalMs`, `pongTimeoutMs` | `KEEPALIVE_INTERVAL_MS` (30 000 ms), `PONG_TIMEOUT_MS` (10 000 ms) | with `ws` only |

The standalone classes default to these URLs whatever REST `baseUrl` your application uses: on another
deployment, pass `subscriberUrl` and `publisherUrl` explicitly. `client.createWebSocket()` derives them from the client's `baseUrl`
(`https:` → `wss:`, the base path followed by `/ws/subscriber` and `/ws/publisher`); options you pass override
them. A root-relative `baseUrl` outside a browser leaves nothing to derive: pass `subscriberUrl` and
`publisherUrl`, or `createWebSocket()` throws `ValidationError`.

```ts
import { RtlsWebSocketSubscriber } from 'ubudu-rtls-sdk';

const subscriber = new RtlsWebSocketSubscriber({
  namespace: 'my-namespace',
  apiKey: 'my-api-key',
  subscriberUrl: 'wss://rtls.example.com/api/ws/subscriber',
  connectionTimeout: 20_000,
});
```

## Authentication

- `apiKey` or `token` (a token wins when both are given). Each may be a string or a function returning a string or
  a promise of one; the function is called on every connection attempt, so a reconnect picks up a refreshed
  token.
- `authTransport: 'query'` (default) puts the credential in the URL (`?apiKey=` or `?token=`);
  `authTransport: 'header'` sends `X-API-Key` or `Authorization: Bearer` on the upgrade request instead. Header
  mode needs a `ws`-like implementation: with any other one `connect()` rejects before a socket is created.
- The SDK never logs a URL with its query or a credential, also with `debug: true`.

<!-- snippet: prelude=client -->
```ts
async function currentToken(): Promise<string> {
  return 'a-fresh-token';
}

const ws = client.createWebSocket({ token: currentToken, authTransport: 'header' });
```

What a refused credential looks like depends on the runtime, because the browser WebSocket API hides the HTTP
status of the handshake:

| Runtime | What the SDK sees | Error |
|---|---|---|
| Node with `ws` | the handshake answer `401` | `WebSocketAuthenticationError`, `status` 401 (403 likewise) |
| Bun | the handshake answer `401` | `WebSocketAuthenticationError`, `status` 401 |
| Browsers, Node's built-in global | an error, then close `1006`, no status | `WebSocketConnectionError` (not distinguishable from a network failure) |

A refused handshake (401/403) is never retried, whatever the reconnect policy; during a reconnect cycle it ends
the cycle with `reconnect_failed`. A credential function that throws or rejects makes the first `connect()` reject
with `WebSocketAuthenticationError` (`status` 0); during a reconnect cycle it counts as one failed attempt, so
reconnection goes on (up to `maxAttempts`) and a refreshed credential is picked up on the next attempt.

## Subscriptions

<!-- snippet: prelude=subscriber -->
```ts
import { SubscriptionType } from 'ubudu-rtls-sdk';

await subscriber.subscribe(); // every kind ('ALL')
await subscriber.subscribe([SubscriptionType.POSITIONS, SubscriptionType.ZONE_STATS_EVENTS]);
await subscriber.subscribe({ types: [SubscriptionType.POSITIONS], uuids: ['02:5D:4B:00:00:01'] });
await subscriber.setTagFilter(null); // positions of every tag again
await subscriber.unsubscribe(SubscriptionType.ZONE_STATS_EVENTS);
await subscriber.unsubscribe(); // nothing more is delivered; the socket stays open
console.log(subscriber.getSubscription()); // { types, uuids, active }
```

- **ALL versus explicit types.** `subscribe()`, `subscribe('ALL')` and the deprecated `subscribe([])` receive every
  kind. An explicit list can name only the five filter values (`POSITIONS`, `ZONES_ENTRIES_EVENTS`,
  `ZONE_STATS_EVENTS`, `ALERTS`, `ASSETS`); the tag-lost events and the refetch hints arrive **only under ALL**,
  because the broker recognises no filter string for them.
- **Changing a subscription.** The broker keeps the first type filter of a connection, so every change is sent as
  `UNSUBSCRIBE` followed by `SUBSCRIBE`. Messages sent in that short gap are not delivered. `subscribe()` resolves
  when the broker confirms; calls are queued, one confirmation at a time.
- **`unsubscribe(types)`** re-subscribes the remaining types. From ALL, the remainder is the explicit list of the
  other filter values, so tag-lost events and refetch hints stop too. `unsubscribe()` with no argument stops
  everything; a reconnect does not resubscribe.
- **Tag filter** (`uuids` in `subscribe()`, or `setTagFilter()`): applies to **positions only**, by exact tag id.
  MAC-shaped ids are normalised to 12 lower-case hex characters (`02:5D:4B:00:00:01` → `025d4b000001`). Zone
  events, counters and alerts are not filtered. `null` or `[]` clears the filter; while not subscribed the filter
  is stored and sent with the next `SUBSCRIBE`.
- **Map filter.** The broker ignores a map in the subscription. `mapUuid` on the subscriber filters on the client:
  typed events of kinds that carry another `map_uuid` are dropped (the raw `message` event still fires).
- On every new socket the SDK sends the stored active subscription again (ALL stays ALL, the tag filter is
  included): after a reconnect, and also on a `connect()` after `disconnect()`, after a drop with
  `reconnect: false` or after `reconnect_failed`. `connect()` resolves, and after a reconnect `reconnected` fires,
  once the broker has confirmed it. After `unsubscribe()` nothing is sent again.

## Message catalogue

Every message is a JSON object with the platform's own field names (snake case). The typed event of each kind
receives the typed message; the `message` event receives every parsed frame. `classifyMessage(msg)` returns the
kind and the `is*Message` guards test one kind each.

General rules:

- **Tag ids**: positions name the tag `user_uuid` (with `user_udid` set to the same value); zone events, alerts
  and tag-lost events name it `user_udid` and have no `user_uuid`.
- **Timestamps**: positions carry the `timestamp` the source sent (an ISO 8601 string when the source sent none).
  Alerts and asset events carry no timestamp.
- **Merge with the asset**: a delivered position is the published frame merged over the stored asset record, so it
  carries the asset's name, type, tags and `data`. A field set to `null` in the frame removes it; `data` merges per
  key.
- **Zone 0**: a position outside every zone has `zone: { id: 0, name: 'OUTSIDE_ALL_ZONES', tags: [], color: null }`.
  A zone event for the outside-all-zones pseudo-zone has `zone: null`.
- **Units**: speed in m/s (`null` when the time step is zero), distances in metres, counter times in seconds.

### Positions

Event `POSITIONS`, filter `POSITIONS`, no `action` key; numeric `lat`/`lon` and a string `user_uuid`.

| Field | Type | Notes |
|---|---|---|
| `app_namespace` | string | |
| `user_uuid`, `user_udid` | string | the tag id (12 lower-case hex for MACs) |
| `lat`, `lon` | number | WGS 84 |
| `map_uuid` | string | positions without a map are not delivered |
| `timestamp` | string \| number | as sent by the source |
| `zone` | `{ id, name, tags, color }` | zone 0 = outside every zone |
| `origin` | number | set to `0` by the platform when the source sent none |
| `origin_detail`, `level` | string, number | optional |
| `speed`, `prev_pos_distance`, `prev_pos_time_diff_seconds` | number | optional; `speed` may be `null` |
| `user_name`, `user_type`, `model`, `color`, `path`, `tags`, `external_id`, `data`, `dateCreated`, `dateChanged`, … | | from the asset record; any other field the source sent passes through |

```json
{
  "app_namespace": "test_namespace",
  "user_uuid": "025d4b000001",
  "user_udid": "025d4b000001",
  "user_name": "Asset-001",
  "user_type": "forklift",
  "tags": ["fleet"],
  "data": { "department": "logistics" },
  "lat": 48.8566,
  "lon": 2.3522,
  "map_uuid": "11111111-2222-4333-8444-555555555555",
  "timestamp": "<ISO 8601 timestamp>",
  "zone": { "id": 0, "name": "OUTSIDE_ALL_ZONES", "tags": [], "color": null },
  "origin": 0,
  "speed": 0.42
}
```

### Zone entries and exits

Event `ZONES_ENTRIES_EVENTS`, filter `ZONES_ENTRIES_EVENTS`, `action: 'notifyEvent'` with `event_type`
`ENTER_ZONE` or `EXIT_ZONE`.

| Field | Type | Notes |
|---|---|---|
| `user_udid` | string | the tag id |
| `zone` | zone Feature \| `{ properties: { id } }` \| `null` | `null`: outside all zones; the stub on presence-expiry exits |
| `map_uuid`, `timestamp` | string, string \| number | the triggering position's |
| `user_name`, `external_id`, `tags`, `data`, `path`, `model`, `color` | | from the asset record |
| `visit_id`, `start_ts`, `exit_ts` | string \| null, string \| number \| null | visit tracking; `null` when it is off |

```json
{
  "action": "notifyEvent",
  "event_type": "ENTER_ZONE",
  "app_namespace": "test_namespace",
  "map_uuid": "11111111-2222-4333-8444-555555555555",
  "user_udid": "025d4b000001",
  "zone": {
    "type": "Feature",
    "geometry": { "type": "Polygon", "coordinates": [[[2.352, 48.8564], [2.3526, 48.8564], [2.3526, 48.8568], [2.352, 48.8564]]] },
    "properties": { "id": 3, "name": "Loading-Dock", "level": 0, "tags": ["dock"] }
  },
  "timestamp": "<ISO 8601 timestamp>",
  "user_name": "Asset-001",
  "visit_id": "visit-0001",
  "start_ts": "<ISO 8601 timestamp>",
  "exit_ts": null
}
```

### Zone counters

Event `ZONE_STATS_EVENTS`, filter `ZONE_STATS_EVENTS`, `event_type: 'UPDATE_ZONE_COUNTER'`.

| Field | Type | Notes |
|---|---|---|
| `zone` | `{ properties: { id } }` \| zone Feature | |
| `total`, `total_tags`, `total_mobiles` | number | current occupancy |
| `avg_time`, `avg_time_tags`, `avg_time_mobiles` | number | average dwell time, seconds |
| `timestamp` | string \| number | |
| `map_uuid`, `is_synthetic_exit` | string, boolean | only with a full zone Feature; `is_synthetic_exit` is then always `true` |

```json
{
  "action": "notifyEvent",
  "event_type": "UPDATE_ZONE_COUNTER",
  "app_namespace": "test_namespace",
  "zone": { "properties": { "id": 3 } },
  "total": 4,
  "total_tags": 3,
  "total_mobiles": 1,
  "avg_time": 125.5,
  "avg_time_tags": 140,
  "avg_time_mobiles": 82,
  "timestamp": "<ISO 8601 timestamp>"
}
```

### Alerts

Event `ALERTS`, filter `ALERTS`, `event_type: 'NOTIFICATION'`. No timestamp.

| Field | Type | Notes |
|---|---|---|
| `user_udid`, `user_type` | string | copied from the trigger; **absent** when a zone event fired the rule, so correlate such alerts through the zone event |
| `zone` | position zone \| zone Feature \| stub \| `null` | the trigger's zone |
| `params` | `{ title?, text?, style?, … }` | the rule's event parameters; absent when the rule has none |
| `map_uuid` | string | optional |

```json
{
  "action": "notifyEvent",
  "event_type": "NOTIFICATION",
  "app_namespace": "test_namespace",
  "user_udid": "025d4b000001",
  "user_type": "forklift",
  "zone": { "id": 3, "name": "Loading-Dock", "tags": ["dock"], "color": "#FF8800" },
  "params": { "title": "Restricted area", "text": "Asset-001 entered the loading dock", "style": "warning" }
}
```

### Tag lost

Event `TAG_LOST`, only under ALL, `event_type: 'USR_EXIT'`: one event per zone whose presence expired for a tag
that stopped reporting. Fields: `user_udid`, `zone` (Feature, stub or `null`), `map_uuid`, `is_synthetic_exit`,
`user_name`, `tags` (may be `null`), `data`, `external_id`.

```json
{ "action": "notifyEvent", "event_type": "USR_EXIT", "app_namespace": "test_namespace", "user_udid": "025d4b000001", "zone": { "properties": { "id": 3 } }, "is_synthetic_exit": true }
```

### Asset changes

Event `ASSETS`, filter `ASSETS`, `type: 'assets'` with `action` `create`, `update` or `delete`. `mac_address` names
the asset and `data` holds the stored record (absent on `delete`). No timestamp.

```json
{ "type": "assets", "action": "update", "app_namespace": "test_namespace", "mac_address": "025d4b000001", "data": { "user_udid": "025d4b000001", "user_name": "Asset-001", "tags": ["fleet"] } }
```

### Refetch hints

Only under ALL. They carry no payload: refetch the named resource through REST.

| Event | Discriminator | Refetch |
|---|---|---|
| `ALERT_RULES_CHANGED` | `type: 'alert_rules'`, `action: 'update'` | the alert rules |
| `ASSETS_LIBRARY_CHANGED` | `action: 'fetchAssetsLibraryEvent'` | the asset library |
| `DATA_MODELS_CHANGED` | `action: 'fetchDataFiltersTaxonomyEvent'` | the data models |
| `SETTINGS_CHANGED` | `action: 'updateSettingsEvent'` | the namespace settings |
| `MAP_DATA_CHANGED` | `action: 'fetchMapEditorDataEvent'`, optional `venue_id`, `map_id` | the venue map data |

### Subscription confirmation and unknown messages

The broker answers `SUBSCRIBE` with `{ "app_namespace": "…", "action": "subscribeEvent" }` and nothing else, so it
cannot confirm which types or tags were accepted: `subscribe()` resolves with what you asked for. The confirmation
is never emitted as a typed event. Under a subscription to every kind (`'ALL'`), a message of no known kind goes
to the `unknown` event; with explicit types it fires only `message`. When no confirmation
arrives within `subscriptionTimeoutMs`, `subscribe()` rejects but keeps the request as the stored subscription, since
the broker may have registered it: a reconnect replays it, and `unsubscribe()` ends it.

## Lifecycle

States: `DISCONNECTED`, `CONNECTING`, `CONNECTED`, `CLOSING`, `RECONNECTING`. Events: `connected`,
`disconnected` (`{ code, reason, willReconnect }`, only after an open connection; `willReconnect` is `false` with
`reconnect: false`, and also when no attempt is left, `reconnect_failed` then following), `reconnecting`
(`{ attempt, delay }`), `reconnected`, `reconnect_failed` (`{ attempts, error }`), `error` (`{ error }`) and
`message`.

<!-- snippet: prelude=subscriber -->
```ts
subscriber.on('disconnected', ({ code, willReconnect }) => console.log('closed', code, willReconnect));
subscriber.on('reconnected', () => {
  // at-most-once delivery: reload the current positions through REST here
});
subscriber.on('reconnect_failed', ({ attempts }) => console.log(`gave up after ${attempts} attempts`));
```

- **Reconnect policy** (`reconnect`): any close that `disconnect()` did not start schedules a reconnect. Delays grow
  from `initialDelayMs` (5000) by `multiplier` (2) up to `maxDelayMs` (30000) with full jitter (a random delay up
  to the computed one), so many clients do not reconnect in lock-step after a broker restart. `maxAttempts`
  (default unlimited) ends the cycle with `reconnect_failed`, and so does a refused handshake (401/403) during the
  cycle; `reconnect: false` disables it.
- **`retryInitialConnect: true`** retries a failing first `connect()` with the same policy; recommended for
  long-running consumers.
- **Keepalive** (`keepAliveIntervalMs`, default 30000; `pongTimeoutMs`, default 10000): with `ws` the SDK sends a
  protocol ping at that interval; without a pong in time it emits `error` (`Keepalive timeout`) and reconnects.
  Native WebSockets have no ping API; reconnect covers idle drops there.
- `disconnect()` closes with code 1000, waits up to 3 s for the close and then terminates the socket. Called
  while connecting, it makes the pending `connect()` reject with `Connection aborted by disconnect()`.

## Publishing

<!-- snippet: prelude=publisher -->
```ts
const result = await publisher.sendPosition({
  macAddress: '02:5D:4B:00:00:01',
  latitude: 48.8566,
  longitude: 2.3522,
  timestamp: new Date(),
  name: 'Forklift 1',
  extra: { level: 0 },
});
if (!result.success) console.error(result.error);
```

- **The frame holds only what you pass**: `app_namespace`, `user_uuid` (the normalised MAC), `lat`, `lon`,
  `map_uuid`, `timestamp` (ISO 8601 UTC, default now), then `user_name` (`name`), `model`, `color`, `origin` and
  `data` when given, then the `extra` keys. No defaults are added: a delivered position then shows `origin: 0`,
  which the platform sets.
- **`extra`** passes other wire fields through. It may not hold a field the SDK sets, nor `patch_asset_data`,
  `declared_location`, `network_uuid`, `action`, `type` or `event_type`.
- **`mapUuid` is required in the configuration**: `new RtlsWebSocketPublisher` throws without it, and a unified
  client (`createWebSocket()` or `RtlsWebSocketClient`) has a publisher only when it is given `mapUuid`.
  `sendPosition({ mapUuid })` only overrides the configured map for one position. The platform drops a position
  without a map.
- **Validation first**: an invalid MAC, a latitude outside [-90, 90], a longitude outside [-180, 180], a missing
  map or an invalid timestamp returns `{ success: false, error }` without opening a socket.
- **Fire-and-forget**: `success: true` means the frame was handed to the socket. The broker sends no
  acknowledgement and no error frame. Use `client.positions.publish(…)` over HTTP for an acknowledged publish.
- **Merge effects**: when the MAC belongs to an asset, the frame is merged over the asset record for every
  consumer (subscribers, the position cache and history), so a field you send replaces the asset's value there.
  The record itself is not changed.
- **Batches**: `sendBatch()` sends one frame per position (the broker ignores arrays) and reports
  `{ success, sent, failed, errors }`. It does not wait for the socket buffer to drain, so split large batches
  into chunks.
- **Zone 0 still reaches the rule engine**: a position outside every zone produces zone-0 entry and counter
  events that the alert rules evaluate. When you publish test positions, make sure no enabled alert rule can match
  them.

## Unified client

`RtlsWebSocketClient` (also what `client.createWebSocket()` returns) owns a subscriber and, when `mapUuid` is set,
a publisher. It forwards every subscriber event under the same name and the publisher's lifecycle events as
`publisher:connected`, `publisher:disconnected`, `publisher:reconnecting`, `publisher:reconnected`,
`publisher:reconnect_failed` and `publisher:error`. `mapUuid` goes to the publisher only.

<!-- snippet: prelude=client -->
```ts
const ws = client.createWebSocket({ mapUuid: '11111111-2222-4333-8444-555555555555' });
ws.on('publisher:disconnected', ({ code }) => console.log('publisher closed', code));
await ws.connect({ subscriberOnly: true });
await ws.connect(); // now also the publisher
console.log(ws.getConnectionStatus().publisher?.state);
await ws.disconnect();
```

## Limits and close behaviour

| Cause | What the client sees |
|---|---|
| `disconnect()` | close 1000 (`WS_CLOSE_CODES.NORMAL_CLOSURE`) |
| a slow consumer (more than 16 MiB queued, or 30 s without write progress) or a frame over 16 MiB | close 1006 (`WS_CLOSE_CODES.ABNORMAL_CLOSURE`) without a reason |
| a broker restart or deploy | close 1006 for every client at once; jitter spreads the reconnects |
| a refused credential | per the [runtime table](#authentication) |

The broker sends no pings and has no idle timeout of its own; intermediaries may have one, which keepalive covers.
No application close codes (4xxx) are used: compare the `code` of `disconnected` and the `closeCode` of an error
with `WS_CLOSE_CODES` (`NORMAL_CLOSURE`, `GOING_AWAY`, `PROTOCOL_ERROR`, `NO_STATUS`, `ABNORMAL_CLOSURE`).

**Troubleshooting**

- *No messages*: check that `subscribe()` resolved, that the tag filter does not exclude the tags you expect (it
  applies to positions only), that tag-lost events and refetch hints need ALL, and that a client-side `mapUuid`
  is not filtering them out.
- *Close 1006 repeatedly*: the client is too slow to read (handle messages quickly, move work off the event
  handler) or a proxy drops idle connections (keep `keepAliveIntervalMs` on with `ws`).
- *Reconnect loop*: set `maxAttempts` and listen to `reconnect_failed`; check the credential and the URL.
- *Authentication errors look like network errors in the browser*: the browser hides the handshake status; test
  the credential with a REST call.

## Errors

All WebSocket errors extend `StreamError`, and so `RtlsError`: `RtlsError.is(err)` is true and `code` is the SDK
class code.

| Class | `code` | When |
|---|---|---|
| `WebSocketError` | `WEBSOCKET_ERROR` | base class; `closeCode` and `closeReason` describe the close that caused it |
| `WebSocketConnectionError` | `WEBSOCKET_CONNECTION_ERROR` | timeout (`Connection timeout`), network error, `Connection aborted by disconnect()`, `Max reconnection attempts (n) reached`, `Keepalive timeout` (`reason: 'idle_timeout'`), no implementation available, header auth without `ws`; `status` set for a refused handshake other than 401/403 |
| `WebSocketAuthenticationError` | `WEBSOCKET_AUTHENTICATION_ERROR` | no credential (status 0, thrown by the constructor), a credential function that throws (status 0), a handshake answered 401 or 403 |
| `WebSocketSubscriptionError` | `WEBSOCKET_SUBSCRIPTION_ERROR` | not connected, invalid types or tag ids, no confirmation in time, closed before the confirmation, send failure (`cause`) |
| `WebSocketSendError` | `WEBSOCKET_SEND_ERROR` | a frame could not be sent |

The constructors throw synchronously, before any socket: `ContextError` for a missing namespace or a publisher
without `mapUuid`, and `WebSocketAuthenticationError` (`status` 0) when neither `apiKey` nor `token` is given.
`client.createWebSocket()` throws `ContextError` without a namespace, and `ValidationError` (`status` 0) when the
client has no API key or access token or when the broker URLs cannot be derived from its `baseUrl`. The publish
methods never throw: they return result objects.

<!-- snippet: prelude=subscriber -->
```ts
import { WebSocketAuthenticationError, WebSocketConnectionError } from 'ubudu-rtls-sdk';

try {
  await subscriber.connect();
} catch (err) {
  if (err instanceof WebSocketAuthenticationError) console.error('credential refused', err.status);
  else if (err instanceof WebSocketConnectionError) console.error('cannot connect:', err.message);
  else throw err;
}
```

## Upgrading from 0.2.0

The message types now use the field names on the wire, so code that read fields which never arrived changes:

- zone counters: `stats.total_count` → `stats.total` (also `total_tags`, `total_mobiles`, `avg_time*`, `zone`);
- zone events: `e.user_uuid` → `e.user_udid`; `zone` is a Feature, a stub or `null`; event types are
  `ENTER_ZONE` and `EXIT_ZONE`;
- alerts: `user_udid` is optional (absent on zone-triggered rules) and there is no `timestamp`;
- errors: the close code moved from `code` to `closeCode` and the close reason from `reason` to `closeReason`;
  `code` is now the SDK class code and `reason` the stream error reason;
- `unsubscribe()` now really stops delivery;
- the publisher no longer adds `model`, `color`, `user_name`, `device_info` or `origin`: pass `name`, `model`,
  `color` explicitly if you relied on them.

The [migration guide](migration-0.3.md) lists every change with before and after code.

## Protocol appendix

The SDK sends these frames on the subscriber socket (one JSON object each):

```json
{ "type": "SUBSCRIBE", "app_namespace": "<namespace>" }
{ "type": "SUBSCRIBE", "app_namespace": "<namespace>", "data_type_filter": ["POSITIONS", "ALERTS"] }
{ "type": "SUBSCRIBE", "app_namespace": "<namespace>", "uuids": ["025d4b000001"] }
{ "type": "UNSUBSCRIBE", "app_namespace": "<namespace>" }
{ "type": "FILTER_MGT", "app_namespace": "<namespace>", "uuids": ["025d4b000001"] }
```

The broker answers `SUBSCRIBE` only, with `{ "app_namespace": "<namespace>", "action": "subscribeEvent" }`;
`UNSUBSCRIBE` and `FILTER_MGT` get no reply. A `SUBSCRIBE` without `uuids` clears the tag filter.

On the publisher socket, one frame per position:

```json
{
  "app_namespace": "<namespace>",
  "user_uuid": "025d4b000001",
  "lat": 48.8566,
  "lon": 2.3522,
  "map_uuid": "<map uuid>",
  "timestamp": "<ISO 8601 UTC timestamp>",
  "user_name": "Forklift 1",
  "level": 0
}
```

## Examples

- [`08-websocket-subscriber`](../../examples/typescript/08-websocket-subscriber.ts) — subscribe and print a kinds
  histogram ([JavaScript](../../examples/javascript/08-websocket-subscriber.js)).
- [`09-websocket-publisher`](../../examples/typescript/09-websocket-publisher.ts) — validate and publish one position
  ([JavaScript](../../examples/javascript/09-websocket-publisher.js)).
- [`10-websocket-unified`](../../examples/typescript/10-websocket-unified.ts) — subscriber and publisher on one
  client ([JavaScript](../../examples/javascript/10-websocket-unified.js)).
