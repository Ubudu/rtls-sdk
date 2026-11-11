# Examples

Runnable examples of the Ubudu RTLS SDK (`ubudu-rtls-sdk`), each in TypeScript and JavaScript with the same
number, the same steps and the same output lines. Examples 01–19 show one area of the SDK; examples 20 and up
are recipes, small end-to-end programs with a page under [docs/recipes](../docs/recipes/README.md).

Every example is read-only by default. A few have a write section that runs only when started with `--write`
and the tier variables of its first line (see [Write sections](#write-sections)); everything it creates is named
`sdk-test-<runId>-…` (test MACs start with `025d4b`) and removed before it exits, except the positions and
notifications of a tier-S section.

## Index

The table is generated from [catalogue.json](catalogue.json) (`node examples/run-all.mjs --write-index`);
do not edit it by hand.

<!-- catalogue:start -->
| # | Example | Main SDK calls | Guide | TypeScript | JavaScript | Write section |
|---|---|---|---|---|---|---|
| 01 | Getting started | createRtlsClient, health(), venues.list(), venues.listMaps(), assets.list(), positions.listCached(), isValidMac(), formatMac() | [getting-started.md](../docs/guides/getting-started.md) | [01-getting-started.ts](typescript/01-getting-started.ts) | [01-getting-started.js](javascript/01-getting-started.js) | read-only |
| 02 | Assets | assets.list() with filters, sort and key/value, assets.get(), getHistory(), assetTree.get(), dataModels.get(); write: create, update, batchSave, batchDelete, tagActions.send() | [assets.md](../docs/guides/assets.md) | [02-assets.ts](typescript/02-assets.ts) | [02-assets.js](javascript/02-assets.js) | `--write` tier W |
| 03 | Positions and spatial analysis | positions.listCached(), getCached(), getLast(), listLast(), getHistory(), query(); spatial.nearestZones(), zoneDistances(), analyzeCustomZones(), nearestAssets(), nearestAssetsRealtime(), poiStatistics(), analyzeCustomPois(); toEpochMs(); write: positions.publish() | [positions-spatial.md](../docs/guides/positions-spatial.md) | [03-positions-spatial.ts](typescript/03-positions-spatial.ts) | [03-positions-spatial.js](javascript/03-positions-spatial.js) | `--write` tier S (positions 1) |
| 04 | Indoor navigation | venues.listPathNodes(), listPathSegments(), navigation.shortestPath(), multiStop(), nearestPoi(), evacuationRoute() | [venues-navigation.md](../docs/guides/venues-navigation.md) | [04-navigation.ts](typescript/04-navigation.ts) | [04-navigation.js](javascript/04-navigation.js) | read-only |
| 05 | Error handling | typed errors: AuthenticationError, NotFoundError, ValidationError, ContextError, TimeoutError, AbortError, NetworkError; opt-in retry | [error-handling.md](../docs/guides/error-handling.md) | [05-error-handling.ts](typescript/05-error-handling.ts) | [05-error-handling.js](javascript/05-error-handling.js) | read-only |
| 06 | Pagination and filtering | assets.list() with key/value and filters, applyFilters, venues.iterate() with collectAll, assetDocuments.listPage() with paginateOffset, zones.list() filters, serializeFilters | [pagination-filtering.md](../docs/guides/pagination-filtering.md) | [06-pagination-filtering.ts](typescript/06-pagination-filtering.ts) | [06-pagination-filtering.js](javascript/06-pagination-filtering.js) | read-only |
| 07 | Default context | setVenue, setContext, forNamespace, forVenue, forMap, withContext, clearContext, per-call overrides, per-call level, ContextError | [getting-started.md](../docs/guides/getting-started.md) | [07-default-context.ts](typescript/07-default-context.ts) | [07-default-context.js](javascript/07-default-context.js) | read-only |
| 08 | WebSocket subscriber | client.createWebSocket(), connect(), subscribe() by kind or tag, on(), getConnectionStatus(), getActiveSubscriptions(), unsubscribe(), getSubscription(), disconnect() | [websocket.md](../docs/guides/websocket.md) | [08-websocket-subscriber.ts](typescript/08-websocket-subscriber.ts) | [08-websocket-subscriber.js](javascript/08-websocket-subscriber.js) | read-only |
| 09 | WebSocket publisher | client.createWebSocket(), connect(), sendPosition() only with --write and --map/--lat/--lon | [websocket.md](../docs/guides/websocket.md) | [09-websocket-publisher.ts](typescript/09-websocket-publisher.ts) | [09-websocket-publisher.js](javascript/09-websocket-publisher.js) | `--write` tier S |
| 10 | WebSocket unified client | client.createWebSocket({ mapUuid }), isSubscriberConnected(), isPublisherConnected(), subscribe(), setTagFilter(), sendPosition(), publisher events | [websocket.md](../docs/guides/websocket.md) | [10-websocket-unified.ts](typescript/10-websocket-unified.ts) | [10-websocket-unified.js](javascript/10-websocket-unified.js) | `--write` tier S (positions 1) |
| 11 | Asset documents | assetDocuments.listPage(), list(); write: upload(), waitForJob(), download(), delete() | [assets.md](../docs/guides/assets.md) | [11-asset-documents.ts](typescript/11-asset-documents.ts) | [11-asset-documents.js](javascript/11-asset-documents.js) | `--write` tier W |
| 12 | Declared location | assets.list() declared locations; write: declaredLocations.bulkDeclare(), bulkClear() | [assets.md](../docs/guides/assets.md) | [12-declared-location.ts](typescript/12-declared-location.ts) | [12-declared-location.js](javascript/12-declared-location.js) | `--write` tier S (positions 1) |
| 13 | Venues and maps | venues.list(), get(), listMaps(), listPoisAsArray(), listPathNodes(), listPaths(), zones.listAsArray(), zones.getPresence() | [venues-navigation.md](../docs/guides/venues-navigation.md) | [13-venues-maps.ts](typescript/13-venues-maps.ts) | [13-venues-maps.js](javascript/13-venues-maps.js) | read-only |
| 14 | Dashboards | dashboards.listCreated(), listShared(), listSelected(), list(), get(); write: create(), update(), share(), unshare(), delete() | [dashboards-alert-rules.md](../docs/guides/dashboards-alert-rules.md) | [14-dashboards.ts](typescript/14-dashboards.ts) | [14-dashboards.js](javascript/14-dashboards.js) | `--write` tier W |
| 15 | Alert rules | alertRules.get(), validateAlertRuleSet(), alerts.list(), settings.get(); write: upsertRule(), setRuleEnabled(), removeRule(), replace() to restore | [dashboards-alert-rules.md](../docs/guides/dashboards-alert-rules.md) | [15-alert-rules.ts](typescript/15-alert-rules.ts) | [15-alert-rules.js](javascript/15-alert-rules.js) | `--write` tier C |
| 16 | Notifications | notifications.unreadCount(), list(), listPage(), iterate(), listGroups(), facets(), export(), rules, connections, saved views; write: sendToSelf(), updateMission(), acknowledge(), pin(), unpin(), snooze(), bulk(), undo() | [notifications.md](../docs/guides/notifications.md) | [16-notifications.ts](typescript/16-notifications.ts) | [16-notifications.js](javascript/16-notifications.js) | `--write` tier S (notifications 1) |
| 17 | Notifications stream | notifications.stream() events, unreadCount() refresh | [notifications.md](../docs/guides/notifications.md) | [17-notifications-stream.ts](typescript/17-notifications-stream.ts) | [17-notifications-stream.js](javascript/17-notifications-stream.js) | read-only |
| 18 | ETL import | etl.mappingProfiles.list(), listAll(), get(), etl.parseHeaders(), etl.activities.listPage() with paginatePages(), iterate(); write: mappingProfiles create/update/delete, dry-run etl.upload() | [etl.md](../docs/guides/etl.md) | [18-etl-import.ts](typescript/18-etl-import.ts) | [18-etl-import.js](javascript/18-etl-import.js) | `--write` tier W |
| 20 | [Asset tracking view](../docs/recipes/asset-tracking-view.md) | venues.list(), zones.listAsArray(), assets.list(), positions.listCached() joined by udid; live POSITIONS subscription | [positions-spatial.md](../docs/guides/positions-spatial.md) | [20-asset-tracking-view.ts](typescript/20-asset-tracking-view.ts) | [20-asset-tracking-view.js](javascript/20-asset-tracking-view.js) | read-only |
| 21 | [Geofence alert to notification](../docs/recipes/geofence-alert-to-notification.md) | alerts.list(), zone events over WebSocket, notifications.send() to the key's own user (sendToSelf() does it in one call), notifications.bulk() cleanup | [notifications.md](../docs/guides/notifications.md) | [21-geofence-alert-to-notification.ts](typescript/21-geofence-alert-to-notification.ts) | [21-geofence-alert-to-notification.js](javascript/21-geofence-alert-to-notification.js) | `--write` tier S (notifications 1) |
| 22 | [Zone presence report](../docs/recipes/zone-presence-report.md) | positions.listCached(), zones.getPresence() per asset, dwell per zone as CSV | [venues-navigation.md](../docs/guides/venues-navigation.md) | [22-zone-presence-report.ts](typescript/22-zone-presence-report.ts) | [22-zone-presence-report.js](javascript/22-zone-presence-report.js) | read-only |
| 23 | [Indoor routing](../docs/recipes/indoor-routing.md) | venues.listPathNodes(), navigation.shortestPath(), multiStop(), nearestPoi(), evacuationRoute() | [venues-navigation.md](../docs/guides/venues-navigation.md) | [23-indoor-routing.ts](typescript/23-indoor-routing.ts) | [23-indoor-routing.js](javascript/23-indoor-routing.js) | read-only |
| 24 | [Bulk declared location](../docs/recipes/bulk-declared-location.md) | discover(), safePublishPoint(), assets.create(), declaredLocations.bulkDeclare() and bulkClear(), assets.delete() | [assets.md](../docs/guides/assets.md) | [24-bulk-declared-location.ts](typescript/24-bulk-declared-location.ts) | [24-bulk-declared-location.js](javascript/24-bulk-declared-location.js) | `--write` tier S (positions 1) |
<!-- catalogue:end -->

## Setup

1. From the repository root, install and build the SDK, then install the examples package (it links
   `ubudu-rtls-sdk` to the repository build):

   ```bash
   npm ci
   npm run build
   npm run examples:install
   ```

2. Create a `.env` file in the repository root (never commit it):

   ```bash
   APP_NAMESPACE=your-namespace
   RTLS_API_KEY=your-api-key
   # optional, defaults to https://rtls.ubudu.com/api
   RTLS_BASE_URL=https://rtls.ubudu.com/api
   ```

   Variables already set in the environment win over the file. A missing variable stops an example with
   `CONFIG MISSING: <names>` (exit 3).

The namespace should have at least one venue with a map and zones; most examples print `SKIPPED: no-fixture …`
when something they need is absent. The runners accept a skip of a read-only run only when the example's first
line lists its category (`read skips …`); any other skip counts as a failure.

## Running examples

Run one or more examples by number through the guarded runner (it builds the SDK first and runs both
languages):

```bash
npm run examples:check -- 01 05
npm run examples:check -- 23 --lang ts
```

Run the whole catalogue read-only, or list it:

```bash
npm run examples:all
node examples/run-all.mjs --list
node examples/run-all.mjs --only 20,22 --lang js
```

To run a single file directly while you work on it, start it from the `examples/` folder (read-only):

```bash
cd examples
npx tsx typescript/01-getting-started.ts
node javascript/01-getting-started.js
```

Some examples take options, for example `--seconds 10` for the length of a WebSocket subscription or
`--out <file>` for a recipe's output file. An output file holds data of your namespace: keep it out of version
control.

## Output

Each example prints what it does and ends with one marker line:

| Last line | Meaning | Exit code |
|---|---|---|
| `DONE <id>-<name>` | every step succeeded | 0 |
| `SKIPPED: <category> <text>` | a precondition is not met; categories `feature-off`, `role`, `tier`, `no-fixture`, `preflight` | 0 |
| `FAILED <id>: <error>` | a step failed (no stack trace, no credentials) | 1 |
| `FAILED <id>: <error>` after `restore differs at …` or `restore failed …` | a tier-C section could not restore the namespace configuration (example 15) | 4 |

A write section prints `BUDGET positions=<n> notifications=<n> ble=<n> etl=<n>` after each call that
creates a position, sends a notification, triggers a BLE action or imports ETL data.

## Write sections

The first line of every example states what its write section does:

```text
// Write section: tier <W|C|S|none>; budget positions=<n> notifications=<n> ble=<n> etl=<n>; read skips <none|cat,cat>
```

- `tier none`: the example never writes.
- `tier W`: it creates and deletes its own `sdk-test-` entities.
- `tier C`: it changes namespace configuration and restores it.
- `tier S`: it has a visible side effect (a position, a notification) that cannot be undone completely; the
  recipe page lists what stays.

The budget counts what the write section does in a guarded `--write` run, which passes no other option. An
option named in an example's comment can add a call outside that budget, in your own run only: `--tag` in 02 sends
one BLE action and also needs `RTLS_IT_SIDE_EFFECTS=1`; `--map`, `--lat` and `--lon` in 09 publish one position.
The example's `BUDGET` line then counts it.

Run write sections through the guarded runners, with the tier variables set on the command line:

```bash
RTLS_IT_WRITES=1 npm run examples:check -- 02 --write
RTLS_IT_WRITES=1 RTLS_IT_SIDE_EFFECTS=1 npm run examples:check -- 24 --write
```

`--write` runs the TypeScript twin only. Every write pass needs `RTLS_IT_WRITES=1`; a tier-S example also needs
`RTLS_IT_SIDE_EFFECTS=1` and a tier-C example `RTLS_IT_CONFIG=1`, otherwise it is reported as skipped. Never
put these variables in `.env`.

A direct run with `--write` checks the same variables: without them it prints `SKIPPED: tier …` and writes
nothing. With them it writes at once, without the runners' budget ledger and leftover check, so keep direct
write runs to your own namespace.

## Writing a new example

- Use the next free number and the same `<id>-<name>` in `typescript/` and `javascript/`.
- Import the SDK from `ubudu-rtls-sdk` and the helpers (`runExample`, `loadConfig`, `testName`, `skip`,
  `reportBudget`, `discover`) from `../shared/`.
- Start with the `// Write section:` line, add the entry to `catalogue.json` and regenerate the index with
  `node examples/run-all.mjs --write-index`; `node examples/run-all.mjs --check-index` checks it.

## Further reading

- [Getting started](../docs/guides/getting-started.md)
- [Error handling](../docs/guides/error-handling.md)
- [Pagination and filtering](../docs/guides/pagination-filtering.md)
- [Documentation index](../docs/README.md)
