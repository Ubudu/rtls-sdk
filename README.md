# ubudu-rtls-sdk

Official TypeScript and JavaScript SDK for the Ubudu RTLS (real-time location system) REST and WebSocket API.

[![npm version](https://badge.fury.io/js/ubudu-rtls-sdk.svg)](https://www.npmjs.com/package/ubudu-rtls-sdk)

## Features

- ESM and CommonJS builds with TypeScript declarations; browsers use the package through a bundler.
- Typed results for every wrapped operation, with hand-written domain types where the API description is loose.
- A default context: set the namespace, venue, map and level once on the client, override them per call.
- One resource per domain: assets, positions and spatial queries, venues, zones and navigation, dashboards and
  alert rules, notifications, ETL imports.
- The three listing models of the API (page envelope, offset, full array) behind one naming scheme, with bounded
  iteration helpers.
- A filter DSL, and a local evaluator (`applyFilters`) that applies the same grammar to arrays you already hold.
- Real-time streaming: the WebSocket subscriber and publisher, and the notifications server-sent event stream.
- Typed errors that carry the real HTTP status, the server's message and code.
- Opt-in retries of idempotent requests.

## Requirements

- Node.js `>=20.3.0`; tested on Node 20, 22 and 24.
- WebSocket streaming on Node 20 needs the optional peer dependency `ws`; Node 22 and later have a global
  `WebSocket`.
- Bun 1.4.4 is verified as a consumer runtime of the published package (ESM and CommonJS imports and REST calls).
- Browsers, through a bundler: the SDK uses `fetch` (with streamed response bodies for the notification stream),
  `AbortController`, timers, `FormData` and `Blob` for uploads, `TextDecoder`, and `WebSocket` for streaming.
  Cross-origin code cannot read some response headers (see
  [Runtime support](https://github.com/ubudu/rtls-sdk/blob/main/docs/guides/getting-started.md#10-runtime-support)).

## Install

```bash
npm install ubudu-rtls-sdk
# Node 20 only, for WebSocket streaming:
npm install ws
```

## Quick start

```ts
import { createRtlsClient } from 'ubudu-rtls-sdk';

const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: process.env.APP_NAMESPACE });

const [venue] = await client.venues.list();
client.setVenue(venue.id);

const positions = await client.positions.listCached();
for (const p of positions) {
  const zone = p.zone && p.zone.id !== 0 ? p.zone.name : 'outside all zones';
  console.log(p.user_name, zone, p.timestamp);
}
```

JavaScript (ESM) is the same code without types:

```js
import { createRtlsClient } from 'ubudu-rtls-sdk';

const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: process.env.APP_NAMESPACE });
const assets = await client.assets.list();
console.log(`${assets.length} asset(s)`);
```

CommonJS:

```js
const { createRtlsClient } = require('ubudu-rtls-sdk');

const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: process.env.APP_NAMESPACE });
client.health().then((h) => console.log(h.status));
```

The namespace and the API key come from the profile settings of the RTLS web application; the
[getting started guide](https://github.com/ubudu/rtls-sdk/blob/main/docs/guides/getting-started.md) shows where.
Read them from the environment or a secret store, never from source code.

## Authentication

Pass `apiKey` (sent as `X-API-Key`) or `accessToken` (sent as `Authorization: Bearer`). The SDK sends exactly one
credential header: when both are set, the Bearer token wins unless `auth: 'apiKey'` says otherwise. Details in the
[getting started guide](https://github.com/ubudu/rtls-sdk/blob/main/docs/guides/getting-started.md#4-authentication).

## Resources

| Property | What it covers | Guide |
|---|---|---|
| `client.assets` | asset records: list, get, create, update, delete, batch save and delete, change history | [Assets](https://github.com/ubudu/rtls-sdk/blob/main/docs/guides/assets.md) |
| `client.assetDocuments` | documents attached to an asset: list, upload, download, delete | [Assets](https://github.com/ubudu/rtls-sdk/blob/main/docs/guides/assets.md) |
| `client.assetTree` | the asset tree of the namespace (read) | [Assets](https://github.com/ubudu/rtls-sdk/blob/main/docs/guides/assets.md) |
| `client.dataModels` | the asset data model of the namespace (read) | [Assets](https://github.com/ubudu/rtls-sdk/blob/main/docs/guides/assets.md) |
| `client.declaredLocations` | declare and clear the location of assets in bulk | [Assets](https://github.com/ubudu/rtls-sdk/blob/main/docs/guides/assets.md) |
| `client.tagActions` | BLE tag actions | [Assets](https://github.com/ubudu/rtls-sdk/blob/main/docs/guides/assets.md) |
| `client.positions` | cached, last and historical positions, position publishing, Elasticsearch queries | [Positions and spatial](https://github.com/ubudu/rtls-sdk/blob/main/docs/guides/positions-spatial.md) |
| `client.spatial` | zones and POIs at, near or around a point, nearest assets, custom zone and POI analysis | [Positions and spatial](https://github.com/ubudu/rtls-sdk/blob/main/docs/guides/positions-spatial.md) |
| `client.venues` | venues, maps, POIs, path nodes and segments | [Venues and navigation](https://github.com/ubudu/rtls-sdk/blob/main/docs/guides/venues-navigation.md) |
| `client.zones` | zones of a venue or map, zone presence | [Venues and navigation](https://github.com/ubudu/rtls-sdk/blob/main/docs/guides/venues-navigation.md) |
| `client.navigation` | shortest, accessible and multi-stop paths, nearest POI, evacuation routes | [Venues and navigation](https://github.com/ubudu/rtls-sdk/blob/main/docs/guides/venues-navigation.md) |
| `client.dashboards` | dashboards: list, create, update, share, delete | [Dashboards and alert rules](https://github.com/ubudu/rtls-sdk/blob/main/docs/guides/dashboards-alert-rules.md) |
| `client.alerts` | fired alert events | [Dashboards and alert rules](https://github.com/ubudu/rtls-sdk/blob/main/docs/guides/dashboards-alert-rules.md) |
| `client.alertRules` | the alert rule set: read, validate, replace, edit one rule | [Dashboards and alert rules](https://github.com/ubudu/rtls-sdk/blob/main/docs/guides/dashboards-alert-rules.md) |
| `client.settings` | namespace settings (read) | [Dashboards and alert rules](https://github.com/ubudu/rtls-sdk/blob/main/docs/guides/dashboards-alert-rules.md) |
| `client.notifications` | notification inbox, triage, bulk changes, sending, rules, connections, live stream | [Notifications](https://github.com/ubudu/rtls-sdk/blob/main/docs/guides/notifications.md) |
| `client.etl` | CSV and Excel imports that update existing assets, mapping profiles, activity log | [ETL](https://github.com/ubudu/rtls-sdk/blob/main/docs/guides/etl.md) |
| `client.health()` | API health check | [Getting started](https://github.com/ubudu/rtls-sdk/blob/main/docs/guides/getting-started.md) |
| `client.createWebSocket()`, `RtlsWebSocketSubscriber`, `RtlsWebSocketPublisher` | real-time streaming | [WebSocket](https://github.com/ubudu/rtls-sdk/blob/main/docs/guides/websocket.md) |

Every method takes the context per call in its last parameter (`{ namespace, venueId, mapId, level }`, plus
`signal`, `timeoutMs` and `headers`); a call that needs a namespace, venue or map that neither the call nor the
client provides throws `ContextError` before sending anything.

## Errors

Every error is an `RtlsError`; its class tells what happened and `status` is the real HTTP status (`0` when no
response was received).

```ts
import { createRtlsClient, NotFoundError, RtlsError } from 'ubudu-rtls-sdk';

const client = createRtlsClient({ apiKey: process.env.RTLS_API_KEY, namespace: process.env.APP_NAMESPACE });

try {
  await client.assets.get('025d4b000001');
} catch (err) {
  if (err instanceof NotFoundError) console.log('no such asset');
  else if (err instanceof RtlsError) console.log(err.status, err.code, err.apiCode, err.message);
  else throw err;
}
```

Classes, fields, timeouts, cancellation and the retry policy:
[error handling guide](https://github.com/ubudu/rtls-sdk/blob/main/docs/guides/error-handling.md).

## Pagination and filtering

List methods return arrays, `listPage()` returns one page, `iterate()` walks every page lazily, and `collectAll()`
bounds an iteration. Filters are built with `filters.*`:

<!-- snippet: prelude=client -->
```ts
import { collectAll, filters } from 'ubudu-rtls-sdk';

const forklifts = await client.assets.list({
  filters: filters.equals('user_type', 'forklift'),
  sort: 'user_name:asc',
  limit: 10,
});
const unread = await collectAll(client.notifications.iterate({ state: 'unread' }), { maxItems: 100 });
console.log(forklifts.length, unread.length);
```

The listing model of each method, the operator table and the server grammar's pitfalls:
[pagination and filtering guide](https://github.com/ubudu/rtls-sdk/blob/main/docs/guides/pagination-filtering.md).

## Streaming

The WebSocket subscriber delivers positions, zone entries and exits, zone counters, alerts and asset changes as
they happen. `client.createWebSocket()` reuses the client's namespace, credential and base URL:

<!-- snippet: prelude=client -->
```ts
const ws = client.createWebSocket();

ws.on('POSITIONS', (p) => console.log(p.user_uuid, p.lat, p.lon));
ws.on('ALERTS', (alert) => console.log(alert.params?.title));

await ws.connect();
await ws.subscribe(['POSITIONS', 'ALERTS']);
// … later
await ws.disconnect();
```

The notification inbox has its own server-sent event stream; abort its signal to close it:

<!-- snippet: prelude=client -->
```ts
const controller = new AbortController();
setTimeout(() => controller.abort(), 30_000);

for await (const event of client.notifications.stream({ signal: controller.signal })) {
  if (event.type === 'item') console.log('new notification', event.data.title);
}
```

Subscriptions, publishing positions, reconnection and message types:
[WebSocket guide](https://github.com/ubudu/rtls-sdk/blob/main/docs/guides/websocket.md);
the inbox stream: [notifications guide](https://github.com/ubudu/rtls-sdk/blob/main/docs/guides/notifications.md).

## Examples

The repository has runnable examples for every domain, in TypeScript and JavaScript with the same number and the
same output, plus recipes that combine several domains (asset tracking view, geofence alert to notification, zone
presence report, indoor routing, bulk declared location). They are read-only unless started with `--write`.

```bash
git clone https://github.com/ubudu/rtls-sdk.git && cd rtls-sdk
npm ci && npm run build && npm run examples:install
# create .env at the repository root with APP_NAMESPACE and RTLS_API_KEY, then:
cd examples
npm run ts -- typescript/01-getting-started.ts
```

Index: [examples/README.md](https://github.com/ubudu/rtls-sdk/blob/main/examples/README.md);
recipes: [docs/recipes](https://github.com/ubudu/rtls-sdk/blob/main/docs/recipes/README.md).

## Migrating from 0.2

0.3.0 changes error statuses (a 400 now reports 400), the field names of several WebSocket message types,
navigation signatures (navigation now works) and the minimum Node version; deprecated names keep working until
0.4.0. The
[migration guide](https://github.com/ubudu/rtls-sdk/blob/main/docs/guides/migration-0.3.md) lists every change
with before and after code, and the
[changelog](https://github.com/ubudu/rtls-sdk/blob/main/CHANGELOG.md) summarises the release.

## API reference and endpoint coverage

- [API reference](https://github.com/ubudu/rtls-sdk/blob/main/docs/api/README.md): how the reference is
  organised, the shared utilities, and the generated reference of every exported class, function and type.
- [Endpoint coverage](https://github.com/ubudu/rtls-sdk/blob/main/docs/api/endpoint-coverage.md): every operation of
  the RTLS API with the SDK method that wraps it, or the reason it is not wrapped.

## Development

The development tooling needs Node.js 20.19 or later (live test runs: Node 22 or later).

```bash
npm ci          # install; generates the API types from the vendored spec
npm test        # unit tests
npm run build   # dist/ (ESM, CommonJS, declarations)
```

Continuous integration, GitHub mirroring and npm publishing:
[release setup](https://github.com/ubudu/rtls-sdk/blob/main/docs/guides/release-setup.md).

## Licence

MIT, see [LICENSE](https://github.com/ubudu/rtls-sdk/blob/main/LICENSE).

## Links

- [Documentation index](https://github.com/ubudu/rtls-sdk/blob/main/docs/README.md)
- [RTLS API documentation](https://rtls.ubudu.com/api/docs)
- [Issues](https://github.com/ubudu/rtls-sdk/issues)
- [Ubudu](https://www.ubudu.com)
