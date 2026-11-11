# Recipes

Small end-to-end programs that combine several SDK domains. Each recipe has a page (what it builds, steps, example
output, pitfalls) and the same program in TypeScript and JavaScript under `examples/`. They need a namespace with a
venue, a map and zones, and the repository examples set up as in [examples/README.md](../../examples/README.md).

Every recipe is read-only by default. Recipes 21 and 24 also have a write section that runs only with `--write`;
everything it creates is named `sdk-test-<runId>-…` and removed before the program exits.

| # | Recipe | Scenario | SDK calls | Read-only or `--write` | Example files |
|---|---|---|---|---|---|
| 20 | [Asset tracking view](./asset-tracking-view.md) | a "where is everything" table: each asset with its zone, the age of its last position and its coordinates, plus counts per zone kept live for a few seconds | `venues.list()`, `venues.listMaps()`, `zones.listAsArray()`, `assets.list()`, `positions.listCached()`, WebSocket `POSITIONS` | read-only (`--seconds`, `--out`) | [TypeScript](../../examples/typescript/20-asset-tracking-view.ts), [JavaScript](../../examples/javascript/20-asset-tracking-view.js) |
| 21 | [Geofence alert to notification](./geofence-alert-to-notification.md) | watch zone entries and alerts and turn one of them into an in-app notification | `zones.listAsArray()`, `alerts.list()`, `notifications.unreadCount()`, WebSocket `ZONES_ENTRIES_EVENTS` and `ALERTS`; write: `notifications.cleanupPolicy.get()`, `notifications.send()`, `notifications.get()`, `notifications.bulk()` | read-only (`--seconds`); `--write` sends one notification to your own user and deletes it | [TypeScript](../../examples/typescript/21-geofence-alert-to-notification.ts), [JavaScript](../../examples/javascript/21-geofence-alert-to-notification.js) |
| 22 | [Zone presence report](./zone-presence-report.md) | dwell time per asset and zone over the last hours, as CSV | `positions.listCached()`, `applyFilters()`, `zones.getPresence()` | read-only (`--hours`, `--interval`, `--type`, `--max-assets`, `--out`) | [TypeScript](../../examples/typescript/22-zone-presence-report.ts), [JavaScript](../../examples/javascript/22-zone-presence-report.js) |
| 23 | [Indoor routing](./indoor-routing.md) | shortest path, a multi-stop tour, the nearest POI of a type and an evacuation route, each checked against the venue's path nodes | `venues.listPathNodes()`, `venues.listPois()`, `navigation.shortestPath()`, `navigation.multiStop()`, `navigation.nearestPoi()`, `navigation.evacuationRoute()` | read-only | [TypeScript](../../examples/typescript/23-indoor-routing.ts), [JavaScript](../../examples/javascript/23-indoor-routing.js) |
| 24 | [Bulk declared location](./bulk-declared-location.md) | declare one shared location for a set of assets in one call, then clear it | read: target point and plan; write: `assets.create()`, `declaredLocations.bulkDeclare()`, `declaredLocations.bulkClear()`, `assets.delete()` | read-only prints the plan; `--write` creates one test asset, declares and clears its location, deletes it | [TypeScript](../../examples/typescript/24-bulk-declared-location.ts), [JavaScript](../../examples/javascript/24-bulk-declared-location.js) |

Back to the [documentation index](../README.md).
