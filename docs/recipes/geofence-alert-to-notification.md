# Recipe: geofence alert to notification

## What you build

A small service that watches zone entries and alerts and turns one of them into an in-app notification: it lists
the zones of the venue, summarises the alerts of the last week, listens to live zone events and alerts, picks
the triggering event and sends one notification of kind `alert` to your own user.

## Prerequisites

- A namespace with a venue, a map and zones, and the notification feature enabled.
- The read-only run needs nothing else. Sending (`--write`) delivers one real notification to your own inbox and
  deletes it again.

## Run it

```bash
cd examples
npm run ts -- typescript/21-geofence-alert-to-notification.ts --seconds 10
npm run js -- javascript/21-geofence-alert-to-notification.js --seconds 10
```

`--seconds` sets how long the recipe listens to live events (default 5, maximum 30).

## Steps

### 1. Zones of the venue

Zone ids in alerts and events are resolved to names from the venue's zones.

<!-- snippet: prelude=client -->
```ts
const [venue] = await client.venues.list();
client.setVenue(venue.id);
const zones = await client.zones.listAsArray();
const zoneNames = new Map(zones.map((z) => [z.id, z.name]));
console.log(zoneNames.size);
```

### 2. Alerts of the last week

`alerts.list()` reads the alerts stored for the namespace, newest first, bounded by `size` (server default 100).
Alerts are sparse, so a week is a useful window.

<!-- snippet: prelude=client -->
```ts
const now = Date.now();
const alerts = await client.alerts.list({ timestampFrom: now - 7 * 24 * 3600_000, timestampTo: now, size: 20 });
for (const a of alerts) console.log(a.zone.name ?? 'no zone', a.event.title);
```

### 3. Is the inbox there?

`unreadCount()` is the cheapest notification read. A namespace without the notification feature answers 404 with
a non-JSON body (known server issue USI-P9-2).

<!-- snippet: prelude=client -->
```ts
import { NotFoundError } from 'ubudu-rtls-sdk';

try {
  const { unread, needs_action } = await client.notifications.unreadCount();
  console.log(unread, needs_action);
} catch (err) {
  if (err instanceof NotFoundError && typeof err.body === 'string') console.log('notifications are not enabled');
  else throw err;
}
```

### 4. Live zone entries, exits and alerts

The subscription type `ZONES_ENTRIES_EVENTS` delivers `ENTER_ZONE` and `EXIT_ZONE` events. A position outside
every zone produces an `ENTER_ZONE` with `zone: null` (the "outside all zones" pseudo-zone).

<!-- snippet: prelude=client -->
```ts
import { SubscriptionType } from 'ubudu-rtls-sdk';

const ws = client.createWebSocket();
ws.on('ZONES_ENTRIES_EVENTS', (m) => {
  const id = m.zone?.properties.id ?? 0;
  console.log(m.event_type, id === 0 ? 'outside all zones' : id, m.user_name ?? 'an asset');
});
ws.on('ALERTS', (m) => console.log('alert', m.params ?? {}));
try {
  await ws.connect({ subscriberOnly: true });
  await ws.subscribe([SubscriptionType.ZONES_ENTRIES_EVENTS, SubscriptionType.ALERTS]);
  await new Promise((resolve) => setTimeout(resolve, 10_000));
} finally {
  await ws.disconnect();
}
```

### 5. Send the notification to yourself

`notifications.sendToSelf()` sends to exactly one recipient, your own user, and returns the created item. The SDK
reads your user id once per namespace and caches it; it raises `ResponseParseError` when it cannot find the id or
when the server creates no item. The recipe uses severity `warning`. Put the zone and asset context in `params`
(the server ignores top-level `zone` and `asset`), and leave `channels` out: external fan-out happens only for
listed channels.

<!-- snippet: prelude=client -->
```ts
const item = await client.notifications.sendToSelf({
  kind: 'alert',
  title: 'Zone entry: Loading dock',
  body: 'Forklift 12 entered Loading dock',
  severity: 'warning',
  params: { zone_id: 3, zone_name: 'Loading dock', source: 'my-service' },
});
console.log(item._id);
```

The repository example uses the explicit form, so that it also checks the `send` path: it reads your user id
from `notifications.cleanupPolicy.get()` (`user_id`) and calls `notifications.send()` with
`recipients: [{ target_type: 'user', id: user_id }]`, which returns an array of items.

Neither form is idempotent: the SDK never retries a send, and neither should you on a 429.

### 6. Delete it

There is no per-item delete route: a hard delete goes through `bulk` with explicit ids (never a filter).

<!-- snippet: prelude=client -->
```ts
const result = await client.notifications.bulk({ ids: ['65f0c0ffee0000000000abcd'], action: 'delete' });
console.log(result.affected);
```

## Example output

Illustrative, read-only run:

```text
zones: 10
alerts (7 days, max 20): 5
  zone Loading dock: 3
  zone Cold room: 2
  title Entered restricted zone: 5
unread notifications: 2 (needs action: 0)
  ENTER_ZONE Loading dock
  EXIT_ZONE outside all zones
live events in 5 s: 2 zone event(s), 0 alert(s)
trigger: live zone event
planned notification: kind alert, severity warning, title "sdk-test-1a2b3c4d-r21 Zone entry: Loading dock"
planned params: {"zone_id":3,"zone_name":"Loading dock","source":"sdk-recipe"}
read-only pass: nothing sent (start with --write to send it to your own user)
DONE 21-geofence-alert-to-notification
```

## Pitfalls

- `notifications.send` is limited to 60 calls per 60 s for each user and namespace (`RateLimitError`,
  `retryAfter` in milliseconds).
- Explicit sends do not go through the namespace's forwarding rules or recipient mappings; rules apply to
  events, not to `send`.
- Zone events are delivered for every zone change, including into the "outside all zones" pseudo-zone; skip
  `zone: null` when you only care about real zones.
- Stored alerts exclude rule events of type `set_variable`.

## With `--write`

The write section sends exactly one notification (budget: notifications 1) titled
`sdk-test-<runId>-r21 Zone entry: <zone>`, to your own user, with no `channels`. It reads it back
(`kind`, `severity`, `title`), deletes it with `bulk({ ids: [id], action: 'delete' })` and checks that `get(id)`
then raises `NotFoundError`. If the send fails without returning an id, the recipe lists the newest 50 inbox
items and exits 1 if one of this run's items is there; the repository's sweeper removes it.

What stays: one send audit record, and the item was visible in the user's live web application while it
existed.

## Going further

- [Notifications guide](../guides/notifications.md): inbox states, groups, rules and the live stream.
- [WebSocket guide](../guides/websocket.md): subscriptions, reconnection, message types.
- [Dashboards and alert rules guide](../guides/dashboards-alert-rules.md): the rules that produce alerts.
- [All recipes](README.md)
